# Viper League behaviour reference

This is the compatibility reference for rebuilding Viper League. It records behaviour found in the publicly deployed 2017 HTML5 build, including values derived from its fixed 60 Hz update loop. It is intentionally separate from our current implementation: when the prototype disagrees with this document, this document describes the replication target unless a later design decision explicitly overrides it.

Last researched: 7 October 2026.

## Evidence labels

- **Exact** — directly encoded in the deployed JavaScript or level data.
- **Derived** — calculated from exact values, normally using the 60 Hz update rate.
- **Public** — stated on the game's public itch.io page.
- **Uncertain** — suggested by the code or UI, but still needs a focused play test.

The deployed JavaScript was compiled from Monkey X with debug metadata intact. Class names, original source paths, and Monkey source line numbers survive in the bundle, making it substantially more useful than an ordinary minified build. This document summarizes behaviour and constants; it does not copy the original code.

## Primary sources

- [Viper League on itch.io](https://viperleague.itch.io/play) — public description, controls, player count, and advertised power-ups.
- [Deployed HTML5 bootstrap](https://html-classic.itch.zone/html/583003-47568/index.html?v=1782543609) — identifies the live game bundle and canvas.
- [Deployed game JavaScript](https://html-classic.itch.zone/html/583003-47568/main.js) — authoritative source for the exact mechanics below.
- [Void level data](https://html-classic.itch.zone/html/583003-47568/data/levels/empty.tmx) — arena size, tile size, and spawn layout for the empty map.

These are live deployment URLs and may disappear. If we depend on a detail during implementation, preserve the conclusion and its evidence label here rather than relying on being able to fetch the build again.

## Recovered level and asset inventory

Audited 7 October 2026. The workspace now contains the complete machine-readable layout set for the 13 levels registered by the deployed game, plus one extra map that was present in the original asset catalogue.

| Material | Available locally | Compatibility value |
| --- | --- | --- |
| Default TMX maps | All 13 under `public/levels/maps`: Void, Castle, Skull, Fire and Ice, Urban, Crosshairs, Noveria, Sprint 2, Corners, Ice Fortress, Sunshine, Jungle, and Bullet Hell | Exact tile geometry, spawn locations and rotations, fixed items, random spawn regions, features, and map properties |
| Extra TMX maps | `public/levels/maps/starfield.tmx` | Original asset, but not registered in the deployed normal level list; treat as bonus/debug content until its intended status is verified |
| Level previews | Small and medium previews for all 13 default maps under `public/levels/previews` | Sufficient for a level-selection UI; full-size previews are not required to simulate a level |
| Gameplay tile sheets | `wallTileSheet-classic.png`, `terrainSheet-classic.png`, and `overlaySheet-classic.png` under `public/levels/tiles` | Original 32-pixel frames for walls, terrain, and decorative overlays |
| Sound effects | Jump, landing, egg collection, grenade, rail, fireball launch/clash, snake explosion, and the core pickup/activation sounds listed below | Original event cues can be wired directly by filename |
| Music | `public/audio/music/snakes-theme-classic.ogg` | Original looping menu/game soundtrack currently used by the Classic asset pack |

The TMX files reference `../tiles/powerUpSheet.png` and `../tiles/featuresSheet.png`, which are not currently local. The original [power-up sheet](https://html-classic.itch.zone/html/583003-47568/data/levels/powerUpSheet.png) and [feature sheet](https://html-classic.itch.zone/html/583003-47568/data/levels/featuresSheet.png) remain reachable in the public deployment as of the audit date. Other absent presentation assets include the original egg, turret, portal, animated projectile, and full-size preview images. None of these omissions blocks gameplay reconstruction: the bundle identifies every frame and behaviour, so replacement 32 × 32 art can preserve the same geometry and collision semantics.

Technical availability is not a redistribution licence. Before a public release, either confirm permission to ship the recovered art/audio or replace it while retaining the documented gameplay dimensions and cues.

### Exact TMX decoding

All recovered maps are orthogonal 40 × 21 maps using 32 × 32 tiles, yielding the original 1280 × 672 playfield. The current project already uses those world dimensions. A non-zero tile's local frame is `gid - tileset.firstgid`; global GIDs must never be treated as stable semantic IDs across maps.

| Tileset | Local frame | Meaning |
| --- | ---: | --- |
| Terrain | 0 | Ice |
| Terrain | 1 | Grass |
| Terrain | 2 | Fire/lava |
| Terrain | 3 | Water |
| Terrain | 4 | Oil |
| Terrain | 5 | Goal |
| PowerUps | 0 | Egg |
| PowerUps | 1 | Speed Boost |
| PowerUps | 2 | Jumper |
| PowerUps | 3 | Ghost |
| PowerUps | 4 | Grenade |
| PowerUps | 5 | Fireball |
| PowerUps | 6 | One Eighty |
| PowerUps | 7 | Shield |
| PowerUps | 8 | Napalm |
| PowerUps | 9 | Disco Ball |
| Features | 0 | Paired portal; `exitX` and `exitY` are destination tile coordinates |
| Features | 1 | Turret |
| Features | 2 | Rotation pad |
| Walls | 8 | Invincible wall; other used frames are destructible |

Recognized tile layers are `Terrain`, `Overlay`, and `Walls`. Overlay tiles are visual only. Recognized object groups are `WallObjects`, `PowerUps`, `PowerUpSpawns`, `Features`, `DroneSpawns`, and `PlayerSpawns`. Empty legacy groups such as `WarpSpawns` can be ignored. Rectangle objects in `PowerUpSpawns` describe random spawn regions rather than single points.

Tiled tile objects use a bottom-edge Y anchor in these files. The original loader centers wall, fixed-power-up, and feature tile objects with `x + 16, y - 16`; ordinary player/drone point objects use `x + 16, y + 16`. Map properties recognized by the deployed loader are `name`, `SinglePlayer`, `MaxEggs`, and `PowerUpSpawnFrequency`. Object properties cover fixed-item `lifespan`; moving-wall `vx`, `vy`, and `vr`; turret `vx`, `vy`, `vr`, `frequency`, and `rotation`; portal exits; rotator degrees; and spawn rotation, speed, and tail length.

### Recovered level-specific content

- Every default map contains eight explicit player spawns.
- Bullet Hell contains two moving, rotating turrets firing every 0.25 seconds.
- Noveria contains a fixed effectively permanent Grenade.
- Sunshine contains eight fixed Fireballs.
- Corners combines Ice and Oil; the other terrain-heavy maps retain their exact Ice, Grass, Fire, and Water placement.
- Random power-up areas are preserved as authored rectangles, including maps with no random power-up region.

Several original files contain stale editor metadata. Import by filename/catalogue identity and normalize these cases rather than displaying their internal values literally:

- `sprint2.tmx` names its wall tileset `wallTileSheet` instead of `Walls`.
- `sunshine.tmx` reports its map name as `Castle`.
- Jungle, Bullet Hell, and Starfield report the generic map name `4-8`.
- `icefortress.tmx` reports `Centre Ice`, while the deployed catalogue presents it as Ice Fortress.

### Recovered sound mapping

The available effects below live under `public/audio/sfx`.

| Event | Original sound available locally |
| --- | --- |
| Basic or Jumper launch | `jump-classic.ogg` |
| Landing | `land-classic.ogg` |
| Egg collection | `eat-chew-classic.wav` |
| Snake death | `explosion-classic.wav` |
| Fireball launch | `Fireball_Launch5-classic.wav` |
| Fireball/fireball clash | `Explo_Small_02-classic.wav` |
| Grenade explosion | `grenade_explosion-classic.ogg` |
| Rail Gun shot | `EnergyRifle_Impact1-classic.wav` |
| Speed Boost pickup | `Pickup_Speed02-classic.wav` |
| Jumper pickup | `Pickup_Magic_Speed04-classic.wav` |
| Fireball pickup | `Pickup_Fire-classic.wav` |
| Grenade pickup | `Gun_Ammo_Pickup04-classic.wav` |
| Rail Gun pickup | `Pickup_Scifi_Energy01-classic.wav` |
| One Eighty pickup | `Magic_Appear01-classic.wav` |
| Trident pickup | `Pickup_MiscSwish01-classic.wav` |
| Trident activation | `Magic_Respawn03-classic.wav` |

`Magic_Disappear-classic.wav` is preloaded by the deployed game, but no direct playback call was found. Two referenced cues are not currently local: `Whoosh_BigJump2`/`Whoosh_BigJump2.wav` for Speed Boost and One Eighty activation, and `Explo_EnergyFireball01.wav` for fireball impacts and wall destruction. We can recover or replace those without affecting simulation.

### Level matching strategy

Treat TMX as authoring/source data and compile it at build time into a validated shared TypeScript or JSON level catalogue. Do not independently reinterpret XML in the browser and game server.

- The authoritative server consumes compiled walls, terrain, spawns, fixed items, features, and map properties for simulation.
- The canvas client consumes the same immutable geometry for rendering and receives only the selected level ID plus dynamic state such as destroyed walls, moving objects, portals, and projectiles.
- Replacement assets retain 32 × 32 frame geometry even when the visual style changes.
- Catalogue metadata supplies the public name and preview, avoiding stale TMX `name` properties.
- Import tests assert map dimensions, known object counts, eight player spawns, valid local GIDs, and expected special fixtures such as Bullet Hell's turrets and Sunshine's Fireballs.
- Behaviour tests cover wall destruction/invincibility, every terrain effect, wrap-aware hazards, spawn safety, portals, turrets, rotators, and fixed/random item placement.

This gives exact level topology and behaviour while keeping network authority and presentation assets independent.

## Core game loop

- **Public:** local multiplayer for 2–8 players. The original has no network play.
- **Exact:** simulation update rate is 60 ticks per second.
- **Exact:** the HTML5 canvas is 1280 × 672. The Void map is 40 × 21 tiles at 32 × 32 pixels, which is also 1280 × 672.
- **Exact:** the world wraps on all four sides. Crossing an edge adds or subtracts one playfield width or height. There is no lethal outer boundary.
- **Exact:** the presentation scalar is `1` below 2048 pixels wide and `2` at or above 2048. Most physics values are multiplied by this scalar, but not all of them.
- **Exact:** a normal round ends when its mode selects a winner. Standard survival play is last player alive; a player with multiple Trident heads remains alive until every head is dead.
- **Exact:** matches track round wins. The play-state default is 10 required wins, while playlists can provide another target.
- **Exact:** default repeating world timers are 8 seconds for a power-up, 4 seconds for an egg, and 30 seconds for a portal pair. A level can override power-up frequency and maximum eggs.

## Controls and input semantics

The original uses three visible controls per player: turn left, fire/action, and turn right. “Fire” consumes an equipped power-up; with no power-up, it performs the basic jump when that jump is enabled.

| Scheme | Left | Fire/action | Right | Hidden up/down bindings |
| --- | --- | --- | --- | --- |
| Arrow keys | Left | Down | Right | Up / Down |
| A/S/D | A | S | D | W / X |
| J/K/L | J | K | L | I / comma |
| Numpad | 4 | 5 | 6 | 8 / 2 |
| Extra keyboard scheme | F | G | H | T / B |
| Gamepad | left input | action button | right input | stick/D-pad also represented |

- **Exact:** fire/action is edge-triggered: a press activates once rather than repeating while held.
- **Exact:** keyboard and D-pad steering apply the full turn rate.
- **Exact:** gamepad analog steering scales with horizontal stick magnitude after its dead zone.
- **Exact:** if keyboard left and right are both held, the direction held for longer wins and turns at half strength.
- **Exact:** Classic mode replaces continuous steering with discrete 90° turns and offsets the head one head-width after each turn.
- **Implementation mapping:** our current `Down`/`S` jump binding is faithful to the original visible “fire” key. `Up`/`W` is reserved for power-up use in our online control model, but the original used the same fire key for both jump and equipped power-up.

## Movement and steering

At the normal 1280 × 672 scale:

| Quantity | Original value | 60 Hz interpretation |
| --- | ---: | ---: |
| Base forward speed | 2 px/tick | 120 px/s |
| Turn speed | `2 + forwardSpeed` degrees/tick | 4°/tick, 240°/s |
| Angular speed | derived | 4.18879 rad/s |
| Turning radius | derived | about 28.65 px |

- **Exact:** setting speed to `s` stores `s × scalar`; turn speed becomes `2 / scalar + storedSpeed` degrees per tick. At scalar 2, spatial values double but the normal angular rate remains 4° per tick.
- **Exact:** forward velocity is recalculated from the facing angle every grounded, unstunned update.
- **Exact:** while airborne, velocity is not recalculated. Steering still changes the facing angle, but the flight path continues along the launch velocity until landing. The new facing takes effect once grounded.
- **Exact:** terrain multiplies speed and/or turning after base values are calculated.
- **Exact:** Speed Boost is additive. Its stored boost is multiplied by `0.985` every tick and is snapped to zero once below `1.0`.
- **Derived:** a `+3` boost remains non-zero for about 73 ticks, or 1.22 seconds. Its useful speed falls continuously rather than ending abruptly at a timer boundary.

## Trail model

- **Exact:** a new snake starts with an empty trail and a maximum trail length of 350 pixels. The visible trail grows behind it until it reaches that cap.
- **Exact:** trail samples are 3 × 3 pixels and are interpolated at roughly 3-pixel spacing, including multiple samples in a fast tick.
- **Exact:** each new sample is non-collidable for its first 3 ticks.
- **Exact:** when checking a snake against its own trail, the newest 15 samples are excluded.
- **Exact:** no samples are emitted while jumping. Landing begins a new visible section, so the crossed area is a genuine gap that can be driven through.
- **Exact:** samples are removed from the oldest end when current length exceeds the maximum.
- **Exact:** an egg increases maximum trail length by 60 pixels.
- **Exact:** hitting a live or detached trail deals 25 damage. If the victim survives because of a shield, the struck sample is destroyed.
- **Exact:** when a snake dies, its tail detaches and remains as a hazardous “broken trail.” Explosions and fireballs can remove its samples.
- **Exact:** held power-up icons are rendered along the trail, separated by about 10.7 trail samples per inventory slot.

## Jump and slam

The jump is a temporary state on the head, not a lift of the whole trail. The head continues moving, stops laying trail, becomes non-collidable, then lands and resumes trail output.

### Basic jump

- **Exact:** pressing fire with no equipped power-up calls `Jump(0.3)`.
- **Exact:** launch scale velocity is `0.09 × height` per tick and gravity is `0.002` scale units per tick².
- **Derived:** the basic jump lasts 28 ticks, about **0.467 seconds**.
- **Derived:** peak visual head scale is about **1.196×**.
- **Derived:** at normal speed it crosses **56 pixels** without leaving a trail.
- **Exact:** there is no explicit jump cooldown; another jump can begin after landing and a new press.

### Jumper power-up

- **Exact:** Jumper calls `Jump(1.0)` using the same gravity.
- **Derived:** it lasts 91 ticks, about **1.517 seconds**.
- **Derived:** peak visual scale is about **3.07×**.
- **Derived:** at normal speed it crosses **182 pixels** without leaving a trail.

### Airborne rules

- **Exact:** jumping disables ordinary snake collision, including walls, heads, and trails.
- **Exact:** jumping ignores terrain effects and cannot enter portals.
- **Exact:** ordinary eggs and world power-ups require a collidable snake, so they are not collected in the air.
- **Exact:** a jumping snake that touches a thrown grenade catches it and receives a Grenade power-up.
- **Exact:** the jump is presented by scaling the head sprite; the head is not moved to a separate vertical coordinate in arena space.
- **Exact:** pressing fire again in midair subtracts `0.25` from both scale velocities and records slam power as `(currentScale - 1) × 3.6`, causing an earlier, stronger landing.
- **Exact:** every landing creates a shockwave. A normal landing uses magnitude `1`, producing a 40-pixel starting blast size. A slam scales this by its recorded magnitude.
- **Exact:** a shockwave does no direct damage. It stuns other collidable snakes for 1 second, setting their velocity to zero. It does not stun its launcher.

### Compatibility quirk

Plumber mode stores a basic jump height of `0.25`, but the deployed `Fire` method calls `Jump(0.3)` literally. The stored field is not used by that path. For exact compatibility, reproduce the deployed 0.3 jump; treat the 0.25 value as likely abandoned intent.

## Collision, damage, death, and protection

A snake is ordinarily collidable only when it is alive and is not flickering, inside a portal transition, jumping, ghosted, or stunned.

| Hazard | Damage | Additional behaviour |
| --- | ---: | --- |
| Head into live/detached trail | 25 | struck trail sample is destroyed if the snake survives |
| Static or moving wall | 50 | destructible wall is destroyed if the snake survives |
| Head-to-head | 100 to each | both are evaluated independently |
| Fireball | 100 | projectile disappears on a snake hit |
| Grenade blast | 50 | also erases trails, eggs, fireballs, walls, and turrets in the blast |
| Turret contact | 100 | turret is destroyed if the snake survives |
| Rail gun | 100 | first snake hit deactivates the damaging beam |

- **Exact:** without a shield, any call to `Damage` kills the snake regardless of damage amount. Damage numbers matter chiefly against shields.
- **Exact:** Shield sets shield strength to 100. Incoming damage subtracts from it; reaching zero or less grants 1.5 seconds of flickering/non-collision protection rather than killing immediately.
- **Exact:** newly spawned snakes receive 2 seconds of flicker protection in the ordinary spawn path. Hard to Kill respawns use 3 seconds.
- **Exact:** a new or Trident-spawned head has 3 ticks of “summon sickness,” during which fire/action is ignored.
- **Exact:** player elimination is owner-based. With Trident, the player is not dead until all of their heads are dead.
- **Exact:** death clears carried power-ups and detaches the tail.
- **Exact:** moving-object collision tests are used for heads against trails to reduce tunnelling.
- **Compatibility quirk:** rail collision checks living snakes directly rather than using the normal `Collidable` predicate. It can therefore hit states that most hazards ignore; verify the desired online behaviour before implementing this quirk.

## Eggs and world spawning

- **Exact:** eggs are 40 × 40, auto-trigger on collection, and have an effectively infinite lifespan.
- **Exact:** an ordinary egg adds 60 pixels to maximum trail length.
- **Exact:** the default egg spawn check runs every 4 seconds and only adds an egg while the current count is below the level's maximum. The level default maximum is 4.
- **Exact:** the default power-up spawn check runs every 8 seconds and chooses randomly from the active playlist's allowed power-ups.
- **Exact:** spawned power-ups scale from `0.01` toward `1.0` by `0.1` per tick.
- **Exact:** world power-ups live for 12 seconds, then shrink by `0.1` per tick until removed.
- **Exact:** inventory capacity is normally 1. Picking up another item at capacity discards the oldest item.
- **Exact:** auto-trigger items apply immediately; other items enter inventory.

## Power-ups

The public page advertises Fireball, Grenade, Jump, One Eighty, Speed Boost, Rail Gun, and Trident. The deployed bundle also contains Ghost, Tron Mode, Shield, Napalm, and Disco Ball, which may be hidden, map-placed, or excluded from the default menu.

| Power-up | Trigger | Behaviour to replicate |
| --- | --- | --- |
| Jumper / Jump | inventory | performs the height-1.0 jump described above |
| Speed Boost | inventory | adds `3` to speed boost; boost decays by `0.985` each tick and clears below `1` |
| Fireball | inventory | launches from in front of the head at `baseSpeed + 3`; default is 5 px/tick or 300 px/s; wraps forever until collision; 32 × 32 collision size |
| Grenade | inventory | thrown at total snake speed + 2; wraps; scale launch velocity `0.062`, gravity `0.002`; explodes after shrinking below `0.25`; blast size 150 |
| One Eighty | inventory | teleports the head to the oldest trail point, reverses the trail order and each point's orientation, faces outward by 180°, offsets clear of the trail, and adds a +3 boost |
| Rail Gun | inventory | ray-marches in 4-pixel steps to the first static wall or arena edge; visible for 16 ticks; damaging during its active portion; 100 damage to the first snake hit |
| Trident | inventory | creates two extra controlled heads at ±15°, 24 pixels from the original; each gets the current total speed rounded to an integer |
| Ghost | inventory | fades toward 25% alpha and is non-collidable for 5 seconds, then fades back |
| Tron Mode | auto | adds `60 × 6 × scalar` pixels to maximum trail length; 360 pixels at normal scale |
| Shield | auto | sets shields to 100, replacing the previous shield value |
| Napalm | inventory | grenade variant with a 100-pixel blast; it contains an `ignited` field, but no code in the deployed bundle reads that field |
| Disco Ball | auto | starts the disco overlay and looping blackout music for 10 seconds, then returns to menu music |

Additional interactions:

- **Exact:** two colliding fireballs annihilate each other.
- **Exact:** fireballs wrap, destroy destructible static and moving walls, burn individual trail samples, and damage a normal snake for 100.
- **Exact:** a snake is immune to fireball head damage while underwater or while its stored speed boost is at least `2.5`.
- **Exact:** grenade blasts damage collidable snakes for 50 and can remove trail samples, detached trails, fireballs, eggs, destructible walls, and turrets.
- **Exact:** blast copies are created across wrap seams so explosions behave continuously at arena edges.
- **Exact:** Trident's heads share player ownership and controls but have independent positions, trails, collision, inventory, and life state.

## Terrain

Terrain effects are reset to neutral at the end of each snake update and reapplied while the head occupies a terrain tile. Ghosts ignore all listed terrain effects. Jumping heads do not apply terrain.

| Terrain | Exact effect |
| --- | --- |
| Ice | turning multiplier `0.35`; forward speed unchanged |
| Grass | X and Y movement drag each set to `0.5` |
| Fire/lava | removes one oldest trail point and reduces maximum trail length by 2 per tick; once the maximum would fall below 3, clamps to 3 and applies 1 damage each tick |
| Water | marks the snake underwater, sets alpha to `0.5`, and sets X/Y drag to `0.8`; also grants fireball immunity |
| Oil | enables sliding and sets speed multiplier to `1.333` |
| Goal | immediately declares the occupying snake's owner the winner |

`sliding` is distinct from ordinary steering: the game retains drift while the head is on oil. This should be verified with a focused play test before matching the exact feel.

## Level objects and arena features

- **Exact:** maps are TMX files with tile layers and object groups.
- **Exact:** level properties include `name`, `SinglePlayer`, `MaxEggs`, and `PowerUpSpawnFrequency`.
- **Exact:** player and drone spawn points can override rotation, tail length, and speed. Drones can also override rotational velocity.
- **Exact:** levels can provide fixed starting eggs/power-ups, random power-up spawn points, terrain tiles, static walls, moving walls, turrets, portals, rotators, player spawns, and drone spawns.
- **Exact:** walls are 32 × 32 tiles. They can be invincible; ordinary walls are destructible by surviving snake impacts, fireballs, and blasts.
- **Exact:** moving walls have X/Y velocity and rotational velocity. Wall/wall encounters reverse their movement; moving walls can erase trail samples they cross.
- **Exact:** turrets default to one shot every 5 seconds. Maps can override velocity, rotation velocity, firing frequency, and starting rotation. Their shots use the same fireball system.
- **Exact:** portal pairs spawn at two points, grow from 0.1 scale, rotate, live for 17 seconds, then fade. A snake is teleported to its partner and must leave portal contact before another teleport.
- **Exact:** rotators force a snake through a configured signed angle. Angles of at least 45° turn at 1.5×, and at least 90° at 2×; a pad has a 0.5-second reuse cooldown.
- **Exact:** goal terrain ends the round in favour of the snake occupying it.

The deployed default level list is:

1. Void (`empty.tmx`)
2. Castle
3. Skull
4. Fire and Ice
5. Urban
6. Crosshairs
7. Noveria
8. Sprint 2
9. Corners
10. Ice Fortress
11. Sunshine
12. Jungle
13. Bullet Hell

Other level names and previews occur in bundle metadata, but the list above is what the deployed game registers for normal selection. All 13 layouts are now available locally as TMX, so screenshots are visual references rather than geometry sources. `starfield.tmx` is preserved separately until its original intended status is verified.

## Modes

Modes can be combined by playlists, so implementations should prefer composable hooks over a single mutually exclusive mode enum.

| Mode | Behaviour in the deployed build |
| --- | --- |
| Survival | base last-player-alive rules; no extra override found |
| Classic | 90° discrete turns only |
| Carnivore | eggs spawn every 5 seconds; each egg adds `0.225` speed and 30 pixels of maximum trail |
| Dual Wield | inventory capacity becomes 2 |
| Hard to Kill | each snake starts with 2 extra lives, for 3 lives total; death respawns immediately with 3 seconds of flicker protection |
| Infinite | maximum trail length becomes `9,999,999` |
| Power House | power-up spawn interval becomes 3 seconds and every snake starts with a random power-up |
| Rainbow | world power-up spawning stops; each snake is handed a random power-up on a repeating timer and receives the first immediately; public text says every 5 seconds |
| Shields Up | every snake starts at 100 shield; eggs restore 10 shield, capped at 100, but only while shield is still above zero |
| Turbo | starts at normal speed 2 and adds `0.001` speed per tick; turn speed remains `speed + 2` |
| Egg Hunt | first to eat 8 eggs wins; marked for single-player-compatible level selection |
| Drone Hunt | round objective is to eliminate all drones; its public/internal description appears inconsistent and needs play testing |
| Stealth | hides carried power-up rendering from other snakes |
| Claustrophobia | public text says walls close in after 25 seconds; internal timers use a 25-second end timer and staged wall drops |
| Caterpillar | starts with maximum trail 33; power-up capacity is `floor(maxTrailLength / 32)` |
| Volcano | after its trigger, spreads lava from four random seeds across neighbouring wrapped tiles in timed waves |
| Overgrowth | adds four recursively grown random terrain clusters; Fire clusters decay chance faster than other terrain |
| Plumber | enables the always-available basic jump; see the 0.25/0.3 compatibility quirk above |
| Bomb Tail | class and name exist, but no substantive behaviour was found in the deployed implementation |

Mode interactions worth preserving:

- **Exact:** Power House reduces the shared power-up timer to 3 seconds and gives starting inventory.
- **Exact:** Rainbow stops world power-up spawning and uses that timer to distribute items. Dual Wield and Power House further alter its timing/inventory behaviour.
- **Exact:** mode lifecycle hooks cover round start, snake spawn, egg collection, snake death, update, and render, which is why combinations work without replacing the base rules.
- **Uncertain:** Claustrophobia's precise wall-drop order and Volcano/Overgrowth cluster shapes should be captured visually when those modes are next available.

## Round presentation and audiovisual cues

These do not change simulation, but are part of the feel:

- **Exact:** first-time control help fades by `0.002` alpha per render/update while the round is running.
- **Exact:** jump and landing have separate sounds; landing always emits a visible shockwave.
- **Exact:** protected snakes flicker between alpha 0 and 1 every 0.05 seconds.
- **Exact:** shield strength is rendered as a circle around the head with opacity based on the remaining shield.
- **Exact:** a dead snake explodes, drops its inventory, and leaves its trail in the arena.
- **Exact:** the round scoreboard uses eggs as win markers and briefly blinks the newest marker.
- **Public:** Escape opens the menu/options flow.

## Implementation guidance for online multiplayer

The original is a deterministic-feeling local 60 Hz game, but our server remains authoritative. To preserve feel without coupling network rate to render rate:

- Run gameplay constants in seconds/metres-or-pixels, but retain a 60 Hz reference conversion in tests.
- Model the head and each trail section separately. A jump must pause emission and start a new trail segment on landing.
- Keep collision state explicit (`jumping`, `ghost`, `flicker`, `portal`, `stunned`, `dead`) rather than inferring it from visuals.
- Timestamp input transitions on the server. Fire/action must be edge-triggered, and simultaneous steering needs deterministic precedence.
- Represent mode changes as composable rule hooks; playlists in the original combine modes.
- Make wrap-aware collision and blast duplication reusable primitives for heads, projectiles, trails, and explosions.
- Preserve original values behind named configuration rather than scattering literals through rendering and simulation.
- Add golden tests for the derived jump durations/gap lengths, normal turning circle, trail sampling, collision immunity states, and shield damage transitions.

## Open verification list

These are the remaining high-value questions, not permission to guess:

- Exact analog-stick dead zone and button mapping for each gamepad type.
- Exact oil drift integration and how quickly direction catches up after leaving oil.
- Whether Napalm was intended to ignite terrain; the deployed build only proves its smaller grenade blast and leaves its `ignited` field unused.
- Rail gun's active-vs-visible tick split and whether its ability to hit jumping/ghost snakes is noticeable in play.
- Precise Claustrophobia wall-drop sequence.
- Precise Volcano and Overgrowth propagation shapes and timing.
- Drone AI, Drone Hunt win text/conditions, and single-player restrictions.
- Which hidden power-ups and levels were intentionally player-facing versus leftover or debug content.
- Exact playlist defaults, round intermission timing, and selectable wins-to-match values.
- Original collision radii/masks for each sprite where the bundle delegates to image/object bounds.

When a point is verified, move it into the relevant section, label the evidence, and remove it from this list.
