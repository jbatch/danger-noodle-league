# Danger Noodle League production-readiness TODO

This is the implementation and release checklist for the first public multiplayer build. Exact original behaviour and evidence belong in [viper-league-behaviour-reference.md](viper-league-behaviour-reference.md); this document tracks what our version has, what it still needs, and which deliberate differences must be approved.

Last reviewed: 7 October 2026.

## Recommended v1 release definition

The first production-ready release should let 2–8 remote players join a room, select and complete rounds on every original default level, and play a stable Standard/Survival match using the seven advertised core power-ups. It should work behind HTTPS/WSS on one public origin, survive ordinary disconnects, and expose enough diagnostics to operate safely.

Full replication of every hidden power-up and modifier mode is tracked separately below. Those are not blockers for the first public v1 unless we explicitly expand the launch scope.

## Baseline already implemented

- [x] Authoritative server simulation with a 60 Hz target update rate.
- [x] Same-origin room-based WebSocket multiplayer and shareable room URLs.
- [x] Continuous movement, wraparound, tank steering, interpolated trail samples, self/opponent trail collisions, and airborne trail gaps.
- [x] Original-sized 1280 × 672 world with basic and Jumper jump timing.
- [x] Core Speed Boost, Fireball, Jumper, Grenade, One Eighty, Rail Gun, and Trident prototypes.
- [x] Automated simulation tests for movement, jumping, the seven power-ups, Trident lifecycle, ping, and two-client room isolation.
- [x] Reconnecting client state, room/name UI, player ping display, and music mute persistence.
- [x] One public development port for frontend, HMR, and WebSocket traffic.
- [x] All 13 default TMX layouts, small/medium previews, and the original wall, terrain, and overlay sheets available locally.

## P0 — gameplay and match loop

These are launch blockers.

### Level pipeline

- [x] Add a build-time TMX compiler that emits one validated shared level catalogue for server and client.
- [x] Normalize known legacy metadata errors (`sprint2` wall tileset name, stale map display names) without modifying the source TMX files.
- [x] Include a stable level ID, display name, preview, map properties, layers, object groups, and spawn data in each compiled entry.
- [x] Send the selected level ID and destroyed-wall state through the multiplayer protocol.
- [ ] Render walls, terrain, overlays, and fixed features from the compiled geometry.
- [x] Use all eight authored player spawn points and prevent two owners from receiving the same spawn.
- [x] Use authored random power-up rectangles and supported fixed starting items rather than unrestricted arena random positions.
- [x] Add importer validation for all 13 default maps and the extra Starfield file.

### Walls, terrain, and level objects

- [x] Add authoritative static-wall collision.
- [ ] Implement destructible walls and local frame 8 invincible walls.
- [x] Make Fireballs, Grenade blasts, and Rail Gun beams interact with static walls as documented. Surviving shielded impacts remain blocked on Shield support.
- [ ] Implement Ice, Grass, Fire, Water, Oil, and Goal terrain effects.
- [ ] Make airborne and ghosted heads ignore terrain.
- [ ] Implement Bullet Hell turrets, including authored movement, rotation, frequency, shots, collision, and destruction.
- [ ] Implement the generic moving-wall, portal, rotator, and drone schemas before accepting new maps that use them.
- [ ] Replicate wrap-aware hazards and blast copies at map seams.

### Core movement and collision completion

- [x] Replace variable-delta stepping with a fixed-step accumulator so delayed event-loop frames do not change gameplay.
- [x] Add the three-tick trail-point collision grace and verify the newest 15 self-trail samples are excluded exactly.
- [x] Preserve dead trails as hazardous detached trails instead of deleting them with the head.
- [ ] Implement damage as a reusable path even when an unshielded hit remains immediately lethal.
- [x] Add unshielded head-to-head and head-to-wall collisions; reusable damage/Shield handling remains separate work.
- [ ] Add jump slam input, landing shockwaves, one-second stun, and visual/audio landing feedback.
- [ ] Verify spawn flicker, non-collision windows, Trident summon sickness, and owner-level elimination.
- [ ] Verify One Eighty trail orientation, grenade catch behaviour, Rail Gun wall stopping, and projectile collision masks against the reference.
- [ ] Keep the requested six-second Fireball lifetime as an explicit online-game deviation from the original infinite lifetime.

