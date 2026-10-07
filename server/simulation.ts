import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type FireballSnapshot,
  type FoodSnapshot,
  type GameSnapshot,
  type InputState,
  type Point,
  type PowerUpSnapshot,
  type PowerUpType,
  type SnakeSnapshot,
} from '../shared/protocol.ts';

const UPDATE_RATE = 60;
const BASE_SPEED = 2 * UPDATE_RATE;
const TURN_SPEED = (4 * Math.PI * UPDATE_RATE) / 180;
const TRAIL_SPACING = 3;
const MAX_TRAIL_LENGTH = 350;
const START_TRAIL_POINTS = Math.round(MAX_TRAIL_LENGTH / TRAIL_SPACING);
const FOOD_GROWTH = Math.round(60 / TRAIL_SPACING);
const FOOD_COUNT = 4;
const FOOD_SPAWN_SECONDS = 4;
const POWER_UP_SPAWN_SECONDS = 8;
const POWER_UP_LIFESPAN_SECONDS = 12;
const MAX_WORLD_POWER_UPS = 2;
const JUMP_DURATION = 28 / UPDATE_RATE;
const SPEED_BOOST_AMOUNT = 3 * UPDATE_RATE;
const SPEED_BOOST_CUTOFF = 1 * UPDATE_RATE;
const SPEED_BOOST_DECAY_PER_TICK = 0.985;
const FIREBALL_SPEED = 5 * UPDATE_RATE;
const RESPAWN_DELAY_MS = 1_250;
const SPAWN_GRACE_MS = 2_000;
const HEAD_RADIUS = 11;
const BODY_RADIUS = 3;
const FIREBALL_RADIUS = 16;
const PICKUP_RADIUS = 22;

export const GAMEPLAY = {
  updateRate: UPDATE_RATE,
  baseSpeed: BASE_SPEED,
  turnSpeed: TURN_SPEED,
  trailSpacing: TRAIL_SPACING,
  maxTrailLength: MAX_TRAIL_LENGTH,
  jumpDuration: JUMP_DURATION,
  speedBoostAmount: SPEED_BOOST_AMOUNT,
  fireballSpeed: FIREBALL_SPEED,
} as const;

type Random = () => number;

type Snake = SnakeSnapshot & {
  input: InputState;
  targetLength: number;
  sampleDistance: number;
  jumpRemaining: number;
  jumpWasDown: boolean;
  powerWasDown: boolean;
  flightAngle: number;
  trailSegment: number;
  respawnAt: number;
  invulnerableUntil: number;
  leftPressedOrder: number;
  rightPressedOrder: number;
};

