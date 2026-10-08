import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AccountError, AccountStore } from './account-store.ts';

function temporaryStore() {
  const directory = mkdtempSync(join(tmpdir(), 'danger-noodle-accounts-'));
  const filePath = join(directory, 'accounts.json');
  return { filePath, store: new AccountStore(filePath) };
}

void test('accounts persist salted password hashes and durable sessions', async () => {
  const { filePath, store } = temporaryStore();
  const registered = await store.register('Saved Noodle', 'correct horse');

  assert.equal(registered.account.username, 'Saved Noodle');
  assert.deepEqual(
    store.accountForSession(registered.token),
    registered.account,
  );

  const storedFile = readFileSync(filePath, 'utf8');
  assert.doesNotMatch(storedFile, /correct horse/);
  assert.match(storedFile, /passwordHash/);
  assert.doesNotMatch(storedFile, new RegExp(registered.token));

  const reloaded = new AccountStore(filePath);
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
  const { filePath, store } = temporaryStore();
  const registered = await store.register('Award Noodle', 'long-enough');
  const first = store.addCommendations(registered.account.id, {
    winner: 1,
    'egg-lord': 2,
  });
  assert.equal(first?.commendations.winner, 1);
  assert.equal(first?.commendations['egg-lord'], 2);
  const second = store.addCommendations(registered.account.id, { winner: 2 });
  assert.equal(second?.commendations.winner, 3);

  const reloaded = new AccountStore(filePath);
  assert.equal(
    reloaded.accountForSession(registered.token)?.commendations.winner,
    3,
  );
});

void test('achievements unlock once and survive a reload', async () => {
  const { filePath, store } = temporaryStore();
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

  const reloaded = new AccountStore(filePath);
  assert.deepEqual(reloaded.accountForSession(registered.token)?.achievements, [
    'first-win',
    'clean-sweep',
  ]);
});
