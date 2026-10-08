import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  normalizeAchievementIds,
  type AchievementId,
} from '../shared/achievements.ts';
import {
  normalizeCommendationCounts,
  type CommendationCounts,
  type CommendationId,
} from '../shared/badges.ts';

const DATABASE_SCHEMA_VERSION = 1;
const LEGACY_ACCOUNT_FILE_VERSIONS = new Set([1, 2, 3]);
const PASSWORD_KEY_LENGTH = 64;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_SESSIONS_PER_ACCOUNT = 5;
const DUMMY_SALT = 'danger-noodle-invalid-account';

export type AccountProfile = {
  id: string;
  username: string;
  createdAt: string;
  commendations: CommendationCounts;
  achievements: AchievementId[];
};

type AccountRow = {
  id: string;
  username: string;
  normalized_username: string;
  password_salt: string;
  password_hash: string;
  created_at: string;
};

type LegacyAccountSession = {
  tokenHash: string;
  createdAt: string;
};

type LegacyStoredAccount = AccountProfile & {
  normalizedUsername: string;
  passwordSalt: string;
  passwordHash: string;
  sessions: LegacyAccountSession[];
};

type LegacyAccountFile = {
  version: number;
  accounts: LegacyStoredAccount[];
};

export class AccountError extends Error {
  readonly code:
    | 'invalid-username'
    | 'invalid-password'
    | 'username-taken'
    | 'invalid-credentials';

