# Danger Noodle League

A lightweight, room-based multiplayer snake arena inspired by Viper League. The browser renders the game on a canvas while an authoritative WebSocket server owns movement, pickups, collisions, jumping, growth, and respawning.

The reverse-engineered replication target—including original movement, jumping, trails, collisions, terrain, power-ups, modes, timers, level data, recovered assets, and known quirks—is maintained in [docs/viper-league-behaviour-reference.md](docs/viper-league-behaviour-reference.md). The implementation and release gates are tracked in [docs/production-readiness-todo.md](docs/production-readiness-todo.md).

## First-draft mechanics

- Continuous forward motion with tank steering
- Left / right to steer (`←` / `→` or `A` / `D`)
- Down to jump (`↓` or `S`)
- Up activates the equipped power-up (`↑` or `W`)
- Wraparound arena with no outside walls
- Glowing dots grow the snake
- One-slot inventory with Speed Boost, Fireball, Jumper, Grenade, One Eighty,
  Rail Gun, and Trident pickups
- Six-second Fireball lifetime so unattended shots cannot live in a room forever
- Original-style grenade arcs, tall jumps, instant rail shots, tail reversal,
  and multi-head Trident control
- Original-style 60 Hz movement, turning, jump timing, and trail gaps
- Event-driven gameplay sound effects with separate persisted music and SFX mutes
- Self- and opponent-tail collisions
- Room codes and copyable invite URLs
- Server-authoritative simulation for all players in a room
- Host-controlled room lobbies with ready state, arena selection, and match settings
- Survival rounds with countdowns, elimination, round wins, match winners, rematches,
  spectators, and host migration
- Quickplay mode preserving the original fast automatic-respawn loop
- Repeatable server-authoritative Survival commendations with round results and account totals
- Permanent one-off account achievements with server-authoritative unlock rules
- Optional saved usernames with backend password hashing and durable sign-in sessions
- Jump slams, landing shockwaves and stuns, shield/ghost/Napalm/Disco support,
  terrain effects, destructible walls, and Bullet Hell turrets

## Run it

Use Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create a room, then use **Room → Copy** and open the copied URL in another browser or private window.

