import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type FoodSnapshot,
  type GameSnapshot,
  type InputState,
  type Point,
  type SnakeSnapshot,
  type TrailPoint,
} from '../shared/protocol.ts';

const SPEED = 205;
const TURN_SPEED = 3.05;
const BODY_SPACING = 8;
const START_LENGTH = 26;
const FOOD_GROWTH = 7;
const FOOD_COUNT = 34;
const JUMP_DURATION = 0.78;
const JUMP_COOLDOWN = 1.2;
const RESPAWN_DELAY_MS = 1_250;
const SPAWN_GRACE_MS = 950;
const HEAD_RADIUS = 11;
const BODY_RADIUS = 7;

type Random = () => number;

type Snake = SnakeSnapshot & {
  input: InputState;
  targetLength: number;
  sampleDistance: number;
  jumpRemaining: number;
  jumpCooldown: number;
  jumpWasDown: boolean;
  trailSegment: number;
  respawnAt: number;
  invulnerableUntil: number;
};

const EMPTY_INPUT: InputState = {
  left: false,
  right: false,
  jump: false,
  power: false,
};

function wrap(value: number, size: number) {
  return ((value % size) + size) % size;
}

function wrappedDelta(a: number, b: number, size: number) {
  const direct = a - b;
  if (direct > size / 2) return direct - size;
  if (direct < -size / 2) return direct + size;
  return direct;
}

export function toroidalDistance(a: Point, b: Point) {
  const dx = wrappedDelta(a.x, b.x, WORLD_WIDTH);
  const dy = wrappedDelta(a.y, b.y, WORLD_HEIGHT);
  return Math.hypot(dx, dy);
}

function sanitizeName(value: string) {
  const clean = value
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .slice(0, 16);
  return clean || 'Mystery Noodle';
}

export class GameRoom {
  readonly id: string;
  readonly snakes = new Map<string, Snake>();
  readonly food: FoodSnapshot[] = [];
  private readonly random: Random;
  private nextFoodId = 1;

  constructor(id: string, random: Random = Math.random) {
    this.id = id;
    this.random = random;
    this.fillFood();
  }

  addPlayer(id: string, name: string) {
    const color = Math.floor(this.random() * 360);
    const snake = this.createSnake(id, sanitizeName(name), color, Date.now());
    this.snakes.set(id, snake);
    return snake;
  }

  removePlayer(id: string) {
    this.snakes.delete(id);
  }

  setInput(id: string, input: InputState) {
    const snake = this.snakes.get(id);
    if (!snake) return;
    snake.input = {
      left: Boolean(input.left),
      right: Boolean(input.right),
      jump: Boolean(input.jump),
      power: Boolean(input.power),
    };
  }

  setPing(id: string, pingMs: number) {
    const snake = this.snakes.get(id);
    if (!snake || !Number.isFinite(pingMs)) return;
    snake.pingMs = Math.round(Math.min(Math.max(pingMs, 0), 9_999));
  }

  step(now: number, dt: number) {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);

    for (const snake of this.snakes.values()) {
      if (!snake.alive) {
        if (now >= snake.respawnAt) this.respawn(snake, now);
        continue;
      }

      snake.invulnerable = now < snake.invulnerableUntil;
      snake.jumpCooldown = Math.max(0, snake.jumpCooldown - safeDt);

      const jumpPressed = snake.input.jump && !snake.jumpWasDown;
      snake.jumpWasDown = snake.input.jump;
      if (jumpPressed && snake.jumpCooldown <= 0) {
        snake.jumpRemaining = JUMP_DURATION;
        snake.jumpCooldown = JUMP_COOLDOWN;
      }

      const wasAirborne = snake.jumpRemaining > 0;
      if (wasAirborne) {
        snake.jumpRemaining = Math.max(0, snake.jumpRemaining - safeDt);
        const progress = 1 - snake.jumpRemaining / JUMP_DURATION;
        snake.jump = Math.sin(progress * Math.PI);
      } else {
        snake.jump = 0;
      }

      const turn = Number(snake.input.right) - Number(snake.input.left);
      snake.angle += turn * TURN_SPEED * safeDt;

      const head = snake.head;
      const previous = { ...head };
      head.x = wrap(
        head.x + Math.cos(snake.angle) * SPEED * safeDt,
        WORLD_WIDTH,
      );
      head.y = wrap(
        head.y + Math.sin(snake.angle) * SPEED * safeDt,
        WORLD_HEIGHT,
      );

      const airborne = snake.jumpRemaining > 0;
      if (airborne) {
        snake.sampleDistance = 0;
      } else {
        if (wasAirborne) {
          snake.trailSegment += 1;
          snake.sampleDistance = 0;
        }
        snake.sampleDistance += toroidalDistance(previous, head);
        while (snake.sampleDistance >= BODY_SPACING) {
          snake.sampleDistance -= BODY_SPACING;
          snake.body.unshift({ ...previous, segment: snake.trailSegment });
        }
      }
      while (snake.body.length > snake.targetLength) snake.body.pop();

      this.collectFood(snake);
    }

