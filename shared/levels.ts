import type { Point, PowerUpType } from './protocol.ts';

export type LevelTile = {
  id: number;
  x: number;
  y: number;
  frame: number;
};

export type LevelSpawn = Point & {
  angle: number;
  speed?: number;
  tailLength?: number;
};

export type LevelSpawnArea = Point & {
  width: number;
  height: number;
};

export type LevelFixedItem = Point & {
  kind: 'egg' | PowerUpType | 'ghost' | 'shield' | 'napalm' | 'disco-ball';
  lifespan: number | null;
};

export type LevelObject = Point & {
  id: number;
  frame: number | null;
  width: number;
  height: number;
  rotation: number;
  properties: Readonly<Record<string, string | number | boolean>>;
};

export type CompiledLevel = {
  id: string;
  displayName: string;
  source: string;
  previewSmall: string;
  previewMedium: string;
  selectable: boolean;
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  maxEggs: number;
  powerUpSpawnFrequency: number;
  singlePlayer: boolean;
  walls: readonly LevelTile[];
  terrain: readonly LevelTile[];
  overlays: readonly LevelTile[];
  playerSpawns: readonly LevelSpawn[];
  powerUpSpawns: readonly LevelSpawnArea[];
  fixedItems: readonly LevelFixedItem[];
  features: readonly LevelObject[];
  movingWalls: readonly LevelObject[];
  droneSpawns: readonly LevelObject[];
};