For the fast gameplay test room, open [http://localhost:3000/?dev=true](http://localhost:3000/?dev=true). It skips the lobby, forces the empty **Void** map, and places one of each core power-up in the arena. Normal rooms can select any of the 13 recovered default maps from the lobby; the selection is preserved in invite links.

The game backend owns public port `3000`, handles `/ws` directly, and proxies ordinary page and HMR traffic internally to a loopback-only Vite server on port `3001`. Browsers and reverse proxies therefore need only one entry point. Set `PORT`, `FRONTEND_PORT`, or `GAME_HOST` to change those bindings. Set `NEXT_PUBLIC_WS_URL` only when the WebSocket server is hosted at a different public URL.

To use a custom development hostname, set `DEV_HOST` in `.env` or inline. The frontend server will listen on all local interfaces and accept that hostname rather than trying to bind to its DNS address:

```bash
DEV_HOST=dev.jbat.ch npm run dev
```

Then open [http://dev.jbat.ch:3000](http://dev.jbat.ch:3000). `localhost` remains the default when `DEV_HOST` is unset.

`dev.jbat.ch` is explicitly included in Vite's host allowlist. Add other development domains with a comma-separated `DEV_ALLOWED_HOSTS` value.

With Caddy, a single upstream handles both the site and multiplayer connection:

```caddyfile
dev.jbat.ch {
  reverse_proxy 192.168.20.16:3000
}
```

## Verify it

```bash
npm test
npm run build
```

## Network telemetry and baseline

The authoritative server exposes process-local aggregate telemetry at
[`/telemetry`](http://localhost:3000/telemetry). It reports active rooms and
connections, snapshot bytes and encode cost, tick time, event-loop lag, socket
buffering, compression negotiation, backpressure skips, RTT, and
browser-reported snapshot cadence, decode cost, jitter, gaps, and stale updates.
It contains no player names or room codes and resets with the server.

The transport packs trail points into a versioned quarter-pixel wire format,
negotiates per-message WebSocket compression, and skips replaceable snapshots
for clients whose send queues exceed 128 KiB.

Run the deterministic 2-, 4-, and 8-player baseline with:

```bash
npm run benchmark:network
```

The command writes a current Markdown/JSON pair. The performance pass also keeps
the preserved [before run](docs/network-performance-before.md),
[after run](docs/network-performance-after.md), and
[before/after comparison](docs/network-performance-comparison.md).

## Docker production deployment

Pushes to `main` run the tests and production build, then publish these images
to GitHub Container Registry:

- `ghcr.io/jbatch/danger-noodle:latest`
- `ghcr.io/jbatch/danger-noodle:<git-sha>`

Set the optional repository Actions variable `NEXT_PUBLIC_SITE_URL` to the
public HTTPS origin if Open Graph metadata should use the production hostname.
Gameplay WebSockets use the current page origin, so they require no separate
URL setting with the Caddy setup below.

On the production server, authenticate to GHCR if the package is private, copy
`docker-compose.yml`, then run:

```bash
docker compose pull
docker compose up -d
```

The Compose service binds container port 3000 to `127.0.0.1:3000` by default.
Set `DNL_PORT` in the server's `.env` if that host port is already occupied.
With host-installed Caddy, the complete site configuration is simply:

```caddyfile
noodle.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Caddy handles WebSocket upgrades automatically. The Compose file keeps saved
accounts in the `danger-noodle-data` volume; include that volume in backups. No
application secret or special Compose network is required. Keep this deployment at one replica:
rooms are held in memory, so deployments/restarts clear active games and
multiple replicas would require sticky routing or shared room state. If Caddy
also runs in Docker, attach both services to the same Docker network and proxy
to `danger-noodle-league:3000` instead of the host-loopback binding.

The simulation and transport are deliberately separate from the renderer. Future levels, terrain, hazards, power-ups, and modes can be added to the server state without replacing the networking layer.

## Asset palettes

Recovered Viper League presentation files use a `-classic` suffix. The settings
menu can switch between the persisted **Classic** and **Handmade** asset palettes;
unfinished Handmade entries safely fall back to Classic. Exact filenames,
dimensions, reference timings, and the activation workflow are tracked in the
[Handmade asset-pack checklist](docs/handmade-asset-checklist.md).

## Round commendations

Every Survival round can award Winner, Longest Noodle, Peak Noodle, Maxed Out,
Egg Lord, Untouchable, Frequent Flyer, Power Player, Survivor, and Crash Test.
Ties award every tied player. Anonymous totals last for the room session;
signed-in totals are saved to the account. Exact rules are documented in the
[round commendation reference](docs/round-commendations.md).

## Optional accounts

Playing anonymously remains the default. The account button can convert the
current noodle into a saved username without leaving its room or losing its
current score and commendation totals. Players can later log in with that username
and password; registered names are reserved from anonymous impersonation.

Passwords are never stored directly. The backend uses a unique salt and `scrypt`
hash for every password, stores only SHA-256 hashes of random session tokens,
and sends the browser session in an HTTP-only same-site cookie. Local account
data defaults to SQLite at `data/accounts.sqlite`; set `ACCOUNTS_DB_FILE` to use
another path. A legacy `data/accounts.json` is imported transactionally on
startup and removed only after a successful commit.
Accounts and lifetime commendation counts are durable. Operational and security details are in the
[account reference](docs/accounts.md).

## One-off achievements

Saved accounts can permanently unlock a starter set of nine Survival
achievements, ranging from a first win and flawless round to eight-player wins,
maximum growth, egg, jump, power-up, and Trident milestones. Anonymous unlocks
remain available for in-room account conversion. See the complete rules in the
[achievement reference](docs/achievements.md).
