import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type BlastSnapshot,
  type FireballSnapshot,
  type FoodSnapshot,
  type GameSnapshot,
  type GrenadeSnapshot,
  type InputState,
  type Point,
  type PowerUpSnapshot,
  type PowerUpType,
  type RailSnapshot,
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
const BASIC_JUMP_DURATION = 28 / UPDATE_RATE;
const BASIC_JUMP_PEAK_SCALE = 1.196;
const JUMPER_DURATION = 91 / UPDATE_RATE;
const JUMPER_PEAK_SCALE = 3.07;
const SPEED_BOOST_AMOUNT = 3 * UPDATE_RATE;
const SPEED_BOOST_CUTOFF = 1 * UPDATE_RATE;
const SPEED_BOOST_DECAY_PER_TICK = 0.985;
const FIREBALL_SPEED = 5 * UPDATE_RATE;
const FIREBALL_LIFESPAN_SECONDS = 6;
const GRENADE_EXTRA_SPEED = 2 * UPDATE_RATE;
const GRENADE_DURATION = 63 / UPDATE_RATE;
const GRENADE_BLAST_RADIUS = 75;
const GRENADE_START_SCALE = 0.25;
const GRENADE_SCALE_HEIGHT = 0.992;
const BLAST_VISUAL_DURATION = 0.4;
const RAIL_DURATION = 16 / UPDATE_RATE;
const TRIDENT_ANGLE = (15 * Math.PI) / 180;
const TRIDENT_OFFSET = 24;
const RESPAWN_DELAY_MS = 1_250;
const SPAWN_GRACE_MS = 2_000;
const HEAD_RADIUS = 11;
const BODY_RADIUS = 3;
const FIREBALL_RADIUS = 16;
const PICKUP_RADIUS = 22;

const POWER_UP_TYPES: PowerUpType[] = [
  'speed-boost',
  'fireball',
  'jumper',
  'grenade',
  'one-eighty',
  'rail-gun',
  'trident',
];

export const GAMEPLAY = {
  updateRate: UPDATE_RATE,
  baseSpeed: BASE_SPEED,
  turnSpeed: TURN_SPEED,
  trailSpacing: TRAIL_SPACING,
  maxTrailLength: MAX_TRAIL_LENGTH,
  jumpDuration: BASIC_JUMP_DURATION,
  jumperDuration: JUMPER_DURATION,
  speedBoostAmount: SPEED_BOOST_AMOUNT,
  fireballSpeed: FIREBALL_SPEED,
  fireballLifespan: FIREBALL_LIFESPAN_SECONDS,
  grenadeDuration: GRENADE_DURATION,
  railDuration: RAIL_DURATION,
} as const;

type Random = () => number;

type Snake = SnakeSnapshot & {
  input: InputState;
  baseSpeed: number;
  targetLength: number;
  sampleDistance: number;
  jumpRemaining: number;
  jumpDuration: number;
  jumpPeakScale: number;
  jumpWasDown: boolean;
  powerWasDown: boolean;
  flightAngle: number;
  trailSegment: number;
  respawnAt: number;
  respawns: boolean;
  invulnerableUntil: number;
  leftPressedOrder: number;
  rightPressedOrder: number;
};

type WorldPowerUp = PowerUpSnapshot & { lifeRemaining: number };
type Fireball = FireballSnapshot & { lifeRemaining: number };
type Grenade = GrenadeSnapshot & {
  speed: number;
  elapsed: number;
};
type Blast = BlastSnapshot & { elapsed: number };
type Rail = RailSnapshot & { remaining: number };

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

