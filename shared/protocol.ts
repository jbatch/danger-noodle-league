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

export type PowerUpType = 'speed-boost' | 'fireball';

export type PowerUpSnapshot = Point & {
  id: number;
  type: PowerUpType;
};

export type FireballSnapshot = Point & {
  id: number;
  angle: number;
  ownerId: string;
};

export type TrailPoint = Point & { segment: number };

export type SnakeSnapshot = {
  id: string;
  name: string;
  color: number;
  head: Point;
  body: TrailPoint[];
  angle: number;
  jump: number;
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
  serverTime: number;
  snakes: SnakeSnapshot[];
  food: FoodSnapshot[];
  powerUps: PowerUpSnapshot[];
  fireballs: FireballSnapshot[];
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
