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

The simulation and transport are deliberately separate from the renderer. Future levels, terrain, hazards, power-ups, and modes can be added to the server state without replacing the networking layer.
