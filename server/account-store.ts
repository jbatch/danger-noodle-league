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
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  normalizeCommendationCounts,
  type CommendationCounts,
} from '../shared/badges.ts';
import {
  normalizeAchievementIds,
  type AchievementId,
} from '../shared/achievements.ts';

const ACCOUNT_FILE_VERSION = 3;
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

type AccountSession = {
  tokenHash: string;
  createdAt: string;
};

type StoredAccount = AccountProfile & {
  normalizedUsername: string;
  passwordSalt: string;
  passwordHash: string;
  sessions: AccountSession[];
};

type AccountFile = {
  version: number;
  accounts: StoredAccount[];
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

function publicProfile(account: StoredAccount): AccountProfile {
  return {
    id: account.id,
    username: account.username,
    createdAt: account.createdAt,
    commendations: { ...account.commendations },
    achievements: [...account.achievements],
  };
}

export class AccountStore {
  private readonly accounts = new Map<string, StoredAccount>();
  readonly filePath: string;

  constructor(
    filePath = process.env.ACCOUNTS_FILE ||
      resolve(process.cwd(), 'data', 'accounts.json'),
  ) {
    this.filePath = filePath;
    if (!existsSync(filePath)) return;
    const stored = JSON.parse(readFileSync(filePath, 'utf8')) as AccountFile;
    if (
      ![1, 2, ACCOUNT_FILE_VERSION].includes(stored.version) ||
      !Array.isArray(stored.accounts)
    )
      throw new Error(`Unsupported account store at ${filePath}`);
    for (const account of stored.accounts) {
      if (
        typeof account.id !== 'string' ||
        typeof account.username !== 'string' ||
        typeof account.normalizedUsername !== 'string' ||
        typeof account.passwordSalt !== 'string' ||
        typeof account.passwordHash !== 'string' ||
        !Array.isArray(account.sessions)
      )
        throw new Error(`Invalid account store at ${filePath}`);
      account.commendations = normalizeCommendationCounts(
        account.commendations,
      );
      account.achievements = normalizeAchievementIds(account.achievements);
      this.accounts.set(account.normalizedUsername, account);
    }
  }

  isUsernameRegistered(username: string) {
    return this.accounts.has(normalizeUsername(username.trim()));
  }

  async register(usernameValue: unknown, passwordValue: unknown) {
    const username = validateAccountUsername(usernameValue);
    const password = validatePassword(passwordValue);
    const normalizedUsername = normalizeUsername(username);
    if (this.accounts.has(normalizedUsername))
      throw new AccountError(
        'username-taken',
        'That username is already saved.',
      );

    const passwordSalt = randomBytes(16).toString('base64url');
    const passwordHash = (
      await derivePassword(password, passwordSalt)
    ).toString('base64url');
    if (this.accounts.has(normalizedUsername))
      throw new AccountError(
        'username-taken',
        'That username is already saved.',
      );

    const account: StoredAccount = {
      id: randomUUID(),
      username,
      normalizedUsername,
      passwordSalt,
      passwordHash,
      createdAt: new Date().toISOString(),
      commendations: {},
      achievements: [],
      sessions: [],
    };
    const token = this.addSession(account);
    this.accounts.set(normalizedUsername, account);
    this.persist();
    return { account: publicProfile(account), token };
  }

  async login(usernameValue: unknown, passwordValue: unknown) {
    const username = validateAccountUsername(usernameValue);
    const password = validatePassword(passwordValue);
    const account = this.accounts.get(normalizeUsername(username));
    const derived = await derivePassword(
      password,
      account?.passwordSalt ?? DUMMY_SALT,
    );
    const storedHash = account
      ? Buffer.from(account.passwordHash, 'base64url')
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

    const token = this.addSession(account);
    this.persist();
    return { account: publicProfile(account), token };
  }

  accountForSession(token: string | null | undefined) {
    if (!token || token.length > 256) return null;
    const tokenHash = hashToken(token);
    const cutoff = Date.now() - SESSION_LIFETIME_MS;
    for (const account of this.accounts.values()) {
      const session = account.sessions.find(
        (candidate) =>
          candidate.tokenHash === tokenHash &&
          Date.parse(candidate.createdAt) >= cutoff,
      );
      if (session) return publicProfile(account);
    }
    return null;
  }

  revokeSession(token: string | null | undefined) {
    if (!token || token.length > 256) return false;
    const tokenHash = hashToken(token);
    for (const account of this.accounts.values()) {
      const nextSessions = account.sessions.filter(
        (session) => session.tokenHash !== tokenHash,
      );
      if (nextSessions.length === account.sessions.length) continue;
      account.sessions = nextSessions;
      this.persist();
      return true;
    }
    return false;
  }

  addCommendations(accountId: string, additions: CommendationCounts) {
    const account = [...this.accounts.values()].find(
      (candidate) => candidate.id === accountId,
    );
    if (!account) return null;
    const cleanAdditions = normalizeCommendationCounts(additions);
    for (const [id, count] of Object.entries(cleanAdditions))
      account.commendations[id as keyof CommendationCounts] =
        (account.commendations[id as keyof CommendationCounts] ?? 0) +
        (count ?? 0);
    if (Object.keys(cleanAdditions).length > 0) this.persist();
    return publicProfile(account);
  }

  unlockAchievements(accountId: string, achievementIds: AchievementId[]) {
    const account = [...this.accounts.values()].find(
      (candidate) => candidate.id === accountId,
    );
    if (!account) return null;
    const existing = new Set(account.achievements);
    const additions = normalizeAchievementIds(achievementIds).filter(
      (id) => !existing.has(id),
    );
    if (additions.length > 0) {
      account.achievements.push(...additions);
      this.persist();
    }
    return publicProfile(account);
  }

  private addSession(account: StoredAccount) {
    const token = randomBytes(32).toString('base64url');
    const cutoff = Date.now() - SESSION_LIFETIME_MS;
    account.sessions = account.sessions
      .filter((session) => Date.parse(session.createdAt) >= cutoff)
      .slice(-(MAX_SESSIONS_PER_ACCOUNT - 1));
    account.sessions.push({
      tokenHash: hashToken(token),
      createdAt: new Date().toISOString(),
    });
    return token;
  }

  private persist() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
    const file: AccountFile = {
      version: ACCOUNT_FILE_VERSION,
      accounts: [...this.accounts.values()],
    };
    writeFileSync(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporaryPath, this.filePath);
    chmodSync(this.filePath, 0o600);
  }
}
