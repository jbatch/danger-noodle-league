export type AssetPalette = 'classic' | 'handmade';
export type LevelPreviewSize = 'small' | 'medium';

type AssetPair = {
  classic: string;
  handmade: string;
};

function pair(classic: string, handmade: string): AssetPair {
  return { classic, handmade };
}

export const AUDIO_ASSETS = {
  theme: pair(
    '/audio/music/snakes-theme-classic.ogg',
    '/audio/music/snakes-theme-handmade.ogg',
  ),
  jump: pair('/audio/sfx/jump-classic.ogg', '/audio/sfx/jump-handmade.ogg'),
  land: pair('/audio/sfx/land-classic.ogg', '/audio/sfx/land-handmade.ogg'),
  food: pair(
    '/audio/sfx/eat-chew-classic.wav',
    '/audio/sfx/eat-chew-handmade.wav',
  ),
  death: pair(
    '/audio/sfx/explosion-classic.wav',
    '/audio/sfx/explosion-handmade.wav',
  ),
  fireballLaunch: pair(
    '/audio/sfx/Fireball_Launch5-classic.wav',
    '/audio/sfx/Fireball_Launch5-handmade.wav',
  ),
  fireballImpact: pair(
    '/audio/sfx/Explo_Small_02-classic.wav',
    '/audio/sfx/Explo_Small_02-handmade.wav',
  ),
  grenadeExplosion: pair(
    '/audio/sfx/grenade_explosion-classic.ogg',
    '/audio/sfx/grenade_explosion-handmade.ogg',
  ),
  railGun: pair(
    '/audio/sfx/EnergyRifle_Impact1-classic.wav',
    '/audio/sfx/EnergyRifle_Impact1-handmade.wav',
  ),
  pickupSpeed: pair(
    '/audio/sfx/Pickup_Speed02-classic.wav',
    '/audio/sfx/Pickup_Speed02-handmade.wav',
  ),
  magicAppear: pair(
    '/audio/sfx/Magic_Appear01-classic.wav',
    '/audio/sfx/Magic_Appear01-handmade.wav',
  ),
  magicRespawn: pair(
    '/audio/sfx/Magic_Respawn03-classic.wav',
    '/audio/sfx/Magic_Respawn03-handmade.wav',
  ),
  pickupFire: pair(
    '/audio/sfx/Pickup_Fire-classic.wav',
    '/audio/sfx/Pickup_Fire-handmade.wav',
  ),
  pickupMagicSpeed: pair(
    '/audio/sfx/Pickup_Magic_Speed04-classic.wav',
    '/audio/sfx/Pickup_Magic_Speed04-handmade.wav',
  ),
  ammoPickup: pair(
    '/audio/sfx/Gun_Ammo_Pickup04-classic.wav',
    '/audio/sfx/Gun_Ammo_Pickup04-handmade.wav',
  ),
  pickupScifi: pair(
    '/audio/sfx/Pickup_Scifi_Energy01-classic.wav',
    '/audio/sfx/Pickup_Scifi_Energy01-handmade.wav',
  ),
  pickupSwish: pair(
    '/audio/sfx/Pickup_MiscSwish01-classic.wav',
    '/audio/sfx/Pickup_MiscSwish01-handmade.wav',
  ),
  magicDisappear: pair(
    '/audio/sfx/Magic_Disappear-classic.wav',
    '/audio/sfx/Magic_Disappear-handmade.wav',
  ),
} as const satisfies Record<string, AssetPair>;

export const TILE_ASSETS = {
  terrain: pair(
    '/levels/tiles/terrainSheet-classic.png',
    '/levels/tiles/terrainSheet-handmade.png',
  ),
  walls: pair(
    '/levels/tiles/wallTileSheet-classic.png',
    '/levels/tiles/wallTileSheet-handmade.png',
  ),
  overlays: pair(
    '/levels/tiles/overlaySheet-classic.png',
    '/levels/tiles/overlaySheet-handmade.png',
  ),
} as const satisfies Record<string, AssetPair>;

export type AudioAssetId = keyof typeof AUDIO_ASSETS;
export type TileAssetId = keyof typeof TILE_ASSETS;

// Add an ID here only after its matching -handmade file has been supplied.
// Until then, Handmade mode deliberately falls back to the Classic asset.
export const HANDMADE_READY_AUDIO: ReadonlySet<AudioAssetId> = new Set([]);
export const HANDMADE_READY_TILES: ReadonlySet<TileAssetId> = new Set([]);
export const HANDMADE_READY_PREVIEWS: ReadonlySet<string> = new Set([]);

function resolvedPath<T extends string>(
  assets: Record<T, AssetPair>,
  ready: ReadonlySet<T>,
  id: T,
  palette: AssetPalette,
) {
  const asset = assets[id];
  return palette === 'handmade' && ready.has(id)
    ? asset.handmade
    : asset.classic;
}

export function audioAssetPath(id: AudioAssetId, palette: AssetPalette) {
  return resolvedPath(AUDIO_ASSETS, HANDMADE_READY_AUDIO, id, palette);
}

export function tileAssetPath(id: TileAssetId, palette: AssetPalette) {
  return resolvedPath(TILE_ASSETS, HANDMADE_READY_TILES, id, palette);
}

export function levelPreviewPath(
  levelId: string,
  size: LevelPreviewSize,
  palette: AssetPalette,
) {
  const key = `${levelId}:${size}`;
  const selected =
    palette === 'handmade' && HANDMADE_READY_PREVIEWS.has(key)
      ? 'handmade'
      : 'classic';
  return `/levels/previews/${levelId}-${size}-${selected}.png`;
}