  constructor(
    code:
      | 'invalid-username'
      | 'invalid-password'
      | 'username-taken'
      | 'invalid-credentials',
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function normalizeUsername(username: string) {
  return username.toLocaleLowerCase('en-US');
}

export function validateAccountUsername(value: unknown) {
  if (typeof value !== 'string')
    throw new AccountError(
      'invalid-username',
      'Username must be between 3 and 16 characters.',
    );
  const username = value.replace(/\s+/g, ' ').trim();
  if (
    username.length < 3 ||
    username.length > 16 ||
    !/^[a-zA-Z0-9 _-]+$/.test(username)
  )
    throw new AccountError(
      'invalid-username',
      'Use 3–16 letters, numbers, spaces, underscores, or hyphens.',
    );
  return username;
}

function validatePassword(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128)
    throw new AccountError(
      'invalid-password',
      'Password must be between 8 and 128 characters.',
    );
  return value;
}

function derivePassword(password: string, salt: string) {
  return new Promise<Buffer>((resolvePromise, reject) => {
    scrypt(
      password,
      salt,
      PASSWORD_KEY_LENGTH,
      { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolvePromise(key)),
    );
  });
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function validateLegacyFile(value: unknown, filePath: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid legacy account store at ${filePath}`);
  const file = value as LegacyAccountFile;
  if (
    !LEGACY_ACCOUNT_FILE_VERSIONS.has(file.version) ||
    !Array.isArray(file.accounts)
  )
    throw new Error(`Unsupported legacy account store at ${filePath}`);
  for (const account of file.accounts) {
    if (
      typeof account.id !== 'string' ||
      typeof account.username !== 'string' ||
      typeof account.normalizedUsername !== 'string' ||
      typeof account.passwordSalt !== 'string' ||
      typeof account.passwordHash !== 'string' ||
      typeof account.createdAt !== 'string' ||
      normalizeUsername(account.username) !== account.normalizedUsername ||
      !Array.isArray(account.sessions)
    )
      throw new Error(`Invalid legacy account store at ${filePath}`);
    for (const session of account.sessions)
      if (
        typeof session.tokenHash !== 'string' ||
        typeof session.createdAt !== 'string'
      )
        throw new Error(`Invalid legacy account store at ${filePath}`);
  }
  return file;
}

export class AccountStore {
  readonly databasePath: string;
  readonly legacyJsonPath: string;
  private readonly database: DatabaseSync;

  constructor(databasePath?: string, legacyJsonPath?: string) {
    const resolvedLegacyJsonPath =
      legacyJsonPath ||
      process.env.ACCOUNTS_FILE ||
      resolve(process.cwd(), 'data', 'accounts.json');
    const resolvedDatabasePath =
      databasePath ||
      process.env.ACCOUNTS_DB_FILE ||
      resolve(dirname(resolvedLegacyJsonPath), 'accounts.sqlite');
    this.databasePath = resolvedDatabasePath;
    this.legacyJsonPath = resolvedLegacyJsonPath;
    mkdirSync(dirname(resolvedDatabasePath), { recursive: true });
    this.database = new DatabaseSync(resolvedDatabasePath);
    this.database.exec('PRAGMA foreign_keys = ON');
    this.database.exec('PRAGMA journal_mode = DELETE');
    this.database.exec('PRAGMA synchronous = FULL');
    this.database.exec('PRAGMA busy_timeout = 5000');
    this.initializeSchema();
    chmodSync(resolvedDatabasePath, 0o600);
    if (existsSync(resolvedLegacyJsonPath)) {
      try {
        this.migrateLegacyJson(resolvedLegacyJsonPath);
      } catch (error) {
        this.database.close();
        throw error;
      }
    }
  }

  isUsernameRegistered(username: string) {
    return Boolean(
      this.database
        .prepare('SELECT 1 FROM accounts WHERE normalized_username = ? LIMIT 1')
        .get(normalizeUsername(username.trim())),
    );
  }

  async register(usernameValue: unknown, passwordValue: unknown) {
    const username = validateAccountUsername(usernameValue);
    const password = validatePassword(passwordValue);
    const normalizedUsername = normalizeUsername(username);
    if (this.isUsernameRegistered(username))
      throw new AccountError(
        'username-taken',
        'That username is already saved.',
      );

    const passwordSalt = randomBytes(16).toString('base64url');
    const passwordHash = (
      await derivePassword(password, passwordSalt)
    ).toString('base64url');
    if (this.isUsernameRegistered(username))
      throw new AccountError(
        'username-taken',
        'That username is already saved.',
      );

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    let token = '';
    try {
      this.transaction(() => {
        this.database
          .prepare(
            `INSERT INTO accounts (
              id, username, normalized_username, password_salt,
              password_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            username,
            normalizedUsername,
            passwordSalt,
            passwordHash,
            createdAt,
          );
        token = this.addSession(id);
      });
    } catch (error) {
      if (this.isUsernameRegistered(username))
        throw new AccountError(
          'username-taken',
          'That username is already saved.',
        );
      throw error;
    }
    const account = this.profileById(id);
    if (!account) throw new Error('Created account could not be loaded');
    return { account, token };
  }

  async login(usernameValue: unknown, passwordValue: unknown) {
    const username = validateAccountUsername(usernameValue);
    const password = validatePassword(passwordValue);
    const account = this.database
      .prepare('SELECT * FROM accounts WHERE normalized_username = ? LIMIT 1')
      .get(normalizeUsername(username)) as AccountRow | undefined;
    const derived = await derivePassword(
      password,
      account?.password_salt ?? DUMMY_SALT,
    );
    const storedHash = account
      ? Buffer.from(account.password_hash, 'base64url')
      : Buffer.alloc(PASSWORD_KEY_LENGTH);
    if (
      !account ||
      storedHash.length !== derived.length ||
      !timingSafeEqual(storedHash, derived)
    )
      throw new AccountError(
        'invalid-credentials',
        'Username or password is incorrect.',
      );

    let token = '';
    this.transaction(() => {
      token = this.addSession(account.id);
    });
    const profile = this.profileById(account.id);
    if (!profile) throw new Error('Authenticated account could not be loaded');
    return { account: profile, token };
  }

  accountForSession(token: string | null | undefined) {
    if (!token || token.length > 256) return null;
    const cutoff = new Date(Date.now() - SESSION_LIFETIME_MS).toISOString();
    const row = this.database
      .prepare(
        `SELECT accounts.id
         FROM account_sessions
         JOIN accounts ON accounts.id = account_sessions.account_id
         WHERE account_sessions.token_hash = ?
           AND account_sessions.created_at >= ?
         LIMIT 1`,
      )
      .get(hashToken(token), cutoff) as { id: string } | undefined;
    return row ? this.profileById(row.id) : null;
  }

  revokeSession(token: string | null | undefined) {
    if (!token || token.length > 256) return false;
    const result = this.database
      .prepare('DELETE FROM account_sessions WHERE token_hash = ?')
      .run(hashToken(token));
    return result.changes > 0;
  }

  addCommendations(accountId: string, additions: CommendationCounts) {
    if (!this.accountExists(accountId)) return null;
    const cleanAdditions = normalizeCommendationCounts(additions);
    const upsert = this.database.prepare(
      `INSERT INTO account_commendations (account_id, commendation_id, count)
       VALUES (?, ?, ?)
       ON CONFLICT (account_id, commendation_id)
       DO UPDATE SET count = count + excluded.count`,
    );
    this.transaction(() => {
      for (const [id, count] of Object.entries(cleanAdditions))
        upsert.run(accountId, id, count ?? 0);
    });
    return this.profileById(accountId);
  }

  unlockAchievements(accountId: string, achievementIds: AchievementId[]) {
    if (!this.accountExists(accountId)) return null;
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO account_achievements (
        account_id, achievement_id, unlocked_at
      ) VALUES (?, ?, ?)`,
    );
    const now = new Date().toISOString();
    this.transaction(() => {
      for (const id of normalizeAchievementIds(achievementIds))
        insert.run(accountId, id, now);
    });
    return this.profileById(accountId);
  }

  close() {
    this.database.close();
  }

  private initializeSchema() {
    const version = this.database.prepare('PRAGMA user_version').get() as {
      user_version: number;
    };
    if (version.user_version > DATABASE_SCHEMA_VERSION)
      throw new Error(
        `Account database schema ${version.user_version} is newer than supported schema ${DATABASE_SCHEMA_VERSION}`,
      );
    if (version.user_version === 0) {
      this.transaction(() => {
        this.database.exec(`
          CREATE TABLE accounts (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            normalized_username TEXT NOT NULL UNIQUE,
            password_salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
          ) STRICT
        `);
        this.database.exec(`
          CREATE TABLE account_sessions (
            token_hash TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
          ) STRICT
        `);
        this.database.exec(`
          CREATE TABLE account_commendations (
            account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            commendation_id TEXT NOT NULL,
            count INTEGER NOT NULL CHECK (count > 0),
            PRIMARY KEY (account_id, commendation_id)
          ) STRICT
        `);
        this.database.exec(`
          CREATE TABLE account_achievements (
            account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            achievement_id TEXT NOT NULL,
            unlocked_at TEXT NOT NULL,
            PRIMARY KEY (account_id, achievement_id)
          ) STRICT
        `);
        this.database.exec(`
          CREATE INDEX idx_account_sessions_account_created
          ON account_sessions(account_id, created_at)
        `);
        this.database.exec(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION}`);
      });
      this.database.exec('PRAGMA optimize');
    }
  }

  private migrateLegacyJson(filePath: string) {
    const file = validateLegacyFile(
      JSON.parse(readFileSync(filePath, 'utf8')) as unknown,
      filePath,
    );
    const findUsername = this.database.prepare(
      'SELECT id FROM accounts WHERE normalized_username = ? LIMIT 1',
    );
    const findId = this.database.prepare(
      'SELECT normalized_username FROM accounts WHERE id = ? LIMIT 1',
    );
    const insertAccount = this.database.prepare(
      `INSERT OR IGNORE INTO accounts (
        id, username, normalized_username, password_salt,
        password_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertSession = this.database.prepare(
      `INSERT OR IGNORE INTO account_sessions (
        token_hash, account_id, created_at
      ) VALUES (?, ?, ?)`,
    );
    const findSession = this.database.prepare(
      'SELECT account_id FROM account_sessions WHERE token_hash = ? LIMIT 1',
    );
    const setCommendation = this.database.prepare(
      `INSERT INTO account_commendations (
        account_id, commendation_id, count
      ) VALUES (?, ?, ?)
      ON CONFLICT (account_id, commendation_id)
      DO UPDATE SET count = excluded.count`,
    );
    const insertAchievement = this.database.prepare(
      `INSERT OR IGNORE INTO account_achievements (
        account_id, achievement_id, unlocked_at
      ) VALUES (?, ?, ?)`,
    );

    this.transaction(() => {
      for (const account of file.accounts) {
        const conflict = findUsername.get(account.normalizedUsername) as
          | { id: string }
          | undefined;
        if (conflict && conflict.id !== account.id)
          throw new Error(
            `Cannot migrate ${filePath}: username ${account.username} conflicts with an existing account`,
          );
        const idConflict = findId.get(account.id) as
          | { normalized_username: string }
          | undefined;
        if (
          idConflict &&
          idConflict.normalized_username !== account.normalizedUsername
        )
          throw new Error(
            `Cannot migrate ${filePath}: account ID ${account.id} conflicts with an existing account`,
          );
        insertAccount.run(
          account.id,
          account.username,
          account.normalizedUsername,
          account.passwordSalt,
          account.passwordHash,
          account.createdAt,
        );
        for (const session of account.sessions) {
          const sessionConflict = findSession.get(session.tokenHash) as
            | { account_id: string }
            | undefined;
          if (sessionConflict && sessionConflict.account_id !== account.id)
            throw new Error(
              `Cannot migrate ${filePath}: a session conflicts with an existing account`,
            );
          insertSession.run(session.tokenHash, account.id, session.createdAt);
        }
        for (const [id, count] of Object.entries(
          normalizeCommendationCounts(account.commendations),
        ))
          setCommendation.run(account.id, id, count ?? 0);
        for (const id of normalizeAchievementIds(account.achievements))
          insertAchievement.run(account.id, id, account.createdAt);
      }
    });
    unlinkSync(filePath);
    console.log(
      `Migrated ${file.accounts.length} account${file.accounts.length === 1 ? '' : 's'} from ${filePath} to ${this.databasePath}`,
    );
  }

  private accountExists(accountId: string) {
    return Boolean(
      this.database
        .prepare('SELECT 1 FROM accounts WHERE id = ? LIMIT 1')
        .get(accountId),
    );
  }

  private profileById(accountId: string): AccountProfile | null {
    const account = this.database
      .prepare('SELECT id, username, created_at FROM accounts WHERE id = ?')
      .get(accountId) as
      | { id: string; username: string; created_at: string }
      | undefined;
    if (!account) return null;
    const commendations = Object.fromEntries(
      (
        this.database
          .prepare(
            `SELECT commendation_id, count
             FROM account_commendations
             WHERE account_id = ?`,
          )
          .all(accountId) as {
          commendation_id: CommendationId;
          count: number;
        }[]
      ).map((row) => [row.commendation_id, row.count]),
    ) as CommendationCounts;
    const achievementRows = this.database
      .prepare(
        `SELECT achievement_id
         FROM account_achievements
         WHERE account_id = ?`,
      )
      .all(accountId) as { achievement_id: AchievementId }[];
    return {
      id: account.id,
      username: account.username,
      createdAt: account.created_at,
      commendations: normalizeCommendationCounts(commendations),
      achievements: normalizeAchievementIds(
        achievementRows.map((row) => row.achievement_id),
      ),
    };
  }

  private addSession(accountId: string) {
    const cutoff = new Date(Date.now() - SESSION_LIFETIME_MS).toISOString();
    this.database
      .prepare(
        `DELETE FROM account_sessions
         WHERE account_id = ? AND created_at < ?`,
      )
      .run(accountId, cutoff);
    const sessions = this.database
      .prepare(
        `SELECT token_hash
         FROM account_sessions
         WHERE account_id = ?
         ORDER BY created_at DESC`,
      )
      .all(accountId) as { token_hash: string }[];
    const remove = this.database.prepare(
      'DELETE FROM account_sessions WHERE token_hash = ?',
    );
    for (const session of sessions.slice(MAX_SESSIONS_PER_ACCOUNT - 1))
      remove.run(session.token_hash);

    const token = randomBytes(32).toString('base64url');
    this.database
      .prepare(
        `INSERT INTO account_sessions (token_hash, account_id, created_at)
         VALUES (?, ?, ?)`,
      )
      .run(hashToken(token), accountId, new Date().toISOString());
    return token;
  }

  private transaction<T>(operation: () => T) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    }
  }
}