### Rounds and matches

- [ ] Add explicit lobby, countdown, playing, round-over, intermission, and match-over states.
- [ ] Cap active players at eight and require at least two active players to start a multiplayer Survival round.
- [ ] Assign a room host and expose host-only start, level, match-length, and gameplay-setting controls.
- [ ] End Standard/Survival rounds when only one player owner remains alive; all Trident heads count as one owner.
- [ ] Track round wins separately from growth/egg count and support a configurable wins-to-match target.
- [ ] Replace prototype automatic respawning with round-appropriate elimination; retain respawning only for modes that require it.
- [ ] Add round result, match winner, rematch, return-to-lobby, and host-migration flows.
- [ ] Make late joiners wait safely for the next round or join as spectators.
- [ ] Define deterministic behaviour when a player disconnects during a round.

### Core power-ups and spawning

- [ ] Use the playlist/room's allowed power-up roster rather than spawning every type in a fixed cycle.
- [ ] Randomize spawn choices and positions server-side while allowing deterministic seeded tests.
- [ ] Match 12-second world-item lifespan and grow/shrink presentation.
- [ ] Make inventory capacity, replacement, use, clearing, and death drops explicit.
- [ ] Complete wall, terrain, detached-trail, turret, and projectile interactions for all seven launch power-ups.
- [ ] Add golden tests for each power-up on ordinary tiles, level edges, walls, and multi-head owners.

## P0 — multiplayer quality and safety

- [ ] Issue a reconnect/session token so a brief disconnect reclaims the same player instead of creating a new owner.
- [ ] Retain disconnected players for a short grace period and expire them cleanly.
- [x] Apply client input sequence numbers and discard stale/out-of-order inputs.
- [ ] Add client interpolation between 20 Hz snapshots and test behaviour under latency, jitter, and packet loss.
- [x] Add WebSocket heartbeat/timeout handling on the server, not only client ping display.
- [ ] Set message-size, message-rate, connection, room, name, and room-code limits.
- [ ] Validate every protocol message and reject unknown or non-finite values without destabilizing a room.
- [ ] Add an allowed-origin policy for production WebSocket upgrades.
- [ ] Version the network protocol and handle incompatible clients with a readable error.
- [ ] Ensure one slow or closed client cannot delay snapshots for other rooms.
- [ ] Add load/soak tests for eight-player rooms, long trails, many projectiles, and many idle rooms.
- [ ] Add deterministic replay or event capture sufficient to reproduce gameplay bugs.

## P0 — audio, visual, and room UX

- [x] Wire event-driven sound effects for jump, land, egg collection, death, pickups, Fireball, Grenade, Rail Gun, One Eighty, and Trident.
- [ ] Add volume controls for music and sound effects. Independent mute controls are implemented and persisted locally.
- [ ] Recover or replace `Whoosh_BigJump2` and `Explo_EnergyFireball01.wav`.
- [ ] Decide whether `Magic_Disappear.wav` has a useful replacement event or remains unused for compatibility.
- [ ] Recover or replace the missing power-up, feature, egg, turret, portal, and projectile art; production must not load assets from the old live deployment.
- [ ] Add a level browser using the recovered previews and authoritative catalogue names.
- [ ] Add a proper room lobby showing host, players, ready state, selected level, settings, and invite action.
- [ ] Show countdown, round score, match target, winner, reconnect grace, spectator, and server-error states.
- [ ] Keep gameplay readable at common desktop aspect ratios and high-DPI displays.
- [ ] Provide keyboard instructions in-game and prevent browser scrolling or stuck keys reliably.
- [ ] Add reduced-motion and flash-intensity options for shockwaves, flicker, explosions, and future Disco effects.
- [ ] Test audio autoplay recovery after the first user gesture.

## P0 — production deployment and operations

