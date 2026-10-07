export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 672;

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
  | 'trident';

export type PowerUpSnapshot = Point & {
  id: number;
  type: PowerUpType;
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
};

export type GameSnapshot = {
  type: 'snapshot';
  room: string;
  levelId: string;
  devMode: boolean;
  serverTime: number;
  snakes: SnakeSnapshot[];
  food: FoodSnapshot[];
  powerUps: PowerUpSnapshot[];
  fireballs: FireballSnapshot[];
  grenades: GrenadeSnapshot[];
  blasts: BlastSnapshot[];
  rails: RailSnapshot[];
  events: GameEvent[];
  detachedTrails: DetachedTrailSnapshot[];
  destroyedWalls: number[];
};

export type WelcomeMessage = {
  type: 'welcome';
  playerId: string;
  room: string;
};

export type PongMessage = {
  type: 'pong';
  sentAt: number;
};

export type ServerMessage = WelcomeMessage | GameSnapshot | PongMessage;

export type ClientMessage =
  | { type: 'input'; input: InputState; sequence: number }
  | { type: 'ping'; sentAt: number }
  | { type: 'latency'; pingMs: number };