type WorldPowerUp = PowerUpSnapshot & { lifeRemaining: number };
type Fireball = FireballSnapshot;

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
  readonly powerUps: WorldPowerUp[] = [];
  readonly fireballs: Fireball[] = [];
  private readonly random: Random;
  private nextFoodId = 1;
  private nextPowerUpId = 1;
  private nextFireballId = 1;
  private inputOrder = 0;
  private foodSpawnClock = 0;
  private powerUpSpawnClock = 0;
  private nextPowerUpType: PowerUpType = 'speed-boost';

  constructor(id: string, random: Random = Math.random) {
    this.id = id;
    this.random = random;
    this.fillFood();
    this.spawnPowerUp('speed-boost', {
      x: WORLD_WIDTH * 0.33,
      y: WORLD_HEIGHT * 0.36,
    });
    this.spawnPowerUp('fireball', {
      x: WORLD_WIDTH * 0.67,
      y: WORLD_HEIGHT * 0.64,
    });
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
    const left = Boolean(input.left);
    const right = Boolean(input.right);
    if (left && !snake.input.left) snake.leftPressedOrder = ++this.inputOrder;
    if (right && !snake.input.right)
      snake.rightPressedOrder = ++this.inputOrder;
    snake.input = {
      left,
      right,
      jump: Boolean(input.jump),
      power: Boolean(input.power),
    };
  }

  setPing(id: string, pingMs: number) {
    const snake = this.snakes.get(id);
    if (!snake || !Number.isFinite(pingMs)) return;
    snake.pingMs = Math.round(Math.min(Math.max(pingMs, 0), 9_999));
  }

  spawnPowerUp(type: PowerUpType, point = this.randomArenaPoint()) {
    const powerUp: WorldPowerUp = {
      id: this.nextPowerUpId++,
      type,
      x: point.x,
      y: point.y,
      lifeRemaining: POWER_UP_LIFESPAN_SECONDS,
    };
    this.powerUps.push(powerUp);
    return powerUp;
  }

  step(now: number, dt: number) {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);

    this.updateWorldSpawns(safeDt);

    for (const snake of this.snakes.values()) {
      if (!snake.alive) {
        if (now >= snake.respawnAt) this.respawn(snake, now);
        continue;
      }

      snake.invulnerable = now < snake.invulnerableUntil;

      const jumpPressed = snake.input.jump && !snake.jumpWasDown;
      const powerPressed = snake.input.power && !snake.powerWasDown;
      snake.jumpWasDown = snake.input.jump;
      snake.powerWasDown = snake.input.power;

      if (jumpPressed && snake.jumpRemaining <= 0) {
        snake.jumpRemaining = JUMP_DURATION;
        snake.flightAngle = snake.angle;
      }
      if (powerPressed && snake.powerUp) this.activatePowerUp(snake);

      const airborne = snake.jumpRemaining > 0;
      snake.angle += this.turnInput(snake) * TURN_SPEED * safeDt;

      const speed = BASE_SPEED + snake.speedBoost;
      const movementAngle = airborne ? snake.flightAngle : snake.angle;
      const distance = speed * safeDt;
      const previous = { ...snake.head };
      snake.head.x = wrap(
        snake.head.x + Math.cos(movementAngle) * distance,
        WORLD_WIDTH,
      );
      snake.head.y = wrap(
        snake.head.y + Math.sin(movementAngle) * distance,
        WORLD_HEIGHT,
      );

      if (airborne) {
        snake.sampleDistance = 0;
        snake.jumpRemaining = Math.max(0, snake.jumpRemaining - safeDt);
        if (snake.jumpRemaining < 1e-9) snake.jumpRemaining = 0;
        const progress = 1 - snake.jumpRemaining / JUMP_DURATION;
        snake.jump = Math.sin(Math.min(progress, 1) * Math.PI);
        if (snake.jumpRemaining === 0) {
          snake.jump = 0;
          snake.trailSegment += 1;
        }
      } else {
        snake.jump = 0;
        this.emitTrail(snake, previous, movementAngle, distance);
        if (!snake.invulnerable) {
          this.collectFood(snake);
          this.collectPowerUps(snake);
        }
      }

      if (snake.speedBoost > 0) {
        snake.speedBoost *= Math.pow(
          SPEED_BOOST_DECAY_PER_TICK,
          safeDt * UPDATE_RATE,
        );
        if (snake.speedBoost < SPEED_BOOST_CUTOFF) snake.speedBoost = 0;
      }
    }

    this.advanceFireballs(safeDt, now);
    this.resolveTrailCollisions(now);
  }

  snapshot(now = Date.now()): GameSnapshot {
    return {
      type: 'snapshot',
      room: this.id,
      serverTime: now,
      food: this.food.map((item) => ({ ...item })),
      powerUps: this.powerUps.map(({ lifeRemaining: _, ...item }) => ({
        ...item,
      })),
      fireballs: this.fireballs.map((fireball) => ({ ...fireball })),
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
        powerUp: snake.powerUp,
        speedBoost: snake.speedBoost,
      })),
    };
  }

  private turnInput(snake: Snake) {
    if (snake.input.left && snake.input.right) {
      if (snake.leftPressedOrder < snake.rightPressedOrder) return -0.5;
      if (snake.rightPressedOrder < snake.leftPressedOrder) return 0.5;
      return 0;
    }
    return Number(snake.input.right) - Number(snake.input.left);
  }

  private emitTrail(
    snake: Snake,
    previous: Point,
    movementAngle: number,
    distance: number,
  ) {
    let remaining = distance;
    let travelled = 0;
    while (snake.sampleDistance + remaining >= TRAIL_SPACING) {
      const toPoint = TRAIL_SPACING - snake.sampleDistance;
      travelled += toPoint;
      remaining -= toPoint;
      snake.body.unshift({
        x: wrap(previous.x + Math.cos(movementAngle) * travelled, WORLD_WIDTH),
        y: wrap(previous.y + Math.sin(movementAngle) * travelled, WORLD_HEIGHT),
        segment: snake.trailSegment,
      });
      snake.sampleDistance = 0;
    }
    snake.sampleDistance += remaining;
    while (snake.body.length > snake.targetLength) snake.body.pop();
  }

  private collectFood(snake: Snake) {
    for (let index = this.food.length - 1; index >= 0; index -= 1) {
      if (toroidalDistance(snake.head, this.food[index]) >= PICKUP_RADIUS)
        continue;
      this.food.splice(index, 1);
      snake.targetLength += FOOD_GROWTH;
      snake.dots += 1;
    }
  }

  private collectPowerUps(snake: Snake) {
    for (let index = this.powerUps.length - 1; index >= 0; index -= 1) {
      if (toroidalDistance(snake.head, this.powerUps[index]) >= PICKUP_RADIUS)
        continue;
      snake.powerUp = this.powerUps[index].type;
      this.powerUps.splice(index, 1);
    }
  }

  private activatePowerUp(snake: Snake) {
    const powerUp = snake.powerUp;
    snake.powerUp = null;
    if (powerUp === 'speed-boost') {
      snake.speedBoost += SPEED_BOOST_AMOUNT;
      return;
    }
    if (powerUp === 'fireball') {
      const distance = HEAD_RADIUS + FIREBALL_RADIUS + 5;
      this.fireballs.push({
        id: this.nextFireballId++,
        ownerId: snake.id,
        angle: snake.angle,
        x: wrap(snake.head.x + Math.cos(snake.angle) * distance, WORLD_WIDTH),
        y: wrap(snake.head.y + Math.sin(snake.angle) * distance, WORLD_HEIGHT),
      });
    }
  }

  private advanceFireballs(dt: number, now: number) {
    for (const fireball of this.fireballs) {
      fireball.x = wrap(
        fireball.x + Math.cos(fireball.angle) * FIREBALL_SPEED * dt,
        WORLD_WIDTH,
      );
      fireball.y = wrap(
        fireball.y + Math.sin(fireball.angle) * FIREBALL_SPEED * dt,
        WORLD_HEIGHT,
      );
    }

    const destroyed = new Set<number>();
    for (let first = 0; first < this.fireballs.length; first += 1) {
      for (
        let second = first + 1;
        second < this.fireballs.length;
        second += 1
      ) {
        const a = this.fireballs[first];
        const b = this.fireballs[second];
        if (toroidalDistance(a, b) < FIREBALL_RADIUS * 2) {
          destroyed.add(a.id);
          destroyed.add(b.id);
        }
      }
    }

    for (const fireball of this.fireballs) {
      if (destroyed.has(fireball.id)) continue;
      for (const snake of this.snakes.values()) {
        if (
          !snake.alive ||
          snake.invulnerable ||
          snake.jumpRemaining > 0 ||
          snake.speedBoost >= 2.5 * UPDATE_RATE
        )
          continue;
        if (
          toroidalDistance(fireball, snake.head) <
          FIREBALL_RADIUS + HEAD_RADIUS
        ) {
          this.killSnake(snake, now);
          destroyed.add(fireball.id);
          break;
        }
      }

      for (const snake of this.snakes.values()) {
        let removed = 0;
        for (let index = snake.body.length - 1; index >= 0; index -= 1) {
          if (
            toroidalDistance(fireball, snake.body[index]) <
            FIREBALL_RADIUS + BODY_RADIUS
          ) {
            snake.body.splice(index, 1);
            removed += 1;
          }
        }
        if (removed > 0)
          snake.targetLength = Math.max(1, snake.targetLength - removed);
      }
    }

    for (let index = this.fireballs.length - 1; index >= 0; index -= 1) {
      if (destroyed.has(this.fireballs[index].id))
        this.fireballs.splice(index, 1);
    }
  }

  private resolveTrailCollisions(now: number) {
    const collisions = new Set<string>();
    for (const snake of this.snakes.values()) {
      if (!snake.alive || snake.invulnerable || snake.jumpRemaining > 0)
        continue;
      for (const other of this.snakes.values()) {
        if (!other.alive) continue;
        const start = other.id === snake.id ? 15 : 0;
        for (let index = start; index < other.body.length; index += 1) {
          if (
            toroidalDistance(snake.head, other.body[index]) <
            HEAD_RADIUS + BODY_RADIUS
          ) {
            collisions.add(snake.id);
            break;
          }
        }
        if (collisions.has(snake.id)) break;
      }
    }
    for (const snakeId of collisions) {
      const snake = this.snakes.get(snakeId);
      if (snake?.alive) this.killSnake(snake, now);
    }
  }

  private killSnake(snake: Snake, now: number) {
    snake.alive = false;
    snake.deaths += 1;
    snake.respawnAt = now + RESPAWN_DELAY_MS;
    snake.jump = 0;
    snake.jumpRemaining = 0;
    snake.body = [];
    snake.powerUp = null;
    snake.speedBoost = 0;
  }

  private updateWorldSpawns(dt: number) {
    this.foodSpawnClock += dt;
    while (this.foodSpawnClock >= FOOD_SPAWN_SECONDS) {
      this.foodSpawnClock -= FOOD_SPAWN_SECONDS;
      if (this.food.length < FOOD_COUNT) this.spawnFood();
    }

    for (let index = this.powerUps.length - 1; index >= 0; index -= 1) {
      this.powerUps[index].lifeRemaining -= dt;
      if (this.powerUps[index].lifeRemaining <= 0)
        this.powerUps.splice(index, 1);
    }
    this.powerUpSpawnClock += dt;
    while (this.powerUpSpawnClock >= POWER_UP_SPAWN_SECONDS) {
      this.powerUpSpawnClock -= POWER_UP_SPAWN_SECONDS;
      if (this.powerUps.length >= MAX_WORLD_POWER_UPS) continue;
      this.spawnPowerUp(this.nextPowerUpType);
      this.nextPowerUpType =
        this.nextPowerUpType === 'speed-boost' ? 'fireball' : 'speed-boost';
    }
  }

  private fillFood() {
    while (this.food.length < FOOD_COUNT) this.spawnFood();
  }

  private spawnFood() {
    this.food.push({ id: this.nextFoodId++, ...this.randomArenaPoint() });
  }

  private randomArenaPoint() {
    return {
      x: 34 + this.random() * (WORLD_WIDTH - 68),
      y: 34 + this.random() * (WORLD_HEIGHT - 68),
    };
  }

  private respawn(snake: Snake, now: number) {
    const fresh = this.createSnake(snake.id, snake.name, snake.color, now);
    const deaths = snake.deaths;
    const pingMs = snake.pingMs;
    Object.assign(snake, fresh, { deaths, pingMs });
  }

  private createSnake(
    id: string,
    name: string,
    color: number,
    now: number,
  ): Snake {
    return {
      id,
      name,
      color,
      head: {
        x: 140 + this.random() * (WORLD_WIDTH - 280),
        y: 110 + this.random() * (WORLD_HEIGHT - 220),
      },
      body: [],
      angle: this.random() * Math.PI * 2,
      jump: 0,
      alive: true,
      invulnerable: true,
      dots: 0,
      deaths: 0,
      pingMs: null,
      powerUp: null,
      speedBoost: 0,
      input: { ...EMPTY_INPUT },
      targetLength: START_TRAIL_POINTS,
      sampleDistance: 0,
      jumpRemaining: 0,
      jumpWasDown: false,
      powerWasDown: false,
      flightAngle: 0,
      trailSegment: 0,
      respawnAt: 0,
      invulnerableUntil: now + SPAWN_GRACE_MS,
      leftPressedOrder: Number.POSITIVE_INFINITY,
      rightPressedOrder: Number.POSITIVE_INFINITY,
    };
  }
}