    const collisions = new Map<string, string | null>();
    for (const snake of this.snakes.values()) {
      if (!snake.alive || snake.invulnerable || snake.jump > 0.04) continue;
      const head = snake.head;

      for (const other of this.snakes.values()) {
        if (!other.alive) continue;
        const start = other.id === snake.id ? 13 : 3;
        for (let i = start; i < other.body.length; i += 2) {
          if (
            toroidalDistance(head, other.body[i]) <
            HEAD_RADIUS + BODY_RADIUS
          ) {
            collisions.set(snake.id, other.id === snake.id ? null : other.id);
            break;
          }
        }
        if (collisions.has(snake.id)) break;
      }
    }

    for (const [snakeId] of collisions) {
      const snake = this.snakes.get(snakeId);
      if (!snake || !snake.alive) continue;
      snake.alive = false;
      snake.deaths += 1;
      snake.respawnAt = now + RESPAWN_DELAY_MS;
      snake.jump = 0;
      snake.body = [];
    }

    this.fillFood();
  }

  snapshot(now = Date.now()): GameSnapshot {
    return {
      type: 'snapshot',
      room: this.id,
      serverTime: now,
      food: this.food.map((item) => ({ ...item })),
      snakes: [...this.snakes.values()].map((snake) => ({
        id: snake.id,
        name: snake.name,
        color: snake.color,
        head: { ...snake.head },
        body: snake.body.map((point) => ({ ...point })),
        angle: snake.angle,
        jump: snake.jump,
        alive: snake.alive,
        invulnerable: snake.invulnerable,
        dots: snake.dots,
        deaths: snake.deaths,
        pingMs: snake.pingMs,
      })),
    };
  }

  private collectFood(snake: Snake) {
    if (!snake.alive) return;
    const head = snake.head;
    for (let i = this.food.length - 1; i >= 0; i -= 1) {
      if (toroidalDistance(head, this.food[i]) < 22) {
        this.food.splice(i, 1);
        snake.targetLength += FOOD_GROWTH;
        snake.dots += 1;
      }
    }
  }

  private fillFood() {
    while (this.food.length < FOOD_COUNT) {
      this.food.push({
        id: this.nextFoodId++,
        x: 34 + this.random() * (WORLD_WIDTH - 68),
        y: 34 + this.random() * (WORLD_HEIGHT - 68),
      });
    }
  }

  private respawn(snake: Snake, now: number) {
    const fresh = this.createSnake(snake.id, snake.name, snake.color, now);
    snake.head = fresh.head;
    snake.body = fresh.body;
    snake.angle = fresh.angle;
    snake.input = { ...EMPTY_INPUT };
    snake.targetLength = fresh.targetLength;
    snake.sampleDistance = 0;
    snake.jumpRemaining = 0;
    snake.jumpCooldown = 0;
    snake.jumpWasDown = false;
    snake.trailSegment = fresh.trailSegment;
    snake.alive = true;
    snake.invulnerable = true;
    snake.invulnerableUntil = now + SPAWN_GRACE_MS;
  }

  private createSnake(
    id: string,
    name: string,
    color: number,
    now: number,
  ): Snake {
    const x = 180 + this.random() * (WORLD_WIDTH - 360);
    const y = 150 + this.random() * (WORLD_HEIGHT - 300);
    const angle = this.random() * Math.PI * 2;
    const body: TrailPoint[] = [];
    for (let index = 0; index < START_LENGTH; index += 1) {
      body.push({
        x: wrap(
          x - Math.cos(angle) * (index + 1) * BODY_SPACING,
          WORLD_WIDTH,
        ),
        y: wrap(
          y - Math.sin(angle) * (index + 1) * BODY_SPACING,
          WORLD_HEIGHT,
        ),
        segment: 0,
      });
    }

    return {
      id,
      name,
      color,
      head: { x, y },
      body,
      angle,
      jump: 0,
      alive: true,
      invulnerable: true,
      dots: 0,
      deaths: 0,
      pingMs: null,
      input: { ...EMPTY_INPUT },
      targetLength: START_LENGTH,
      sampleDistance: 0,
      jumpRemaining: 0,
      jumpCooldown: 0,
      jumpWasDown: false,
      trailSegment: 0,
      respawnAt: 0,
      invulnerableUntil: now + SPAWN_GRACE_MS,
    };
  }
}
