import assert from 'node:assert/strict';
import { createHash, scryptSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { AccountError, AccountStore } from './account-store.ts';

function temporaryStore() {
  const directory = mkdtempSync(join(tmpdir(), 'danger-noodle-accounts-'));
  const databasePath = join(directory, 'accounts.sqlite');
  const legacyJsonPath = join(directory, 'accounts.json');
  return {
    databasePath,
    legacyJsonPath,
    store: new AccountStore(databasePath, legacyJsonPath),
  };
}

void test('accounts persist salted password hashes and durable sessions', async () => {
  const { databasePath, legacyJsonPath, store } = temporaryStore();
  const registered = await store.register('Saved Noodle', 'correct horse');

  assert.equal(registered.account.username, 'Saved Noodle');
  assert.deepEqual(
    store.accountForSession(registered.token),
    registered.account,
  );

  const storedFile = readFileSync(databasePath);
  assert.equal(storedFile.subarray(0, 16).toString(), 'SQLite format 3\0');
  assert.doesNotMatch(storedFile.toString(), /correct horse/);
  assert.doesNotMatch(storedFile.toString(), new RegExp(registered.token));
  assert.equal(existsSync(legacyJsonPath), false);

  const database = new DatabaseSync(databasePath);
  const storedAccount = database
    .prepare('SELECT password_salt, password_hash FROM accounts')
    .get() as { password_salt: string; password_hash: string };
  assert.ok(storedAccount.password_salt);
  assert.ok(storedAccount.password_hash);
  database.close();

  const reloaded = new AccountStore(databasePath, legacyJsonPath);
  assert.deepEqual(
    reloaded.accountForSession(registered.token),
    registered.account,
  );
  const login = await reloaded.login('saved noodle', 'correct horse');
  assert.equal(login.account.id, registered.account.id);
  assert.notEqual(login.token, registered.token);
});

void test('usernames are unique case-insensitively and credentials are checked', async () => {
  const { store } = temporaryStore();
  await store.register('Noodle Ace', 'eight-or-more');

  await assert.rejects(
    store.register('noodle ace', 'another-pass'),
    (error: unknown) =>
      error instanceof AccountError && error.code === 'username-taken',
  );
  await assert.rejects(
    store.login('Noodle Ace', 'wrong-pass'),
    (error: unknown) =>
      error instanceof AccountError && error.code === 'invalid-credentials',
  );
  await assert.rejects(
    store.register('x', 'eight-or-more'),
    (error: unknown) =>
      error instanceof AccountError && error.code === 'invalid-username',
  );
  await assert.rejects(
    store.register('Valid Name', 'short'),
    (error: unknown) =>
      error instanceof AccountError && error.code === 'invalid-password',
  );
});

void test('logging out revokes only the selected session', async () => {
  const { store } = temporaryStore();
  const first = await store.register('Session Noodle', 'long-enough');
  const second = await store.login('Session Noodle', 'long-enough');

  assert.equal(store.revokeSession(first.token), true);
  assert.equal(store.accountForSession(first.token), null);
  assert.equal(store.accountForSession(second.token)?.id, first.account.id);
});

void test('commendation counts accumulate and survive a reload', async () => {
  const { databasePath, legacyJsonPath, store } = temporaryStore();
  const registered = await store.register('Award Noodle', 'long-enough');
  const first = store.addCommendations(registered.account.id, {
    winner: 1,
    'egg-lord': 2,
  });
  assert.equal(first?.commendations.winner, 1);
  assert.equal(first?.commendations['egg-lord'], 2);
  const second = store.addCommendations(registered.account.id, { winner: 2 });
  assert.equal(second?.commendations.winner, 3);

  const reloaded = new AccountStore(databasePath, legacyJsonPath);
  assert.equal(
    reloaded.accountForSession(registered.token)?.commendations.winner,
    3,
  );
});

void test('achievements unlock once and survive a reload', async () => {
  const { databasePath, legacyJsonPath, store } = temporaryStore();
  const registered = await store.register('Trophy Noodle', 'long-enough');
  const first = store.unlockAchievements(registered.account.id, [
    'first-win',
    'clean-sweep',
  ]);
  assert.deepEqual(first?.achievements, ['first-win', 'clean-sweep']);
  const repeated = store.unlockAchievements(registered.account.id, [
    'first-win',
  ]);
  assert.deepEqual(repeated?.achievements, ['first-win', 'clean-sweep']);

  const reloaded = new AccountStore(databasePath, legacyJsonPath);
  assert.deepEqual(reloaded.accountForSession(registered.token)?.achievements, [
    'first-win',
    'clean-sweep',
  ]);
});

void test('legacy JSON migrates transactionally and is removed after success', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'danger-noodle-migration-'));
  const databasePath = join(directory, 'accounts.sqlite');
  const legacyJsonPath = join(directory, 'accounts.json');
  const password = 'legacy-password';
  const passwordSalt = 'legacy-salt';
  const sessionToken = 'legacy-session-token';
  const legacyContents = `${JSON.stringify({
    version: 3,
    accounts: [
      {
        id: 'legacy-account',
        username: 'Legacy Noodle',
        normalizedUsername: 'legacy noodle',
        passwordSalt,
        passwordHash: scryptSync(password, passwordSalt, 64, {
          N: 16_384,
          r: 8,
          p: 1,
          maxmem: 32 * 1024 * 1024,
        }).toString('base64url'),
        createdAt: '2026-01-01T00:00:00.000Z',
        commendations: { winner: 4 },
        achievements: ['first-win'],
        sessions: [
          {
            tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
  })}\n`;
  writeFileSync(legacyJsonPath, legacyContents);

  const store = new AccountStore(databasePath, legacyJsonPath);
  assert.equal(existsSync(legacyJsonPath), false);
  assert.equal(existsSync(databasePath), true);
  assert.equal(store.accountForSession(sessionToken)?.commendations.winner, 4);
  assert.deepEqual(store.accountForSession(sessionToken)?.achievements, [
    'first-win',
  ]);
  writeFileSync(legacyJsonPath, legacyContents);
  const restarted = new AccountStore(databasePath, legacyJsonPath);
  assert.equal(existsSync(legacyJsonPath), false);
  assert.equal(restarted.accountForSession(sessionToken)?.id, 'legacy-account');

  const login = await restarted.login('Legacy Noodle', password);
  assert.equal(login.account.id, 'legacy-account');
});

void test('failed legacy migration leaves the JSON source untouched', () => {
  const directory = mkdtempSync(join(tmpdir(), 'danger-noodle-migration-'));
  const databasePath = join(directory, 'accounts.sqlite');
  const legacyJsonPath = join(directory, 'accounts.json');
  writeFileSync(legacyJsonPath, '{"version":999,"accounts":[]}\n');

  assert.throws(() => new AccountStore(databasePath, legacyJsonPath));
  assert.equal(existsSync(legacyJsonPath), true);
});