function normalizeAngle(angle: number) {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

export class GameRoom {
  readonly id: string;
  readonly snakes = new Map<string, Snake>();
  readonly food: FoodSnapshot[] = [];
  readonly powerUps: WorldPowerUp[] = [];
  readonly fireballs: Fireball[] = [];
  readonly grenades: Grenade[] = [];
  readonly blasts: Blast[] = [];
  readonly rails: Rail[] = [];
  private readonly random: Random;
  private nextFoodId = 1;
  private nextPowerUpId = 1;
  private nextFireballId = 1;
  private nextGrenadeId = 1;
  private nextBlastId = 1;
  private nextRailId = 1;
  private nextHeadId = 1;
  private inputOrder = 0;
  private foodSpawnClock = 0;
  private powerUpSpawnClock = 0;
  private nextPowerUpIndex = 0;

  constructor(id: string, random: Random = Math.random) {
    this.id = id;
    this.random = random;
    this.fillFood();
    const positions = [
      { x: 0.2, y: 0.29 },
      { x: 0.4, y: 0.29 },
      { x: 0.6, y: 0.29 },
      { x: 0.8, y: 0.29 },
      { x: 0.3, y: 0.71 },
      { x: 0.5, y: 0.71 },
      { x: 0.7, y: 0.71 },
    ];
    for (let index = 0; index < POWER_UP_TYPES.length; index += 1) {
      this.spawnPowerUp(POWER_UP_TYPES[index], {
        x: WORLD_WIDTH * positions[index].x,
        y: WORLD_HEIGHT * positions[index].y,
      });
    }
  }

  addPlayer(id: string, name: string) {
    const color = Math.floor(this.random() * 360);
    const snake = this.createSnake(
      id,
      id,
      sanitizeName(name),
      color,
      Date.now(),
    );
    this.snakes.set(id, snake);
    return snake;
  }

  removePlayer(ownerId: string) {
    for (const [id, snake] of this.snakes) {
      if (snake.ownerId === ownerId) this.snakes.delete(id);
    }
  }

  setInput(ownerId: string, input: InputState) {
    for (const snake of this.snakes.values()) {
      if (snake.ownerId !== ownerId) continue;
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
  }

  setPing(ownerId: string, pingMs: number) {
    if (!Number.isFinite(pingMs)) return;
    const bounded = Math.round(Math.min(Math.max(pingMs, 0), 9_999));
    for (const snake of this.snakes.values()) {
      if (snake.ownerId === ownerId) snake.pingMs = bounded;
    }
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

    const snakesAtStartOfTick = Array.from(this.snakes.values());
    for (const snake of snakesAtStartOfTick) {
      if (!snake.alive) {
        if (snake.respawns && now >= snake.respawnAt) this.respawn(snake, now);
        continue;
      }

      snake.invulnerable = now < snake.invulnerableUntil;
      const jumpPressed = snake.input.jump && !snake.jumpWasDown;
      const powerPressed = snake.input.power && !snake.powerWasDown;
      snake.jumpWasDown = snake.input.jump;
      snake.powerWasDown = snake.input.power;

      if (jumpPressed && snake.jumpRemaining <= 0)
        this.startJump(snake, BASIC_JUMP_DURATION, BASIC_JUMP_PEAK_SCALE);
      if (powerPressed && snake.powerUp && snake.jumpRemaining <= 0)
        this.activatePowerUp(snake, now);

      const airborne = snake.jumpRemaining > 0;
      snake.angle = normalizeAngle(
        snake.angle + this.turnInput(snake) * TURN_SPEED * safeDt,
      );

      const speed = snake.baseSpeed + snake.speedBoost;
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
        const progress = 1 - snake.jumpRemaining / snake.jumpDuration;
        snake.jump = Math.sin(Math.min(progress, 1) * Math.PI);
        snake.jumpScale =
          1 + (snake.jumpPeakScale - 1) * Math.max(0, snake.jump);
        if (snake.jumpRemaining === 0) {
          snake.jump = 0;
          snake.jumpScale = 1;
          snake.trailSegment += 1;
        }
      } else {
        snake.jump = 0;
        snake.jumpScale = 1;
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

    this.advanceGrenades(safeDt, now);
    this.advanceFireballs(safeDt, now);
    this.advanceEffects(safeDt);
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
      fireballs: this.fireballs.map(({ lifeRemaining: _, ...item }) => ({
        ...item,
      })),
      grenades: this.grenades.map(({ speed: _, elapsed: __, ...item }) => ({
        ...item,
      })),
      blasts: this.blasts.map(({ elapsed: _, ...item }) => ({ ...item })),
      rails: this.rails.map(({ remaining: _, ...item }) => ({ ...item })),
      snakes: [...this.snakes.values()].map((snake) => ({
        id: snake.id,
        ownerId: snake.ownerId,
        name: snake.name,
        color: snake.color,
        head: { ...snake.head },
        body: snake.body.map((point) => ({ ...point })),
        angle: snake.angle,
        jump: snake.jump,
        jumpScale: snake.jumpScale,
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

  private startJump(snake: Snake, duration: number, peakScale: number) {
    snake.jumpDuration = duration;
    snake.jumpRemaining = duration;
    snake.jumpPeakScale = peakScale;
    snake.flightAngle = snake.angle;
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
      const owner = this.snakes.get(snake.ownerId);
      if (owner) owner.dots += 1;
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

  private activatePowerUp(snake: Snake, now: number) {
    const powerUp = snake.powerUp;
    snake.powerUp = null;
    switch (powerUp) {
      case 'speed-boost':
        snake.speedBoost += SPEED_BOOST_AMOUNT;
        break;
      case 'fireball':
        this.launchFireball(snake);
        break;
      case 'jumper':
        this.startJump(snake, JUMPER_DURATION, JUMPER_PEAK_SCALE);
        break;
      case 'grenade':
        this.throwGrenade(snake);
        break;
      case 'one-eighty':
        this.oneEighty(snake);
        break;
      case 'rail-gun':
        this.shootRail(snake, now);
        break;
      case 'trident':
        this.addTridentHeads(snake, now);
        break;
    }
  }

  private launchFireball(snake: Snake) {
    const distance = HEAD_RADIUS + FIREBALL_RADIUS + 5;
    this.fireballs.push({
      id: this.nextFireballId++,
      ownerId: snake.id,
      angle: snake.angle,
      x: wrap(snake.head.x + Math.cos(snake.angle) * distance, WORLD_WIDTH),
      y: wrap(snake.head.y + Math.sin(snake.angle) * distance, WORLD_HEIGHT),
      lifeRemaining: FIREBALL_LIFESPAN_SECONDS,
    });
  }

  private throwGrenade(snake: Snake) {
    this.grenades.push({
      id: this.nextGrenadeId++,
      ownerId: snake.id,
      angle: snake.angle,
      x: snake.head.x,
      y: snake.head.y,
      scale: GRENADE_START_SCALE,
      speed: snake.baseSpeed + snake.speedBoost + GRENADE_EXTRA_SPEED,
      elapsed: 0,
    });
  }

  private oneEighty(snake: Snake) {
    if (snake.body.length < 2) {
      snake.angle = normalizeAngle(snake.angle + Math.PI);
      snake.speedBoost += SPEED_BOOST_AMOUNT;
      return;
    }
    const oldest = snake.body[snake.body.length - 1];
    const next = snake.body[snake.body.length - 2];
    const trailAngle = Math.atan2(
      wrappedDelta(next.y, oldest.y, WORLD_HEIGHT),
      wrappedDelta(next.x, oldest.x, WORLD_WIDTH),
    );
    snake.body.reverse();
    snake.angle = normalizeAngle(trailAngle + Math.PI);
    snake.head = {
      x: wrap(oldest.x + Math.cos(snake.angle) * 32, WORLD_WIDTH),
      y: wrap(oldest.y + Math.sin(snake.angle) * 32, WORLD_HEIGHT),
    };
    snake.sampleDistance = 0;
    snake.speedBoost += SPEED_BOOST_AMOUNT;
  }

  private shootRail(shooter: Snake, now: number) {
    const start = { ...shooter.head };
    const direction = {
      x: Math.cos(shooter.angle),
      y: Math.sin(shooter.angle),
    };
    const xDistance =
      direction.x > 0
        ? (WORLD_WIDTH - start.x) / direction.x
        : direction.x < 0
          ? -start.x / direction.x
          : Number.POSITIVE_INFINITY;
    const yDistance =
      direction.y > 0
        ? (WORLD_HEIGHT - start.y) / direction.y
        : direction.y < 0
          ? -start.y / direction.y
          : Number.POSITIVE_INFINITY;
    const length = Math.max(0, Math.min(xDistance, yDistance));
    const end = {
      x: start.x + direction.x * length,
      y: start.y + direction.y * length,
    };
    this.rails.push({
      id: this.nextRailId++,
      ownerId: shooter.id,
      start,
      end,
      opacity: 1,
      remaining: RAIL_DURATION,
    });

    let closest: { snake: Snake; distance: number } | null = null;
    for (const snake of this.snakes.values()) {
      if (!snake.alive || snake.id === shooter.id) continue;
      const dx = snake.head.x - start.x;
      const dy = snake.head.y - start.y;
      const along = dx * direction.x + dy * direction.y;
      if (along < 0 || along > length) continue;
      const perpendicular = Math.abs(dx * direction.y - dy * direction.x);
      if (perpendicular > HEAD_RADIUS + 3) continue;
      if (!closest || along < closest.distance)
        closest = { snake, distance: along };
    }
    if (closest) this.killSnake(closest.snake, now);
  }

  private addTridentHeads(source: Snake, now: number) {
    const currentSpeed =
      Math.round((source.baseSpeed + source.speedBoost) / UPDATE_RATE) *
      UPDATE_RATE;
    const branchAngles = [
      normalizeAngle(source.angle - TRIDENT_ANGLE),
      normalizeAngle(source.angle + TRIDENT_ANGLE),
    ];
    const branchPositions = branchAngles.map((angle) => ({
      x: source.head.x + Math.cos(angle) * TRIDENT_OFFSET,
      y: source.head.y + Math.sin(angle) * TRIDENT_OFFSET,
    }));
    const allX = [source.head.x, ...branchPositions.map((point) => point.x)];
    const allY = [source.head.y, ...branchPositions.map((point) => point.y)];
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    const shiftX =
      minX < 0 ? -minX : maxX > WORLD_WIDTH ? WORLD_WIDTH - maxX : 0;
    const shiftY =
      minY < 0 ? -minY : maxY > WORLD_HEIGHT ? WORLD_HEIGHT - maxY : 0;

    source.head.x += shiftX;
    source.head.y += shiftY;
    for (let index = 0; index < branchAngles.length; index += 1) {
      const angle = branchAngles[index];
      const position = branchPositions[index];
      const id = `${source.ownerId}:h${this.nextHeadId++}`;
      const head = this.createSnake(
        id,
        source.ownerId,
        source.name,
        source.color,
        now,
        false,
        {
          x: position.x + shiftX,
          y: position.y + shiftY,
          angle,
        },
      );
      head.baseSpeed = currentSpeed;
      head.input = { ...source.input };
      head.jumpWasDown = source.jumpWasDown;
      head.powerWasDown = source.powerWasDown;
      head.pingMs = source.pingMs;
      this.snakes.set(id, head);
    }
  }

  private advanceGrenades(dt: number, now: number) {
    const exploded = new Set<number>();
    for (const grenade of this.grenades) {
      grenade.elapsed += dt;
      grenade.x = wrap(
        grenade.x + Math.cos(grenade.angle) * grenade.speed * dt,
        WORLD_WIDTH,
      );
      grenade.y = wrap(
        grenade.y + Math.sin(grenade.angle) * grenade.speed * dt,
        WORLD_HEIGHT,
      );
      const progress = Math.min(1, grenade.elapsed / GRENADE_DURATION);
      grenade.scale =
        GRENADE_START_SCALE +
        GRENADE_SCALE_HEIGHT * Math.sin(progress * Math.PI);

      let caught = false;
      for (const snake of this.snakes.values()) {
        if (!snake.alive || snake.jumpRemaining <= 0) continue;
        if (toroidalDistance(grenade, snake.head) >= PICKUP_RADIUS) continue;
        snake.powerUp = 'grenade';
        caught = true;
        break;
      }
      if (caught) {
        exploded.add(grenade.id);
        continue;
      }
      if (grenade.elapsed >= GRENADE_DURATION) {
        exploded.add(grenade.id);
        this.explodeGrenade(grenade, now);
      }
    }
    for (let index = this.grenades.length - 1; index >= 0; index -= 1) {
      if (exploded.has(this.grenades[index].id)) this.grenades.splice(index, 1);
    }
  }

  private explodeGrenade(grenade: Grenade, now: number) {
    this.blasts.push({
      id: this.nextBlastId++,
      x: grenade.x,
      y: grenade.y,
      radius: GRENADE_BLAST_RADIUS,
      progress: 0,
      elapsed: 0,
    });
    for (const snake of this.snakes.values()) {
      if (
        snake.alive &&
        !snake.invulnerable &&
        snake.jumpRemaining <= 0 &&
        toroidalDistance(grenade, snake.head) < GRENADE_BLAST_RADIUS
      )
        this.killSnake(snake, now);

      let removed = 0;
      for (let index = snake.body.length - 1; index >= 0; index -= 1) {
        if (
          toroidalDistance(grenade, snake.body[index]) < GRENADE_BLAST_RADIUS
        ) {
          snake.body.splice(index, 1);
          removed += 1;
        }
      }
      if (removed > 0)
        snake.targetLength = Math.max(1, snake.targetLength - removed);
    }
    for (let index = this.fireballs.length - 1; index >= 0; index -= 1) {
      if (
        toroidalDistance(grenade, this.fireballs[index]) < GRENADE_BLAST_RADIUS
      )
        this.fireballs.splice(index, 1);
    }
  }

  private advanceFireballs(dt: number, now: number) {
    const destroyed = new Set<number>();
    for (const fireball of this.fireballs) {
      fireball.lifeRemaining -= dt;
      if (fireball.lifeRemaining <= 0) {
        destroyed.add(fireball.id);
        continue;
      }
      fireball.x = wrap(
        fireball.x + Math.cos(fireball.angle) * FIREBALL_SPEED * dt,
        WORLD_WIDTH,
      );
      fireball.y = wrap(
        fireball.y + Math.sin(fireball.angle) * FIREBALL_SPEED * dt,
        WORLD_HEIGHT,
      );
    }

    for (let first = 0; first < this.fireballs.length; first += 1) {
      for (
        let second = first + 1;
        second < this.fireballs.length;
        second += 1
      ) {
        const a = this.fireballs[first];
        const b = this.fireballs[second];
        if (
          !destroyed.has(a.id) &&
          !destroyed.has(b.id) &&
          toroidalDistance(a, b) < FIREBALL_RADIUS * 2
        ) {
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

      if (destroyed.has(fireball.id)) continue;
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

  private advanceEffects(dt: number) {
    for (let index = this.blasts.length - 1; index >= 0; index -= 1) {
      const blast = this.blasts[index];
      blast.elapsed += dt;
      blast.progress = Math.min(1, blast.elapsed / BLAST_VISUAL_DURATION);
      if (blast.elapsed >= BLAST_VISUAL_DURATION) this.blasts.splice(index, 1);
    }
    for (let index = this.rails.length - 1; index >= 0; index -= 1) {
      const rail = this.rails[index];
      rail.remaining -= dt;
      rail.opacity = Math.max(0, rail.remaining / RAIL_DURATION);
      if (rail.remaining <= 0) this.rails.splice(index, 1);
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
    snake.respawnAt = Number.POSITIVE_INFINITY;
    snake.jump = 0;
    snake.jumpScale = 1;
    snake.jumpRemaining = 0;
    snake.body = [];
    snake.powerUp = null;
    snake.speedBoost = 0;

    const ownerStillAlive = [...this.snakes.values()].some(
      (head) => head.ownerId === snake.ownerId && head.alive,
    );
    if (!ownerStillAlive) {
      const primary = this.snakes.get(snake.ownerId);
      if (primary?.respawns) primary.respawnAt = now + RESPAWN_DELAY_MS;
    }
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
      if (this.powerUps.length >= POWER_UP_TYPES.length) continue;
      this.spawnPowerUp(POWER_UP_TYPES[this.nextPowerUpIndex]);
      this.nextPowerUpIndex =
        (this.nextPowerUpIndex + 1) % POWER_UP_TYPES.length;
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
    for (const [id, head] of this.snakes) {
      if (id !== snake.id && head.ownerId === snake.ownerId)
        this.snakes.delete(id);
    }
    const fresh = this.createSnake(
      snake.id,
      snake.ownerId,
      snake.name,
      snake.color,
      now,
      snake.respawns,
    );
    const deaths = snake.deaths;
    const dots = snake.dots;
    const pingMs = snake.pingMs;
    Object.assign(snake, fresh, { deaths, dots, pingMs });
  }

  private createSnake(
    id: string,
    ownerId: string,
    name: string,
    color: number,
    now: number,
    respawns = true,
    fixedSpawn?: Point & { angle: number },
  ): Snake {
    const angle = fixedSpawn?.angle ?? this.random() * Math.PI * 2;
    return {
      id,
      ownerId,
      name,
      color,
      head: {
        x: fixedSpawn?.x ?? 140 + this.random() * (WORLD_WIDTH - 280),
        y: fixedSpawn?.y ?? 110 + this.random() * (WORLD_HEIGHT - 220),
      },
      body: [],
      angle,
      jump: 0,
      jumpScale: 1,
      alive: true,
      invulnerable: true,
      dots: 0,
      deaths: 0,
      pingMs: null,
      powerUp: null,
      speedBoost: 0,
      input: { ...EMPTY_INPUT },
      baseSpeed: BASE_SPEED,
      targetLength: START_TRAIL_POINTS,
      sampleDistance: 0,
      jumpRemaining: 0,
      jumpDuration: BASIC_JUMP_DURATION,
      jumpPeakScale: BASIC_JUMP_PEAK_SCALE,
      jumpWasDown: false,
      powerWasDown: false,
      flightAngle: angle,
      trailSegment: 0,
      respawnAt: 0,
      respawns,
      invulnerableUntil: now + SPAWN_GRACE_MS,
      leftPressedOrder: Number.POSITIVE_INFINITY,
      rightPressedOrder: Number.POSITIVE_INFINITY,
    };
  }
}
