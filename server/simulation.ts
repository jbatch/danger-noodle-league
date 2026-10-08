import {
  SNAKE_HEAD_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type BlastSnapshot,
  type DetachedTrailSnapshot,
  type FireballSnapshot,
  type FoodSnapshot,
  type GameEvent,
  type GameEventType,
  type GameMode,
  type GamePhase,
  type GameSnapshot,
  type GrenadeSnapshot,
  type InputState,
  type Point,
  type PowerUpSnapshot,
  type PowerUpType,
  type RailSnapshot,
  type RoomPlayerSnapshot,
  type SnakeSnapshot,
  type TrailPoint,
  type TurretShotSnapshot,
  type TurretSnapshot,
} from '../shared/protocol.ts';
import { getLevel, LEVELS } from '../shared/levels.generated.ts';
import type { CompiledLevel, LevelTile } from '../shared/levels.ts';

const UPDATE_RATE = 60;
const BASE_SPEED = 2 * UPDATE_RATE;
const TURN_SPEED = (4 * Math.PI * UPDATE_RATE) / 180;
const TRAIL_SPACING = 3;
const MAX_TRAIL_LENGTH = 350;
const START_TRAIL_POINTS = Math.round(MAX_TRAIL_LENGTH / TRAIL_SPACING);
const FOOD_GROWTH = Math.round(60 / TRAIL_SPACING);
const FOOD_SPAWN_SECONDS = 4;
const POWER_UP_LIFESPAN_SECONDS = 12;
const BASIC_JUMP_DURATION = 32 / UPDATE_RATE;
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
const TRIDENT_COLLISION_GRACE_MS = 2_000;
const RESPAWN_DELAY_MS = 1_250;
const SPAWN_GRACE_MS = 2_000;
const HEAD_RADIUS = SNAKE_HEAD_RADIUS;
const BODY_RADIUS = 3;
const FIREBALL_RADIUS = 16;
const PICKUP_RADIUS = 22;
const EVENT_HISTORY_LIMIT = 96;
const COUNTDOWN_MS = 3_000;
const ROUND_OVER_MS = 2_200;
const INTERMISSION_MS = 2_000;
const STUN_DURATION_MS = 1_000;
const GHOST_DURATION_MS = 5_000;
const TURRET_SHOT_SPEED = 4 * UPDATE_RATE;
const TURRET_SHOT_RADIUS = 7;

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

type InternalTrailPoint = TrailPoint & { collisionAge: number };

type Snake = Omit<SnakeSnapshot, 'body'> & {
  body: InternalTrailPoint[];
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
  siblingCollisionGraceUntil: number;
  spawnIndex: number;
  underwater: boolean;
  terrainErosion: number;
  stunnedUntil: number;
  ghostedUntil: number;
  slamPower: number;
  driftAngle: number;
  summonSicknessUntil: number;
};

type WorldPowerUp = PowerUpSnapshot & {
  lifeRemaining: number;
  shrinking: boolean;
};
type Fireball = FireballSnapshot & { lifeRemaining: number };
type Grenade = GrenadeSnapshot & {
  speed: number;
  elapsed: number;
  blastRadius: number;
};
type Blast = BlastSnapshot & { elapsed: number };
type Rail = RailSnapshot & { remaining: number };
type Turret = TurretSnapshot & {
  frequency: number;
  shotClock: number;
  rotationSpeed: number;
  velocityX: number;
  velocityY: number;
};
type TurretShot = TurretShotSnapshot;
type DetachedTrail = Omit<DetachedTrailSnapshot, 'body'> & {
  body: InternalTrailPoint[];
};

type RoomPlayer = RoomPlayerSnapshot & { spawnIndex: number };

