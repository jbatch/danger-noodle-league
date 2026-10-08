# Optional saved accounts

Danger Noodle League remains playable without an account. A saved account only
reserves a username and lets the same player identity return on another visit;
it does not gate rooms, Quickplay, Survival, or round commendations.

## Player flows

- **Create account:** an anonymous player chooses **Save Noodle**, confirms a
  3–16 character username and an 8–128 character password, and is converted in
  place. Their current room owner, growth score, round score, and commendation totals
  are not recreated or cleared.
- **Log in:** a returning player supplies the username and password. If already
  in a room, the current owner is rebound and renamed without disconnecting. If
  still on the home screen, the saved name is used when they enter a room.
- **Automatic return:** successful registration or login creates a 30-day
  HTTP-only same-site session cookie. A valid cookie restores the saved name on
  later WebSocket connections.
- **Log out:** the selected server session is revoked. A player who logs out
  while connected stays in the room as a guest with a non-reserved name.
- **Reserved names:** anonymous players cannot impersonate a registered name;
  the server gives them a visible `Guest` suffix.

One saved account may play in multiple rooms, but it cannot open two owners in
the same room at once.

## Credential and session storage

The backend database defaults to `data/accounts.sqlite`, or the path in
`ACCOUNTS_DB_FILE`. SQLite transactions atomically update normalized account,
session, commendation, and achievement tables.

- Passwords use Node's `scrypt` with a unique random 16-byte salt and a 64-byte
  derived key. Plaintext passwords are never written.
- Browser sessions use 32 random bytes. Only each token's SHA-256 hash is
  written to the database.
- Each account keeps at most five non-expired sessions. Sessions expire after
  30 days.
- Cookies are `HttpOnly`, `SameSite=Lax`, and scoped to `/`. They receive the
  `Secure` attribute for HTTPS requests or when `ACCOUNT_COOKIE_SECURE=true`.
- Account request bodies are capped at 2 KiB. JSON responses do not expose
  hashes, salts, or account session tokens; the WebSocket welcome includes only
  a random token that can bind an account action to that live connection.

The Docker Compose deployment mounts the named `danger-noodle-data` volume at
`/app/data`. A host bind mount such as `./data:/app/data` is equally valid and
keeps the same in-container database path. Back up that volume or directory
with the rest of the service's durable data. Deleting it permanently removes
saved accounts.

## Legacy JSON migration

At startup, the server looks for `accounts.json` beside the SQLite database, or
at the legacy path in `ACCOUNTS_FILE`. Versions 1–3 are supported.

1. SQLite schema creation completes first.
2. Every legacy account, password hash, session, commendation count, and
   achievement is imported inside one immediate transaction.
3. Username conflicts or invalid input roll back the transaction and leave the
   JSON file untouched.
4. Only after the transaction commits is `accounts.json` deleted.

The migration is idempotent if the process stops after the commit but before
deletion: matching records are safely re-applied on the next startup. Passwords
and active sessions remain valid because their existing hashes are copied
without modification.

## Scope boundary

Accounts persist identity, lifetime Survival commendation counts, and one-off
achievement IDs. Anonymous totals and pending achievement unlocks are merged
into an account during in-room registration or login. The account session token
remains intentionally separate from the future short disconnect/reconnect token
that will reclaim a live room owner.