- [ ] Choose and document the production runtime for the authoritative WebSocket server.
- [ ] Make the production backend serve the built frontend and `/ws` from one public origin, matching the development topology.
- [ ] Confirm the current frontend build/deploy command also deploys the multiplayer server; do not ship a frontend-only worker accidentally.
- [ ] Configure HTTPS/WSS, reverse-proxy upgrade headers, idle timeouts, compression policy, and trusted proxy handling.
- [ ] Decide whether production is deliberately single-instance or implement sticky/shared room ownership before scaling horizontally.
- [ ] Add readiness and liveness checks that distinguish frontend health from simulation/WebSocket health.
- [ ] Add structured logs for server start, room lifecycle, connections, disconnects, protocol errors, round outcomes, and uncaught failures.
- [ ] Add basic metrics for active connections, rooms, tick duration, snapshot size, event-loop lag, reconnects, and errors.
- [ ] Add graceful shutdown that stops new rooms, informs clients, and drains or ends active matches predictably.
- [ ] Pin the supported Node/runtime versions and verify a clean production install/build/start.
- [ ] Add CI gates for formatting, lint, tests, build, and generated-level freshness.
- [ ] Document deployment, rollback, environment variables, Caddy configuration, and an operator smoke test.

## P0 — release verification and asset decisions

- [ ] Confirm redistribution rights for every recovered image, preview, sound, and music file intended for production.
- [ ] Replace any asset whose permission is unclear while preserving documented dimensions and timing.
- [ ] Decide the final product name/branding and remove prototype/test wording from the UI and metadata.
- [ ] Test current Chrome, Firefox, and Safari on desktop over a real HTTPS/WSS deployment.
- [ ] Run a real 2-, 4-, and 8-player playtest covering every default level.
- [ ] Verify no level can spawn a player inside a wall, lethal terrain, another head, or an unavoidable turret shot.
- [ ] Run reconnect, host disconnect, late join, browser sleep/wake, proxy restart, and server restart smoke tests.
- [ ] Review intentional deviations and record approval beside the compatibility reference.
- [ ] Tag a release candidate and complete a final clean-machine install/build/deploy test.

## Compatibility decisions to lock before content implementation

- [ ] Confirm separate controls remain: Down/S for jump and Up/W for equipped power-up, rather than the original shared action key.
- [ ] Confirm basic jump remains universally available instead of being restricted to Plumber mode.
- [ ] Confirm Fireballs expire after six seconds rather than wrapping forever.
- [ ] Decide whether normal rounds use original permanent elimination or any modern respawn option.
- [ ] Decide whether collision/damage quirks such as Rail Gun hitting otherwise non-collidable states are bugs to preserve or fix.
- [ ] Decide whether Starfield is a selectable bonus map, internal test fixture, or excluded asset.

## P1 — full Viper League compatibility after public v1

These are required before calling the recreation feature-complete, but they need not block the first stable public release.

### Additional power-ups and systems

- [ ] Ghost, including fade and five-second non-collision state.
- [ ] Tron Mode trail extension.
- [ ] Shield health, shield rendering, damage absorption, and post-break flicker.
- [ ] Napalm's deployed smaller grenade behaviour; do not invent terrain ignition without new evidence.
- [ ] Disco Ball overlay, music transition, duration, and reduced-flash handling.
- [ ] Portal pair world spawning and lifetime outside authored maps.

### Modes and playlists

- [ ] Build composable mode lifecycle hooks rather than a mutually exclusive mode switch.
- [ ] Survival and Classic.
- [ ] Carnivore and Egg Hunt.
- [ ] Dual Wield and Caterpillar inventory rules.
- [ ] Hard to Kill respawns and extra lives.
- [ ] Infinite and Turbo.
- [ ] Power House and Rainbow, including their interaction.
- [ ] Shields Up and Stealth.
- [ ] Claustrophobia.
- [ ] Volcano and Overgrowth.
- [ ] Plumber, if basic jumping becomes mode-specific.
- [ ] Drone Hunt and drone AI after its ambiguous original behaviour is verified.
- [ ] Decide whether the empty Bomb Tail implementation should stay omitted.
- [ ] Reconstruct original playlists, allowed levels/power-ups/modes, and selection UI.

### Input and platform breadth

- [ ] Gamepad controls with analog steering and a verified dead zone.
- [ ] Touch controls suitable for phones/tablets if mobile becomes a supported target.
- [ ] Remappable controls and multiple keyboard layouts if same-device local play returns.
- [ ] Spectator camera and optional replay viewing.

## Definition of done

Production-ready v1 means every P0 item is complete or explicitly waived with a documented reason, automated tests and real multiplayer smoke tests pass against the production topology, asset rights are resolved, and the deployed health/metrics signals show the server can sustain the expected room load.