export type GameRoomOptions = {
  levelId?: string;
  devMode?: boolean;
  managedMatch?: boolean;
  mode?: GameMode;
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

function normalizeAngle(angle: number) {
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

export class GameRoom {
  readonly id: string;
  level: CompiledLevel;
  readonly devMode: boolean;
  readonly managedMatch: boolean;
  readonly players = new Map<string, RoomPlayer>();
  readonly snakes = new Map<string, Snake>();
  readonly food: FoodSnapshot[] = [];
  readonly powerUps: WorldPowerUp[] = [];
  readonly fireballs: Fireball[] = [];
  readonly grenades: Grenade[] = [];
  readonly blasts: Blast[] = [];
  readonly rails: Rail[] = [];
  readonly turrets: Turret[] = [];
  readonly turretShots: TurretShot[] = [];
  readonly events: GameEvent[] = [];
  private nextSnapshotSequence = 1;
  readonly detachedTrails: DetachedTrail[] = [];
  readonly destroyedWalls = new Set<number>();
  private readonly random: Random;
  private readonly terrainByCell = new Map<string, number>();
  private nextFoodId = 1;
  private nextPowerUpId = 1;
  private nextFireballId = 1;
  private nextGrenadeId = 1;
  private nextBlastId = 1;
  private nextRailId = 1;
  private nextEventId = 1;
  private nextHeadId = 1;
  private nextDetachedTrailId = 1;
  private nextTurretShotId = 1;
  private inputOrder = 0;
  private foodSpawnClock = 0;
  private powerUpSpawnClock = 0;
  phase: GamePhase;
  mode: GameMode;
  hostId: string | null = null;
  winsToMatch = 3;
  roundNumber = 0;
  phaseEndsAt: number | null = null;
  roundWinnerId: string | null = null;
  matchWinnerId: string | null = null;
  discoUntil: number | null = null;
  private roundOwners = new Set<string>();

  constructor(
    id: string,
    random: Random = Math.random,
    options: GameRoomOptions = {},
  ) {
    this.id = id;
    this.random = random;
    this.devMode = Boolean(options.devMode);
    this.managedMatch = Boolean(options.managedMatch);
    this.mode =
      options.mode ??
      (this.devMode || !this.managedMatch ? 'quickplay' : 'survival');
    this.phase = this.managedMatch && !this.devMode ? 'lobby' : 'playing';
    this.level = getLevel(this.devMode ? 'empty' : options.levelId);
    this.loadLevelState();
    this.fillFood();
    if (this.devMode) {
      this.seedDeveloperPowerUps();
    } else {
      this.spawnFixedItems();
    }
  }

  addPlayer(id: string, name: string): Snake {
    if (this.players.size >= 8) throw new Error('room is full');
    const color = Math.floor(this.random() * 360);
    const usedSpawns = new Set(
      [...this.players.values()].map((player) => player.spawnIndex),
    );
    const spawnIndex = this.level.playerSpawns.findIndex(
      (_, index) => !usedSpawns.has(index),
    );
    if (spawnIndex < 0) throw new Error('room is full');
    const player: RoomPlayer = {
      id,
      name: sanitizeName(name),
      color,
      ready: false,
      wins: 0,
      spectator:
        this.managedMatch && this.mode === 'survival' && this.phase !== 'lobby',
      spawnIndex,
    };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    const spawn = this.level.playerSpawns[spawnIndex];
    const snake = this.createSnake(
      id,
      id,
      player.name,
      color,
      Date.now(),
      this.mode === 'quickplay',
      { ...spawn },
      spawnIndex,
    );
    if (player.spectator) snake.alive = false;
    this.snakes.set(id, snake);
    return snake;
  }

  removePlayer(ownerId: string) {
    for (const [id, snake] of this.snakes) {
      if (snake.ownerId === ownerId) this.snakes.delete(id);
    }
    this.players.delete(ownerId);
    this.roundOwners.delete(ownerId);
    if (this.hostId === ownerId)
      this.hostId = this.players.keys().next().value ?? null;
  }

  setReady(ownerId: string, ready: boolean) {
    if (this.phase !== 'lobby') return;
    const player = this.players.get(ownerId);
    if (player) player.ready = ready;
  }

  configure(
    ownerId: string,
    settings: { mode?: GameMode; levelId?: string; winsToMatch?: number },
  ) {
    if (ownerId !== this.hostId || this.phase !== 'lobby') return false;
    if (settings.mode === 'quickplay' || settings.mode === 'survival')
      this.mode = settings.mode;
    if (
      settings.levelId &&
      LEVELS.some((level) => level.id === settings.levelId && level.selectable)
    ) {
      this.level = getLevel(settings.levelId);
      this.resetWorld(Date.now(), true);
    }
    if (Number.isInteger(settings.winsToMatch))
      this.winsToMatch = Math.min(10, Math.max(1, settings.winsToMatch ?? 3));
    for (const player of this.players.values()) player.ready = false;
    return true;
  }

  canStartMatch() {
    const minimumPlayers = this.mode === 'survival' ? 2 : 1;
    return (
      this.phase === 'lobby' &&
      this.players.size >= minimumPlayers &&
      [...this.players.values()].every((player) => player.ready)
    );
  }

  startMatch(ownerId: string, now = Date.now()) {
    if (ownerId !== this.hostId || !this.canStartMatch()) return false;
    for (const player of this.players.values()) {
      player.wins = 0;
      player.spectator = false;
      player.ready = false;
    }
    this.roundNumber = 0;
    this.matchWinnerId = null;
    this.beginRound(now);
    return true;
  }

  rematch(ownerId: string, now = Date.now()) {
    if (ownerId !== this.hostId || this.phase !== 'match-over') return false;
    const minimumPlayers = this.mode === 'survival' ? 2 : 1;
    if (this.players.size < minimumPlayers) return false;
    for (const player of this.players.values()) {
      player.ready = false;
      player.wins = 0;
      player.spectator = false;
    }
    this.roundNumber = 0;
    this.matchWinnerId = null;
    this.beginRound(now);
    return true;
  }

  returnToLobby(ownerId: string, now = Date.now()) {
    if (ownerId !== this.hostId) return false;
    this.phase = 'lobby';
    this.phaseEndsAt = null;
    this.roundWinnerId = null;
    this.matchWinnerId = null;
    this.roundNumber = 0;
    for (const player of this.players.values()) {
      player.ready = false;
      player.wins = 0;
      player.spectator = false;
    }
    this.resetWorld(now, true);
    return true;
  }

  private beginRound(now: number) {
    this.roundNumber += 1;
    this.roundWinnerId = null;
    this.phase = 'countdown';
    this.phaseEndsAt = now + COUNTDOWN_MS;
    this.roundOwners = new Set(this.players.keys());
    for (const player of this.players.values()) player.spectator = false;
    this.resetWorld(now, true);
  }

  private endRound(winnerId: string | null, now: number) {
    if (this.phase !== 'playing' || this.mode !== 'survival') return;
    this.roundWinnerId = winnerId;
    const winner = winnerId ? this.players.get(winnerId) : null;
    if (winner) winner.wins += 1;
    if (winner && winner.wins >= this.winsToMatch) {
      this.matchWinnerId = winner.id;
      this.phase = 'match-over';
      this.phaseEndsAt = null;
    } else {
      this.phase = 'round-over';
      this.phaseEndsAt = now + ROUND_OVER_MS;
    }
  }

  private checkRoundWinner(now: number) {
    if (this.phase !== 'playing' || this.roundOwners.size < 2) return;
    const aliveOwners = new Set(
      [...this.snakes.values()]
        .filter((snake) => snake.alive && this.roundOwners.has(snake.ownerId))
        .map((snake) => snake.ownerId),
    );
    if (aliveOwners.size <= 1)
      this.endRound(aliveOwners.values().next().value ?? null, now);
  }

  private resetWorld(now: number, spawnPlayers: boolean) {
    this.snakes.clear();
    this.food.splice(0);
    this.powerUps.splice(0);
    this.fireballs.splice(0);
    this.grenades.splice(0);
    this.blasts.splice(0);
    this.rails.splice(0);
    this.turretShots.splice(0);
    this.detachedTrails.splice(0);
    this.destroyedWalls.clear();
    this.foodSpawnClock = 0;
    this.powerUpSpawnClock = 0;
    this.loadLevelState();
    if (spawnPlayers) {
      for (const player of this.players.values()) {
        if (player.spectator) continue;
        const spawn = this.level.playerSpawns[player.spawnIndex];
        this.snakes.set(
          player.id,
          this.createSnake(
            player.id,
            player.id,
            player.name,
            player.color,
            now,
            this.mode === 'quickplay',
            { ...spawn },
            player.spawnIndex,
          ),
        );
      }
    }
    this.fillFood();
    if (this.devMode) this.seedDeveloperPowerUps();
    else this.spawnFixedItems();
  }

  private loadLevelState() {
    this.terrainByCell.clear();
    for (const tile of this.level.terrain)
      this.terrainByCell.set(`${tile.x},${tile.y}`, tile.frame);
    this.turrets.splice(0);
    for (const feature of this.level.features) {
      if (feature.frame !== 1) continue;
      this.turrets.push({
        id: feature.id,
        x: feature.x,
        y: feature.y,
        angle: (feature.rotation * Math.PI) / 180,
        frequency: Math.max(0.1, Number(feature.properties.frequency ?? 1)),
        shotClock: 0,
        rotationSpeed:
          (Number(feature.properties.vr ?? 0) * Math.PI * UPDATE_RATE) / 180,
        velocityX: Number(feature.properties.vx ?? 0) * UPDATE_RATE,
        velocityY: Number(feature.properties.vy ?? 0) * UPDATE_RATE,
      });
    }
  }

  private seedDeveloperPowerUps() {
    const positions = [
      { x: 0.2, y: 0.29 },
      { x: 0.4, y: 0.29 },
      { x: 0.6, y: 0.29 },
      { x: 0.8, y: 0.29 },
      { x: 0.3, y: 0.71 },
      { x: 0.5, y: 0.71 },
      { x: 0.7, y: 0.71 },
    ];
    for (let index = 0; index < POWER_UP_TYPES.length; index += 1)
      this.spawnPowerUp(
        POWER_UP_TYPES[index],
        {
          x: WORLD_WIDTH * positions[index].x,
          y: WORLD_HEIGHT * positions[index].y,
        },
        Number.POSITIVE_INFINITY,
      );
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

  spawnPowerUp(
    type: PowerUpType,
    point = this.randomPowerUpPoint(),
    lifeRemaining = POWER_UP_LIFESPAN_SECONDS,
  ) {
    const powerUp: WorldPowerUp = {
      id: this.nextPowerUpId++,
      type,
      x: point.x,
      y: point.y,
      lifeRemaining,
      scale: 0.01,
      shrinking: false,
    };
    this.powerUps.push(powerUp);
    return powerUp;
  }

  step(now: number, dt: number) {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    if (this.managedMatch) {
      if (this.phase === 'countdown' && now >= (this.phaseEndsAt ?? 0)) {
        this.phase = 'playing';
        this.phaseEndsAt = null;
      } else if (
        this.phase === 'round-over' &&
        now >= (this.phaseEndsAt ?? 0)
      ) {
        this.phase = 'intermission';
        this.phaseEndsAt = now + INTERMISSION_MS;
      } else if (
        this.phase === 'intermission' &&
        now >= (this.phaseEndsAt ?? 0)
      ) {
        this.beginRound(now);
      }
      if (this.phase !== 'playing') return;
    }
    this.updateWorldSpawns(safeDt);
    this.advanceTurrets(safeDt, now);
    for (const trail of this.detachedTrails)
      for (const point of trail.body) point.collisionAge += 1;

    const snakesAtStartOfTick = Array.from(this.snakes.values());
    for (const snake of snakesAtStartOfTick) {
      if (!snake.alive) {
        if (snake.respawns && now >= snake.respawnAt) this.respawn(snake, now);
        continue;
      }

      for (const point of snake.body) point.collisionAge += 1;

      snake.invulnerable = now < snake.invulnerableUntil;
      snake.ghosted = now < snake.ghostedUntil;
      snake.stunned = now < snake.stunnedUntil;
      const jumpPressed = snake.input.jump && !snake.jumpWasDown;
      const powerPressed = snake.input.power && !snake.powerWasDown;
      snake.jumpWasDown = snake.input.jump;
      snake.powerWasDown = snake.input.power;

      if (jumpPressed && snake.jumpRemaining <= 0 && !snake.stunned)
        this.startJump(snake, BASIC_JUMP_DURATION, BASIC_JUMP_PEAK_SCALE);
      else if (jumpPressed && snake.jumpRemaining > 0) {
        snake.slamPower = Math.max(1, (snake.jumpScale - 1) * 3.6);
        snake.jumpRemaining = Math.min(snake.jumpRemaining, 0.12);
      }
      if (
        powerPressed &&
        snake.powerUp &&
        snake.jumpRemaining <= 0 &&
        now >= snake.summonSicknessUntil
      )
        this.activatePowerUp(snake, now);

      const airborne = snake.jumpRemaining > 0;
      const terrain =
        airborne || snake.ghosted ? null : this.terrainAt(snake.head);
      snake.underwater = terrain === 3;
      const turnMultiplier = terrain === 0 ? 0.35 : 1;
      if (!snake.stunned)
        snake.angle = normalizeAngle(
          snake.angle +
            this.turnInput(snake) * TURN_SPEED * turnMultiplier * safeDt,
        );

      const speedMultiplier =
        terrain === 1 ? 0.5 : terrain === 3 ? 0.8 : terrain === 4 ? 1.333 : 1;
      const speed = (snake.baseSpeed + snake.speedBoost) * speedMultiplier;
      if (terrain !== 4) snake.driftAngle = snake.angle;
      const movementAngle = airborne
        ? snake.flightAngle
        : terrain === 4
          ? snake.driftAngle
          : snake.angle;
      const distance = snake.stunned ? 0 : speed * safeDt;
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
          this.emitEvent('land', snake.head);
          this.landShockwave(snake, now);
        }
      } else {
        snake.jump = 0;
        snake.jumpScale = 1;
        this.emitTrail(snake, previous, movementAngle, distance);
        if (
          !snake.invulnerable &&
          !snake.ghosted &&
          this.collidesWithWall(snake.head)
        ) {
          const wall = this.wallAt(snake.head);
          if (this.damageSnake(snake, 50, now) && wall && wall.frame !== 8)
            this.destroyedWalls.add(wall.id);
          continue;
        }
        this.applyTerrain(snake, terrain, safeDt, now);
        if (!snake.alive) continue;
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
    this.resolveHeadCollisions(now);
    this.resolveTrailCollisions(now);
    if (this.managedMatch && this.mode === 'survival')
      this.checkRoundWinner(now);
  }

  snapshot(now = Date.now()): GameSnapshot {
    return {
      type: 'snapshot',
      sequence: this.nextSnapshotSequence++,
      room: this.id,
      levelId: this.level.id,
      devMode: this.devMode,
      serverTime: now,
      phase: this.phase,
      mode: this.mode,
      hostId: this.hostId,
      players: [...this.players.values()].map(
        ({ spawnIndex: _, ...player }) => ({ ...player }),
      ),
      winsToMatch: this.winsToMatch,
      roundNumber: this.roundNumber,
      phaseEndsAt: this.phaseEndsAt,
      roundWinnerId: this.roundWinnerId,
      matchWinnerId: this.matchWinnerId,
      discoUntil: this.discoUntil,
      food: this.food.map((item) => ({ ...item })),
      powerUps: this.powerUps.map(
        ({ lifeRemaining: _, shrinking: __, ...item }) => ({ ...item }),
      ),
      fireballs: this.fireballs.map(({ lifeRemaining: _, ...item }) => ({
        ...item,
      })),
      grenades: this.grenades.map(
        ({ speed: _, elapsed: __, blastRadius: ___, ...item }) => ({ ...item }),
      ),
      blasts: this.blasts.map(({ elapsed: _, ...item }) => ({ ...item })),
      rails: this.rails.map(({ remaining: _, ...item }) => ({ ...item })),
      turrets: this.turrets.map(
        ({
          frequency: _,
          shotClock: __,
          rotationSpeed: ___,
          velocityX: ____,
          velocityY: _____,
          ...item
        }) => ({
          ...item,
        }),
      ),
      turretShots: this.turretShots.map((shot) => ({ ...shot })),
      events: this.events.map((event) => ({ ...event })),
      detachedTrails: this.detachedTrails.map((trail) => ({
        id: trail.id,
        color: trail.color,
        body: trail.body.map(({ x, y, segment }) => ({ x, y, segment })),
      })),
      destroyedWalls: [...this.destroyedWalls].sort((a, b) => a - b),
      snakes: [...this.snakes.values()].map((snake) => ({
        id: snake.id,
        ownerId: snake.ownerId,
        name: snake.name,
        color: snake.color,
        head: { ...snake.head },
        body: snake.body.map(({ x, y, segment }) => ({ x, y, segment })),
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
        shield: snake.shield,
        ghosted: snake.ghosted,
        stunned: snake.stunned,
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
    this.emitEvent('jump', snake.head);
  }

  private emitEvent(type: GameEventType, point: Point, powerUp?: PowerUpType) {
    this.events.push({
      id: this.nextEventId++,
      type,
      x: point.x,
      y: point.y,
      ...(powerUp ? { powerUp } : {}),
    });
    if (this.events.length > EVENT_HISTORY_LIMIT)
      this.events.splice(0, this.events.length - EVENT_HISTORY_LIMIT);
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
        collisionAge: 0,
      });
      snake.sampleDistance = 0;
    }
    snake.sampleDistance += remaining;
    while (snake.body.length > snake.targetLength) snake.body.pop();
  }

  private collectFood(snake: Snake) {
    for (let index = this.food.length - 1; index >= 0; index -= 1) {
      const food = this.food[index];
      if (toroidalDistance(snake.head, food) >= PICKUP_RADIUS) continue;
      this.food.splice(index, 1);
      snake.targetLength += FOOD_GROWTH;
      const owner = this.snakes.get(snake.ownerId);
      if (owner) owner.dots += 1;
      this.emitEvent('food-collected', food);
    }
  }

  private collectPowerUps(snake: Snake) {
    for (let index = this.powerUps.length - 1; index >= 0; index -= 1) {
      const powerUp = this.powerUps[index];
      if (toroidalDistance(snake.head, powerUp) >= PICKUP_RADIUS) continue;
      if (powerUp.type === 'shield') snake.shield = 100;
      else if (powerUp.type === 'tron-mode')
        snake.targetLength += Math.round(360 / TRAIL_SPACING);
      else if (powerUp.type === 'disco-ball')
        this.discoUntil = Date.now() + 10_000;
      else snake.powerUp = powerUp.type;
      this.powerUps.splice(index, 1);
      this.emitEvent('power-up-collected', powerUp, powerUp.type);
    }
  }

  private activatePowerUp(snake: Snake, now: number) {
    const powerUp = snake.powerUp;
    snake.powerUp = null;
    switch (powerUp) {
      case 'speed-boost':
        snake.speedBoost += SPEED_BOOST_AMOUNT;
        this.emitEvent('speed-boost', snake.head);
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
      case 'napalm':
        this.throwGrenade(snake, 50);
        break;
      case 'one-eighty':
        this.oneEighty(snake);
        this.emitEvent('one-eighty', snake.head);
        break;
      case 'rail-gun':
        this.shootRail(snake, now);
        break;
      case 'trident':
        this.addTridentHeads(snake, now);
        break;
      case 'ghost':
        snake.ghosted = true;
        snake.ghostedUntil = now + GHOST_DURATION_MS;
        break;
      case 'tron-mode':
        snake.targetLength += Math.round(360 / TRAIL_SPACING);
        break;
      case 'shield':
        snake.shield = 100;
        break;
      case 'disco-ball':
        this.discoUntil = now + 10_000;
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
    this.emitEvent('fireball-launched', snake.head);
  }

  private throwGrenade(snake: Snake, blastRadius = GRENADE_BLAST_RADIUS) {
    this.grenades.push({
      id: this.nextGrenadeId++,
      ownerId: snake.id,
      angle: snake.angle,
      x: snake.head.x,
      y: snake.head.y,
      scale: GRENADE_START_SCALE,
      speed: snake.baseSpeed + snake.speedBoost + GRENADE_EXTRA_SPEED,
      elapsed: 0,
      blastRadius,
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
    let length = Math.max(0, Math.min(xDistance, yDistance));
    for (let distance = 0; distance <= length; distance += 4) {
      const point = {
        x: start.x + direction.x * distance,
        y: start.y + direction.y * distance,
      };
      if (this.collidesWithWall(point, 0)) {
        length = distance;
        break;
      }
    }
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
    this.emitEvent('rail-gun', shooter.head);

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
    if (closest) this.damageSnake(closest.snake, 100, now);
  }

  private addTridentHeads(source: Snake, now: number) {
    this.emitEvent('trident', source.head);
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
    source.siblingCollisionGraceUntil = now + TRIDENT_COLLISION_GRACE_MS;
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
      head.siblingCollisionGraceUntil = now + TRIDENT_COLLISION_GRACE_MS;
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
        this.emitEvent('power-up-collected', grenade, 'grenade');
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
    this.emitEvent('grenade-explosion', grenade);
    this.blasts.push({
      id: this.nextBlastId++,
      x: grenade.x,
      y: grenade.y,
      radius: grenade.blastRadius,
      progress: 0,
      kind: 'explosion',
      elapsed: 0,
    });
    for (const snake of this.snakes.values()) {
      if (
        snake.alive &&
        !snake.invulnerable &&
        snake.jumpRemaining <= 0 &&
        toroidalDistance(grenade, snake.head) < grenade.blastRadius
      )
        this.damageSnake(snake, 50, now);

      let removed = 0;
      for (let index = snake.body.length - 1; index >= 0; index -= 1) {
        if (
          toroidalDistance(grenade, snake.body[index]) < grenade.blastRadius
        ) {
          snake.body.splice(index, 1);
          removed += 1;
        }
      }
      if (removed > 0)
        snake.targetLength = Math.max(1, snake.targetLength - removed);
    }
    for (const trail of this.detachedTrails) {
      for (let index = trail.body.length - 1; index >= 0; index -= 1) {
        if (toroidalDistance(grenade, trail.body[index]) < grenade.blastRadius)
          trail.body.splice(index, 1);
      }
    }
    this.removeEmptyDetachedTrails();
    for (let index = this.fireballs.length - 1; index >= 0; index -= 1) {
      if (
        toroidalDistance(grenade, this.fireballs[index]) < grenade.blastRadius
      )
        this.fireballs.splice(index, 1);
    }
    for (const wall of this.level.walls) {
      if (
        wall.frame !== 8 &&
        !this.destroyedWalls.has(wall.id) &&
        this.distanceToWall(grenade, wall) < grenade.blastRadius
      )
        this.destroyedWalls.add(wall.id);
    }
    for (let index = this.turrets.length - 1; index >= 0; index -= 1) {
      if (toroidalDistance(grenade, this.turrets[index]) < grenade.blastRadius)
        this.turrets.splice(index, 1);
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
          this.emitEvent('fireball-impact', a);
        }
      }
    }

    for (const fireball of this.fireballs) {
      if (destroyed.has(fireball.id)) continue;
      const wall = this.wallAt(fireball, FIREBALL_RADIUS);
      if (wall) {
        if (wall.frame !== 8) this.destroyedWalls.add(wall.id);
        destroyed.add(fireball.id);
        this.emitEvent('fireball-impact', fireball);
        continue;
      }
      for (const snake of this.snakes.values()) {
        if (
          !snake.alive ||
          snake.invulnerable ||
          snake.jumpRemaining > 0 ||
          snake.underwater ||
          snake.speedBoost >= 2.5 * UPDATE_RATE
        )
          continue;
        if (
          toroidalDistance(fireball, snake.head) <
          FIREBALL_RADIUS + HEAD_RADIUS
        ) {
          this.damageSnake(snake, 100, now);
          destroyed.add(fireball.id);
          this.emitEvent('fireball-impact', fireball);
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
      for (const trail of this.detachedTrails) {
        for (let index = trail.body.length - 1; index >= 0; index -= 1) {
          if (
            toroidalDistance(fireball, trail.body[index]) <
            FIREBALL_RADIUS + BODY_RADIUS
          )
            trail.body.splice(index, 1);
        }
      }
    }
    this.removeEmptyDetachedTrails();

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

  private landShockwave(source: Snake, now: number) {
    const magnitude = Math.max(1, source.slamPower || 1);
    const radius = Math.min(150, 40 * magnitude);
    source.slamPower = 0;
    this.blasts.push({
      id: this.nextBlastId++,
      x: source.head.x,
      y: source.head.y,
      radius,
      progress: 0,
      kind: 'shockwave',
      elapsed: 0,
    });
    for (const snake of this.snakes.values()) {
      if (
        snake.id === source.id ||
        !snake.alive ||
        snake.invulnerable ||
        snake.ghosted ||
        snake.jumpRemaining > 0
      )
        continue;
      if (toroidalDistance(source.head, snake.head) < radius) {
        snake.stunned = true;
        snake.stunnedUntil = now + STUN_DURATION_MS;
      }
    }
  }

  private advanceTurrets(dt: number, now: number) {
    for (const turret of this.turrets) {
      turret.x = wrap(turret.x + turret.velocityX * dt, WORLD_WIDTH);
      turret.y = wrap(turret.y + turret.velocityY * dt, WORLD_HEIGHT);
      turret.angle = normalizeAngle(turret.angle + turret.rotationSpeed * dt);
      turret.shotClock += dt;
      while (turret.shotClock >= turret.frequency) {
        turret.shotClock -= turret.frequency;
        this.turretShots.push({
          id: this.nextTurretShotId++,
          x: wrap(turret.x + Math.cos(turret.angle) * 22, WORLD_WIDTH),
          y: wrap(turret.y + Math.sin(turret.angle) * 22, WORLD_HEIGHT),
          angle: turret.angle,
        });
      }
    }

    for (let index = this.turretShots.length - 1; index >= 0; index -= 1) {
      const shot = this.turretShots[index];
      shot.x = wrap(
        shot.x + Math.cos(shot.angle) * TURRET_SHOT_SPEED * dt,
        WORLD_WIDTH,
      );
      shot.y = wrap(
        shot.y + Math.sin(shot.angle) * TURRET_SHOT_SPEED * dt,
        WORLD_HEIGHT,
      );
      let remove = this.collidesWithWall(shot, TURRET_SHOT_RADIUS);
      if (!remove) {
        for (const snake of this.snakes.values()) {
          if (
            !snake.alive ||
            snake.invulnerable ||
            snake.ghosted ||
            snake.jumpRemaining > 0
          )
            continue;
          if (
            toroidalDistance(shot, snake.head) <
            TURRET_SHOT_RADIUS + HEAD_RADIUS
          ) {
            this.damageSnake(snake, 100, now);
            remove = true;
            break;
          }
        }
      }
      if (remove) this.turretShots.splice(index, 1);
    }

    for (let index = this.turrets.length - 1; index >= 0; index -= 1) {
      const turret = this.turrets[index];
      for (const snake of this.snakes.values()) {
        if (
          !snake.alive ||
          snake.invulnerable ||
          snake.ghosted ||
          snake.jumpRemaining > 0
        )
          continue;
        if (toroidalDistance(turret, snake.head) < 23) {
          if (this.damageSnake(snake, 100, now)) this.turrets.splice(index, 1);
          break;
        }
      }
    }
  }

  private resolveTrailCollisions(now: number) {
    const collisions = new Set<string>();
    for (const snake of this.snakes.values()) {
      if (!snake.alive || snake.invulnerable || snake.jumpRemaining > 0)
        continue;
      for (const other of this.snakes.values()) {
        if (!other.alive) continue;
        if (
          other.id !== snake.id &&
          other.ownerId === snake.ownerId &&
          now < snake.siblingCollisionGraceUntil
        )
          continue;
        const start = other.id === snake.id ? 15 : 0;
        for (let index = start; index < other.body.length; index += 1) {
          if (
            other.body[index].collisionAge >= 3 &&
            toroidalDistance(snake.head, other.body[index]) <
              HEAD_RADIUS + BODY_RADIUS
          ) {
            collisions.add(snake.id);
            break;
          }
        }
        if (collisions.has(snake.id)) break;
      }
      if (collisions.has(snake.id)) continue;
      for (const trail of this.detachedTrails) {
        if (
          trail.body.some(
            (point) =>
              point.collisionAge >= 3 &&
              toroidalDistance(snake.head, point) < HEAD_RADIUS + BODY_RADIUS,
          )
        ) {
          collisions.add(snake.id);
          break;
        }
      }
    }
    for (const snakeId of collisions) {
      const snake = this.snakes.get(snakeId);
      if (snake?.alive) this.damageSnake(snake, 25, now);
    }
  }

  private killSnake(snake: Snake, now: number) {
    this.emitEvent('snake-death', snake.head);
    snake.alive = false;
    snake.deaths += 1;
    snake.respawnAt = Number.POSITIVE_INFINITY;
    snake.jump = 0;
    snake.jumpScale = 1;
    snake.jumpRemaining = 0;
    if (snake.body.length > 0) {
      this.detachedTrails.push({
        id: this.nextDetachedTrailId++,
        color: snake.color,
        body: snake.body,
      });
    }
    snake.body = [];
    snake.powerUp = null;
    snake.speedBoost = 0;
    snake.shield = 0;
    snake.ghosted = false;
    snake.stunned = false;

    const ownerStillAlive = [...this.snakes.values()].some(
      (head) => head.ownerId === snake.ownerId && head.alive,
    );
    if (!ownerStillAlive) {
      const primary = this.snakes.get(snake.ownerId);
      if (primary?.respawns && this.mode === 'quickplay')
        primary.respawnAt = now + RESPAWN_DELAY_MS;
    }
  }

  private damageSnake(snake: Snake, amount: number, now: number) {
    if (!snake.alive || snake.invulnerable || snake.ghosted) return false;
    if (snake.shield > 0) {
      snake.shield = Math.max(0, snake.shield - amount);
      if (snake.shield === 0) {
        snake.invulnerable = true;
        snake.invulnerableUntil = now + 1_500;
      }
      return true;
    }
    this.killSnake(snake, now);
    return false;
  }

  private updateWorldSpawns(dt: number) {
    this.foodSpawnClock += dt;
    while (this.foodSpawnClock >= FOOD_SPAWN_SECONDS) {
      this.foodSpawnClock -= FOOD_SPAWN_SECONDS;
      if (this.food.length < this.level.maxEggs) this.spawnFood();
    }

    for (let index = this.powerUps.length - 1; index >= 0; index -= 1) {
      const powerUp = this.powerUps[index];
      if (powerUp.shrinking) {
        powerUp.scale -= dt * UPDATE_RATE * 0.1;
        if (powerUp.scale <= 0) this.powerUps.splice(index, 1);
        continue;
      }
      powerUp.scale = Math.min(1, powerUp.scale + dt * UPDATE_RATE * 0.1);
      powerUp.lifeRemaining -= dt;
      if (powerUp.lifeRemaining <= 0) powerUp.shrinking = true;
    }
    this.powerUpSpawnClock += dt;
    while (this.powerUpSpawnClock >= this.level.powerUpSpawnFrequency) {
      this.powerUpSpawnClock -= this.level.powerUpSpawnFrequency;
      if (this.devMode || this.level.powerUpSpawns.length === 0) continue;
      this.spawnPowerUp(
        POWER_UP_TYPES[Math.floor(this.random() * POWER_UP_TYPES.length)],
      );
    }
  }

  private fillFood() {
    while (this.food.length < this.level.maxEggs) this.spawnFood();
  }

  private spawnFood() {
    this.food.push({ id: this.nextFoodId++, ...this.randomArenaPoint() });
  }

  private randomArenaPoint() {
    let point = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    for (let attempt = 0; attempt < 24; attempt += 1) {
      point = {
        x: 34 + this.random() * (WORLD_WIDTH - 68),
        y: 34 + this.random() * (WORLD_HEIGHT - 68),
      };
      if (this.isSafeWorldSpawn(point)) return point;
    }
    return point;
  }

  private randomPowerUpPoint() {
    if (this.level.powerUpSpawns.length === 0) return this.randomArenaPoint();
    let point = this.randomArenaPoint();
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const area =
        this.level.powerUpSpawns[
          Math.floor(this.random() * this.level.powerUpSpawns.length)
        ];
      point = {
        x: area.x + this.random() * area.width,
        y: area.y + this.random() * area.height,
      };
      if (this.isSafeWorldSpawn(point)) return point;
    }
    return point;
  }

  private isSafeWorldSpawn(point: Point) {
    if (this.collidesWithWall(point, PICKUP_RADIUS)) return false;
    if (this.terrainAt(point) === 2) return false;
    if (
      [...this.snakes.values()].some(
        (snake) =>
          snake.alive &&
          toroidalDistance(point, snake.head) < PICKUP_RADIUS * 2,
      )
    )
      return false;
    return !this.turrets.some(
      (turret) => toroidalDistance(point, turret) < PICKUP_RADIUS * 2,
    );
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
      this.level.playerSpawns[snake.spawnIndex],
      snake.spawnIndex,
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
    spawnIndex = 0,
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
      shield: 0,
      ghosted: false,
      stunned: false,
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
      siblingCollisionGraceUntil: 0,
      spawnIndex,
      underwater: false,
      terrainErosion: 0,
      stunnedUntil: 0,
      ghostedUntil: 0,
      slamPower: 0,
      driftAngle: angle,
      summonSicknessUntil: now + 3 * (1_000 / UPDATE_RATE),
    };
  }

  private spawnFixedItems() {
    for (const item of this.level.fixedItems) {
      if (item.kind === 'egg') {
        this.food.push({ id: this.nextFoodId++, x: item.x, y: item.y });
      } else if (POWER_UP_TYPES.includes(item.kind as PowerUpType)) {
        this.spawnPowerUp(
          item.kind as PowerUpType,
          item,
          item.lifespan ?? Number.POSITIVE_INFINITY,
        );
      }
    }
  }

  private terrainAt(point: Point) {
    const x = Math.floor(wrap(point.x, WORLD_WIDTH) / 32) * 32;
    const y = Math.floor(wrap(point.y, WORLD_HEIGHT) / 32) * 32;
    return this.terrainByCell.get(`${x},${y}`) ?? null;
  }

  private applyTerrain(
    snake: Snake,
    terrain: number | null,
    dt: number,
    now: number,
  ) {
    if (terrain === 5) {
      this.endRound(snake.ownerId, now);
      return;
    }
    if (terrain !== 2) return;
    const ticks = Math.round(dt * UPDATE_RATE);
    for (let tick = 0; tick < ticks; tick += 1) {
      snake.body.pop();
      snake.terrainErosion += 2;
      while (snake.terrainErosion >= TRAIL_SPACING) {
        snake.terrainErosion -= TRAIL_SPACING;
        if (snake.targetLength <= 1) {
          this.damageSnake(snake, 1, now);
          return;
        }
        snake.targetLength -= 1;
      }
    }
  }

  private wallAt(point: Point, radius = HEAD_RADIUS) {
    return this.level.walls.find(
      (wall) =>
        !this.destroyedWalls.has(wall.id) &&
        this.distanceToWall(point, wall) < radius,
    );
  }

  private collidesWithWall(point: Point, radius = HEAD_RADIUS) {
    return Boolean(this.wallAt(point, radius));
  }

  private distanceToWall(point: Point, wall: LevelTile) {
    let closest = Number.POSITIVE_INFINITY;
    for (const offsetX of [-WORLD_WIDTH, 0, WORLD_WIDTH]) {
      for (const offsetY of [-WORLD_HEIGHT, 0, WORLD_HEIGHT]) {
        const left = wall.x + offsetX;
        const top = wall.y + offsetY;
        const dx = Math.max(left - point.x, 0, point.x - (left + 32));
        const dy = Math.max(top - point.y, 0, point.y - (top + 32));
        closest = Math.min(closest, Math.hypot(dx, dy));
      }
    }
    return closest;
  }

  private resolveHeadCollisions(now: number) {
    const collidable = [...this.snakes.values()].filter(
      (snake) => snake.alive && !snake.invulnerable && snake.jumpRemaining <= 0,
    );
    const collisions = new Set<string>();
    for (let first = 0; first < collidable.length; first += 1) {
      for (let second = first + 1; second < collidable.length; second += 1) {
        const a = collidable[first];
        const b = collidable[second];
        if (
          a.ownerId === b.ownerId &&
          now <
            Math.max(a.siblingCollisionGraceUntil, b.siblingCollisionGraceUntil)
        )
          continue;
        if (toroidalDistance(a.head, b.head) < HEAD_RADIUS * 2) {
          collisions.add(a.id);
          collisions.add(b.id);
        }
      }
    }
    for (const id of collisions) {
      const snake = this.snakes.get(id);
      if (snake?.alive) this.damageSnake(snake, 100, now);
    }
  }

  private removeEmptyDetachedTrails() {
    for (let index = this.detachedTrails.length - 1; index >= 0; index -= 1) {
      if (this.detachedTrails[index].body.length === 0)
        this.detachedTrails.splice(index, 1);
    }
  }
}
