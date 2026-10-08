import type { CommendationCounts, CommendationId } from './badges.ts';

export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 672;
export const SNAKE_HEAD_RADIUS = 7;

export type Point = { x: number; y: number };

export type InputState = {
  left: boolean;
  right: boolean;
  jump: boolean;
  power: boolean;
};

export type FoodSnapshot = Point & { id: number };

export type PowerUpType =
  | 'speed-boost'
  | 'fireball'
  | 'jumper'
  | 'grenade'
  | 'one-eighty'
  | 'rail-gun'
  | 'trident'
  | 'ghost'
  | 'tron-mode'
  | 'shield'
  | 'napalm'
  | 'disco-ball';

export type GameMode = 'quickplay' | 'survival';

export type GamePhase =
  | 'lobby'
  | 'countdown'
  | 'playing'
  | 'round-over'
  | 'intermission'
  | 'match-over';

export type RoomPlayerSnapshot = {
  id: string;
  name: string;
  color: number;
  ready: boolean;
  wins: number;
  spectator: boolean;
  saved: boolean;
  commendations: CommendationCounts;
};

export type AccountIdentity = {
  id: string;
  username: string;
  createdAt: string;
  commendations: CommendationCounts;
};

export type RoundCommendationAward = {
  playerId: string;
  commendations: CommendationId[];
};

export type PowerUpSnapshot = Point & {
  id: number;
  type: PowerUpType;
  scale: number;
};

export type GameEventType =
  | 'jump'
  | 'land'
  | 'food-collected'
  | 'snake-death'
  | 'power-up-collected'
  | 'speed-boost'
  | 'fireball-launched'
  | 'fireball-impact'
  | 'grenade-explosion'
  | 'one-eighty'
  | 'rail-gun'
  | 'trident';

export type GameEvent = Point & {
  id: number;
  type: GameEventType;
  powerUp?: PowerUpType;
};

export type FireballSnapshot = Point & {
  id: number;
  angle: number;
  ownerId: string;
};

export type GrenadeSnapshot = Point & {
  id: number;
  angle: number;
  ownerId: string;
  scale: number;
};

export type BlastSnapshot = Point & {
  id: number;
  radius: number;
  progress: number;
  kind: 'explosion' | 'shockwave';
};

export type TurretSnapshot = Point & {
  id: number;
  angle: number;
};

export type TurretShotSnapshot = Point & {
  id: number;
  angle: number;
};

export type RailSnapshot = {
  id: number;
  ownerId: string;
  start: Point;
  end: Point;
  opacity: number;
};

export type TrailPoint = Point & { segment: number };

export type DetachedTrailSnapshot = {
  id: number;
  color: number;
  body: TrailPoint[];
};

export type SnakeSnapshot = {
  id: string;
  ownerId: string;
  name: string;
  color: number;
  head: Point;
  body: TrailPoint[];
  angle: number;
  jump: number;
  jumpScale: number;
  alive: boolean;
  invulnerable: boolean;
  dots: number;
  deaths: number;
  pingMs: number | null;
  powerUp: PowerUpType | null;
  speedBoost: number;
  shield: number;
  ghosted: boolean;
  stunned: boolean;
};

export type GameSnapshot = {
  type: 'snapshot';
  sequence: number;
  room: string;
  levelId: string;
  devMode: boolean;
  serverTime: number;
  phase: GamePhase;
  mode: GameMode;
  hostId: string | null;
  players: RoomPlayerSnapshot[];
  winsToMatch: number;
  roundNumber: number;
  phaseEndsAt: number | null;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  commendationEventId: number;
  roundCommendations: RoundCommendationAward[];
  discoUntil: number | null;
  snakes: SnakeSnapshot[];
  food: FoodSnapshot[];
  powerUps: PowerUpSnapshot[];
  fireballs: FireballSnapshot[];
  grenades: GrenadeSnapshot[];
  blasts: BlastSnapshot[];
  rails: RailSnapshot[];
  turrets: TurretSnapshot[];
  turretShots: TurretShotSnapshot[];
  events: GameEvent[];
  detachedTrails: DetachedTrailSnapshot[];
  destroyedWalls: number[];
};

export type PackedSnakeSnapshot = Omit<SnakeSnapshot, 'body'> & {
  body: string;
};

export type PackedDetachedTrailSnapshot = Omit<
  DetachedTrailSnapshot,
  'body'
> & {
  body: string;
};

export type PackedGameSnapshot = Omit<
  GameSnapshot,
  'snakes' | 'detachedTrails'
> & {
  encoding: 'trail-pack-v1';
  snakes: PackedSnakeSnapshot[];
  detachedTrails: PackedDetachedTrailSnapshot[];
};

export type WelcomeMessage = {
  type: 'welcome';
  playerId: string;
  room: string;
  account: AccountIdentity | null;
  connectionToken: string;
};

export type PongMessage = {
  type: 'pong';
  sentAt: number;
};

export type ServerMessage = WelcomeMessage | PackedGameSnapshot | PongMessage;

export type ClientMessage =
  | { type: 'input'; input: InputState; sequence: number }
  | { type: 'ping'; sentAt: number }
  | { type: 'latency'; pingMs: number }
  | { type: 'ready'; ready: boolean }
  | {
      type: 'configure';
      mode?: GameMode;
      levelId?: string;
      winsToMatch?: number;
    }
  | { type: 'start-match' }
  | { type: 'rematch' }
  | { type: 'return-to-lobby' }
  | {
      type: 'network-stats';
      snapshotIntervalMs: number;
      snapshotJitterMs: number;
      snapshotDecodeMs: number;
      droppedSnapshots: number;
      staleSnapshots: number;
    };
