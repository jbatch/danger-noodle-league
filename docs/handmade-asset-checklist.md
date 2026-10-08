# Handmade asset-pack checklist

The game supports two local presentation packs:

- **Classic** contains the recovered Viper League presentation files. Every shipped file ends in `-classic`.
- **Handmade** is the replacement pack. Matching files end in `-handmade` and can be enabled one at a time; anything not ready falls back to Classic.

Choose **Art & sound → Handmade** from the settings menu to test the replacement pack. The choice is stored in `localStorage` as `dnl-asset-palette`.

## Adding a finished replacement

1. Export it to the exact `-handmade` path below. Preserve the listed image dimensions; audio can vary slightly in length unless the cue timing matters.
2. Add its key to `HANDMADE_READY_AUDIO`, `HANDMADE_READY_TILES`, or `HANDMADE_READY_PREVIEWS` in `shared/assets.ts`.
3. Run `npm test` and `npm run build`, then audition both packs in the browser.

Do not overwrite the Classic file. A partly completed Handmade pack is safe because unresolved entries deliberately use the Classic version.

## Audio replacements

Prefer OGG for music/long ambience and either WAV or OGG for short effects. Remove long silence, avoid clipping, and audition effects at the existing per-event volume before changing the mix.

| Done | Use                          | Handmade file                                         | Classic reference length |
| ---- | ---------------------------- | ----------------------------------------------------- | -----------------------: |
| [ ]  | Looping theme                | `public/audio/music/snakes-theme-handmade.ogg`        |                 102.03 s |
| [ ]  | Jump launch                  | `public/audio/sfx/jump-handmade.ogg`                  |                   0.60 s |
| [ ]  | Landing/shockwave            | `public/audio/sfx/land-handmade.ogg`                  |                   1.00 s |
| [ ]  | Egg collection               | `public/audio/sfx/eat-chew-handmade.wav`              |                   1.34 s |
| [ ]  | Snake death                  | `public/audio/sfx/explosion-handmade.wav`             |                   1.93 s |
| [ ]  | Fireball launch              | `public/audio/sfx/Fireball_Launch5-handmade.wav`      |                   1.36 s |
| [ ]  | Fireball impact/clash        | `public/audio/sfx/Explo_Small_02-handmade.wav`        |                   2.04 s |
| [ ]  | Grenade explosion            | `public/audio/sfx/grenade_explosion-handmade.ogg`     |                   1.41 s |
| [ ]  | Rail Gun shot                | `public/audio/sfx/EnergyRifle_Impact1-handmade.wav`   |                   1.03 s |
| [ ]  | Speed Boost cue/pickup       | `public/audio/sfx/Pickup_Speed02-handmade.wav`        |                   1.33 s |
| [ ]  | One Eighty/general magic cue | `public/audio/sfx/Magic_Appear01-handmade.wav`        |                   2.12 s |
| [ ]  | Trident activation           | `public/audio/sfx/Magic_Respawn03-handmade.wav`       |                   0.81 s |
| [ ]  | Fireball/Napalm pickup       | `public/audio/sfx/Pickup_Fire-handmade.wav`           |                   0.83 s |
| [ ]  | Jumper/Tron pickup           | `public/audio/sfx/Pickup_Magic_Speed04-handmade.wav`  |                   0.96 s |
| [ ]  | Grenade pickup               | `public/audio/sfx/Gun_Ammo_Pickup04-handmade.wav`     |                   0.33 s |
| [ ]  | Rail Gun/Shield pickup       | `public/audio/sfx/Pickup_Scifi_Energy01-handmade.wav` |                   1.09 s |
| [ ]  | Trident pickup               | `public/audio/sfx/Pickup_MiscSwish01-handmade.wav`    |                   0.45 s |
| [ ]  | Ghost pickup                 | `public/audio/sfx/Magic_Disappear-handmade.wav`       |                   0.83 s |

Two known original cues are absent locally. These can be designed directly instead of matching a Classic file:

- [ ] Speed Boost/One Eighty activation whoosh, replacing `Whoosh_BigJump2.wav`.
- [ ] Energy fireball impact/wall-destruction cue, replacing `Explo_EnergyFireball01.wav`.

## Gameplay tile sheets

Every frame is 32 × 32 pixels. Preserve sheet width, frame order, transparency, and collision meaning; only the appearance changes.

| Done |            Frames | Dimensions | Handmade file                                    |
| ---- | ----------------: | ---------: | ------------------------------------------------ |
| [ ]  |    16 wall frames |   512 × 32 | `public/levels/tiles/wallTileSheet-handmade.png` |
| [ ]  |  8 terrain frames |   256 × 32 | `public/levels/tiles/terrainSheet-handmade.png`  |
| [ ]  | 16 overlay frames |   512 × 32 | `public/levels/tiles/overlaySheet-handmade.png`  |

## Level previews

Create both crops for every selectable arena: `small` is 160 × 83 and `medium` is 425 × 223. Preview readiness keys use the form `castle:small` and `castle:medium`.

| Done | Arena        | Small file                       | Medium file                       |
| ---- | ------------ | -------------------------------- | --------------------------------- |
| [ ]  | Void         | `empty-small-handmade.png`       | `empty-medium-handmade.png`       |
| [ ]  | Castle       | `castle-small-handmade.png`      | `castle-medium-handmade.png`      |
| [ ]  | Skull        | `skull-small-handmade.png`       | `skull-medium-handmade.png`       |
| [ ]  | Fire and Ice | `fireandice-small-handmade.png`  | `fireandice-medium-handmade.png`  |
| [ ]  | Urban        | `urban-small-handmade.png`       | `urban-medium-handmade.png`       |
| [ ]  | Crosshairs   | `crosshairs-small-handmade.png`  | `crosshairs-medium-handmade.png`  |
| [ ]  | Noveria      | `noveria-small-handmade.png`     | `noveria-medium-handmade.png`     |
| [ ]  | Sprint 2     | `sprint2-small-handmade.png`     | `sprint2-medium-handmade.png`     |
| [ ]  | Corners      | `corners-small-handmade.png`     | `corners-medium-handmade.png`     |
| [ ]  | Ice Fortress | `icefortress-small-handmade.png` | `icefortress-medium-handmade.png` |
| [ ]  | Sunshine     | `sunshine-small-handmade.png`    | `sunshine-medium-handmade.png`    |
| [ ]  | Jungle       | `jungle-small-handmade.png`      | `jungle-medium-handmade.png`      |
| [ ]  | Bullet Hell  | `bullethell-small-handmade.png`  | `bullethell-medium-handmade.png`  |

Store preview files under `public/levels/previews/`. Starfield remains a non-selectable validation map and does not currently need previews.

## New sprite work not yet wired

These visuals are currently drawn with canvas primitives or are waiting on gameplay support. They should use the same Handmade style, but they are a second integration step rather than drop-in pack replacements:

- [ ] Egg/food sprite, ideally a transparent 32 × 32 source.
- [ ] Power-up sheet covering every visible pickup, with 32 × 32 frames.
- [ ] Feature sheet for fixed level objects, with 32 × 32 frames.
- [ ] Turret body, turret shot, and destruction treatment.
- [ ] Portal pair and activation/transport treatment.
- [ ] Fireball, grenade, Rail Gun, blast, and shockwave sprites/animations.
- [ ] Snake head/body treatment, including shield, ghost, stun, death, and Trident states.
- [ ] Disco overlay with a reduced-flash-safe variant.

When these are introduced, add them to `shared/assets.ts` instead of embedding file paths directly in the renderer.
