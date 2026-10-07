export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 900;

export type Point = { x: number; y: number };

export type InputState = {
  left: boolean;
  right: boolean;
  jump: boolean;
  power: boolean;
};

export type FoodSnapshot = Point & { id: number };

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
};

export type GameSnapshot = {
  type: 'snapshot';
  room: string;
  serverTime: number;
  snakes: SnakeSnapshot[];
  food: FoodSnapshot[];
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
