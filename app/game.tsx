'use client';
// @refresh reset

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Crown,
  LogIn,
  LogOut,
  Music2,
  Radio,
  RotateCcw,
  Settings2,
  Swords,
  Trophy,
  UserRound,
  UserRoundCheck,
  Users,
  Volume1,
  VolumeX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  audioAssetPath,
  levelPreviewPath,
  tileAssetPath,
  type AssetPalette,
  type AudioAssetId,
} from '@/shared/assets';
import {
  COMMENDATIONS,
  COMMENDATION_IDS,
  type CommendationCounts,
} from '@/shared/badges';
import {
  SNAKE_HEAD_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type AccountIdentity,
  type GameEvent,
  type GameSnapshot,
  type InputState,
  type PowerUpType,
  type ServerMessage,
  type SnakeSnapshot,
} from '@/shared/protocol';
import { getLevel, LEVELS } from '@/shared/levels.generated';
import type { CompiledLevel, LevelTile } from '@/shared/levels';
import { unpackSnapshot } from '@/shared/snapshot-codec';

type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

type AccountMode = 'register' | 'login';

type AccountResponse =
  | { ok: true; account: AccountIdentity }
  | { ok: false; code: string; error?: string };

const EMPTY_INPUT: InputState = {
  left: false,
  right: false,
  jump: false,
  power: false,
};

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    { length: 5 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('');
}

function getWebSocketUrl(room: string, name: string, devMode: boolean) {
  const levelId = new URLSearchParams(window.location.search).get('level');
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) {
    const url = new URL(configured);
    url.searchParams.set('room', room);
    url.searchParams.set('name', name);
    if (devMode) url.searchParams.set('dev', 'true');
    if (levelId) url.searchParams.set('level', levelId);
    return url.toString();
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(`${protocol}//${window.location.host}/ws`);
  url.searchParams.set('room', room);
  url.searchParams.set('name', name);
  if (devMode) url.searchParams.set('dev', 'true');
  if (levelId) url.searchParams.set('level', levelId);
  return url.toString();
}

const POWER_UP_APPEARANCE: Record<
  PowerUpType,
  { color: string; icon: string; name: string }
> = {
  'speed-boost': { color: '#5af2ff', icon: '»', name: 'SPEED BOOST' },
  fireball: { color: '#ff713d', icon: '●', name: 'FIREBALL' },
  jumper: { color: '#ff67cf', icon: '↑', name: 'JUMPER' },
  grenade: { color: '#ffd84d', icon: '✹', name: 'GRENADE' },
  'one-eighty': { color: '#8dff67', icon: '↶', name: 'ONE EIGHTY' },
  'rail-gun': { color: '#f5f7ff', icon: '━', name: 'RAIL GUN' },
  trident: { color: '#ba79ff', icon: 'Ψ', name: 'TRIDENT' },
  ghost: { color: '#b7c8df', icon: '◇', name: 'GHOST' },
  'tron-mode': { color: '#45fff3', icon: '▰', name: 'TRON MODE' },
  shield: { color: '#65a8ff', icon: '⬡', name: 'SHIELD' },
  napalm: { color: '#ff3d2e', icon: '✦', name: 'NAPALM' },
  'disco-ball': { color: '#ff63f3', icon: '◆', name: 'DISCO BALL' },
};

const SFX_LIBRARY = {
  jump: { asset: 'jump', volume: 0.5 },
  land: { asset: 'land', volume: 0.45 },
  food: { asset: 'food', volume: 0.38 },
  death: { asset: 'death', volume: 0.58 },
  'fireball-launch': {
    asset: 'fireballLaunch',
    volume: 0.5,
  },
  'fireball-impact': {
    asset: 'fireballImpact',
    volume: 0.48,
  },
  'grenade-explosion': {
    asset: 'grenadeExplosion',
    volume: 0.58,
  },
  'rail-gun': {
    asset: 'railGun',
    volume: 0.52,
  },
  'speed-boost': {
    asset: 'pickupSpeed',
    volume: 0.42,
  },
  'one-eighty': {
    asset: 'magicAppear',
    volume: 0.42,
  },
  trident: {
    asset: 'magicRespawn',
    volume: 0.48,
  },
  'pickup-speed-boost': {
    asset: 'pickupSpeed',
    volume: 0.42,
  },
  'pickup-fireball': {
    asset: 'pickupFire',
    volume: 0.42,
  },
  'pickup-jumper': {
    asset: 'pickupMagicSpeed',
    volume: 0.42,
  },
  'pickup-grenade': {
    asset: 'ammoPickup',
    volume: 0.42,
  },
  'pickup-one-eighty': {
    asset: 'magicAppear',
    volume: 0.42,
  },
  'pickup-rail-gun': {
    asset: 'pickupScifi',
    volume: 0.42,
  },
  'pickup-trident': {
    asset: 'pickupSwish',
    volume: 0.42,
  },
  'pickup-ghost': {
    asset: 'magicDisappear',
    volume: 0.42,
  },
  'pickup-tron-mode': {
    asset: 'pickupMagicSpeed',
    volume: 0.42,
  },
  'pickup-shield': {
    asset: 'pickupScifi',
    volume: 0.42,
  },
  'pickup-napalm': {
    asset: 'pickupFire',
    volume: 0.42,
  },
  'pickup-disco-ball': {
    asset: 'magicAppear',
    volume: 0.42,
  },
} as const satisfies Record<string, { asset: AudioAssetId; volume: number }>;

type SfxKey = keyof typeof SFX_LIBRARY;
type SfxPool = Map<SfxKey, { cursor: number; voices: HTMLAudioElement[] }>;

function soundForEvent(event: GameEvent): SfxKey | null {
  if (event.type === 'power-up-collected' && event.powerUp)
    return `pickup-${event.powerUp}`;
  const sounds: Partial<Record<GameEvent['type'], SfxKey>> = {
    jump: 'jump',
    land: 'land',
    'food-collected': 'food',
    'snake-death': 'death',
    'speed-boost': 'speed-boost',
    'fireball-launched': 'fireball-launch',
    'fireball-impact': 'fireball-impact',
    'grenade-explosion': 'grenade-explosion',
    'one-eighty': 'one-eighty',
    'rail-gun': 'rail-gun',
    trident: 'trident',
  };
  return sounds[event.type] ?? null;
}

function stopSfx(pool: SfxPool) {
  for (const sound of pool.values()) {
    for (const voice of sound.voices) {
      voice.pause();
      voice.currentTime = 0;
    }
  }
}

const levelImageCache = new Map<string, HTMLImageElement>();

function levelImage(source: string) {
  let image = levelImageCache.get(source);
  if (!image && typeof Image !== 'undefined') {
    image = new Image();
    image.src = source;
    levelImageCache.set(source, image);
  }
  return image;
}

function drawTiles(
  context: CanvasRenderingContext2D,
  tiles: readonly LevelTile[],
  source: string,
  fallback: string,
  excluded = new Set<number>(),
) {
  const image = levelImage(source);
  for (const tile of tiles) {
    if (excluded.has(tile.id)) continue;
    if (image?.complete && image.naturalWidth > 0) {
      context.drawImage(
        image,
        tile.frame * 32,
        0,
        32,
        32,
        tile.x,
        tile.y,
        32,
        32,
      );
    } else {
      context.fillStyle = fallback;
      context.fillRect(tile.x, tile.y, 32, 32);
    }
  }
}

function drawLevel(
  context: CanvasRenderingContext2D,
  level: CompiledLevel,
  destroyedWalls: readonly number[],
  palette: AssetPalette,
) {
  drawTiles(
    context,
    level.terrain,
    tileAssetPath('terrain', palette),
    'rgba(91, 144, 180, .45)',
  );
  drawTiles(
    context,
    level.walls,
    tileAssetPath('walls', palette),
    '#4d5666',
    new Set(destroyedWalls),
  );
  drawTiles(
    context,
    level.overlays,
    tileAssetPath('overlays', palette),
    'rgba(255, 255, 255, .08)',
  );
}

function drawArena(
  canvas: HTMLCanvasElement,
  snapshot: GameSnapshot | null,
  playerId: string | null,
  clock: number,
  palette: AssetPalette,
) {
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(bounds.width * ratio));
  const pixelHeight = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const context = canvas.getContext('2d');
  if (!context) return;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = bounds.width;
  const height = bounds.height;
  context.fillStyle = '#050609';
  context.fillRect(0, 0, width, height);

  const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  const offsetX = (width - WORLD_WIDTH * scale) / 2;
  const offsetY = (height - WORLD_HEIGHT * scale) / 2;
  context.save();
  context.translate(offsetX, offsetY);
  context.scale(scale, scale);

  const vignette = context.createRadialGradient(
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    80,
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_WIDTH * 0.7,
  );
  vignette.addColorStop(0, '#0d1019');
  vignette.addColorStop(0.65, '#080a10');
  vignette.addColorStop(1, '#020305');
  context.fillStyle = vignette;
  context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  context.globalAlpha = 0.18;
  context.fillStyle = '#7f8da8';
  for (let y = 50; y < WORLD_HEIGHT; y += 50) {
    for (let x = 50; x < WORLD_WIDTH; x += 50) context.fillRect(x, y, 1.5, 1.5);
  }
  context.globalAlpha = 1;

  if (!snapshot) {
    context.fillStyle = 'rgba(255,255,255,.12)';
    context.font = '600 18px ui-monospace, monospace';
    context.textAlign = 'center';
    context.fillText(
      'CREATE OR JOIN A ROOM TO ENTER THE ARENA',
      WORLD_WIDTH / 2,
      WORLD_HEIGHT / 2 + 130,
    );
    context.restore();
    return;
  }

  drawLevel(
    context,
    getLevel(snapshot.levelId),
    snapshot.destroyedWalls,
    palette,
  );

  for (const food of snapshot.food) {
    const pulse = 1 + Math.sin(clock * 0.004 + food.id) * 0.12;
    const glow = context.createRadialGradient(
      food.x,
      food.y,
      0,
      food.x,
      food.y,
      28 * pulse,
    );
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(0.12, '#e6c8ff');
    glow.addColorStop(0.32, 'rgba(190,97,255,.72)');
    glow.addColorStop(1, 'rgba(134,56,255,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(food.x, food.y, 30 * pulse, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f5eaff';
    context.beginPath();
    context.arc(food.x, food.y, 3.6, 0, Math.PI * 2);
    context.fill();
  }

  for (const powerUp of snapshot.powerUps) {
    const pulse =
      (1 + Math.sin(clock * 0.006 + powerUp.id) * 0.08) * powerUp.scale;
    const appearance = POWER_UP_APPEARANCE[powerUp.type];
    context.save();
    context.translate(powerUp.x, powerUp.y);
    context.rotate(clock * 0.0012 + powerUp.id);
    context.shadowBlur = 24;
    context.shadowColor = appearance.color;
    context.fillStyle = appearance.color;
    context.strokeStyle = '#fff';
    context.lineWidth = 2;
    context.beginPath();
    context.rect(-10 * pulse, -10 * pulse, 20 * pulse, 20 * pulse);
    context.fill();
    context.stroke();
    context.rotate(-(clock * 0.0012 + powerUp.id));
    context.shadowBlur = 0;
    context.fillStyle = '#071018';
    context.font = '900 12px ui-monospace, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(appearance.icon, 0, -1);
    context.restore();
  }

  for (const turret of snapshot.turrets) {
    context.save();
    context.translate(turret.x, turret.y);
    context.rotate(turret.angle);
    context.shadowBlur = 16;
    context.shadowColor = '#ff506d';
    context.fillStyle = '#252a36';
    context.strokeStyle = '#ff506d';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, 13, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#ff7188';
    context.fillRect(4, -4, 22, 8);
    context.restore();
  }

  for (const shot of snapshot.turretShots) {
    context.save();
    context.shadowBlur = 14;
    context.shadowColor = '#ff3d62';
    context.fillStyle = '#ff7188';
    context.beginPath();
    context.arc(shot.x, shot.y, 6, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  for (const fireball of snapshot.fireballs) {
    const glow = context.createRadialGradient(
      fireball.x,
      fireball.y,
      1,
      fireball.x,
      fireball.y,
      28,
    );
    glow.addColorStop(0, '#fff7cf');
    glow.addColorStop(0.18, '#ffca5c');
    glow.addColorStop(0.45, 'rgba(255,78,38,.9)');
    glow.addColorStop(1, 'rgba(255,48,20,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(fireball.x, fireball.y, 29, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255,104,48,.7)';
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(fireball.x, fireball.y);
    context.lineTo(
      fireball.x - Math.cos(fireball.angle) * 24,
      fireball.y - Math.sin(fireball.angle) * 24,
    );
    context.stroke();
  }

  for (const grenade of snapshot.grenades) {
    context.save();
    context.translate(grenade.x, grenade.y);
    context.scale(grenade.scale, grenade.scale);
    context.rotate(clock * 0.012 + grenade.id);
    context.shadowBlur = 18;
    context.shadowColor = '#ffd84d';
    context.fillStyle = '#1c2430';
    context.strokeStyle = '#ffd84d';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(-7, 0);
    context.lineTo(7, 0);
    context.moveTo(0, -7);
    context.lineTo(0, 7);
    context.stroke();
    context.restore();
  }

  for (const blast of snapshot.blasts) {
    context.save();
    context.globalAlpha = 1 - blast.progress;
    const radius = blast.radius * (0.22 + blast.progress * 0.78);
    const glow = context.createRadialGradient(
      blast.x,
      blast.y,
      radius * 0.25,
      blast.x,
      blast.y,
      radius,
    );
    const shockwave = blast.kind === 'shockwave';
    glow.addColorStop(
      0,
      shockwave ? 'rgba(202,244,255,.2)' : 'rgba(255,250,190,.9)',
    );
    glow.addColorStop(
      0.35,
      shockwave ? 'rgba(90,220,255,.25)' : 'rgba(255,155,45,.7)',
    );
    glow.addColorStop(
      1,
      shockwave ? 'rgba(90,220,255,0)' : 'rgba(255,66,20,0)',
    );
    context.fillStyle = glow;
    context.beginPath();
    context.arc(blast.x, blast.y, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = shockwave ? '#7fe8ff' : '#ffd84d';
    context.lineWidth = 4;
    context.stroke();
    context.restore();
  }

  for (const rail of snapshot.rails) {
    context.save();
    context.globalAlpha = rail.opacity;
    context.lineCap = 'round';
    context.shadowBlur = 22;
    context.shadowColor = '#dffcff';
    context.strokeStyle = '#ffffff';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(rail.start.x, rail.start.y);
    context.lineTo(rail.end.x, rail.end.y);
    context.stroke();
    context.strokeStyle = '#58e9ff';
    context.lineWidth = 1.5;
    context.stroke();
    context.restore();
  }

  for (const trail of snapshot.detachedTrails) {
    context.save();
    context.fillStyle = `hsl(${trail.color} 76% 54% / 0.7)`;
    for (const point of trail.body) {
      context.beginPath();
      context.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  for (const snake of snapshot.snakes)
    drawSnake(context, snake, snake.ownerId === playerId, clock);

  if (snapshot.discoUntil && snapshot.discoUntil > snapshot.serverTime) {
    context.save();
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = 0.13;
    context.fillStyle = `hsl(${(clock * 0.12) % 360} 100% 55%)`;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.restore();
  }
  context.restore();
}

function drawSnake(
  context: CanvasRenderingContext2D,
  snake: SnakeSnapshot,
  isLocal: boolean,
  clock: number,
) {
  if (!snake.alive) return;
  const headScale = snake.jumpScale;
  const head = snake.head;
  const snakeAlpha = snake.ghosted ? 0.28 : 1;

  context.save();
  context.globalAlpha = snakeAlpha;

  if (snake.jump > 0.02) {
    context.save();
    context.globalAlpha = 0.28 * (1 - snake.jump * 0.35);
    context.fillStyle = '#000';
    context.beginPath();
    context.ellipse(
      head.x,
      head.y + 8,
      12 + snake.jump * 5,
      5 + snake.jump * 2,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (let index = snake.body.length - 1; index > 0; index -= 1) {
    const point = snake.body[index];
    const next = snake.body[index - 1];
    if (
      point.segment !== next.segment ||
      Math.abs(point.x - next.x) > WORLD_WIDTH / 2 ||
      Math.abs(point.y - next.y) > WORLD_HEIGHT / 2
    )
      continue;
    const hue = (snake.color + index * 9) % 360;
    context.strokeStyle = `hsl(${hue} 92% ${isLocal ? 65 : 58}%)`;
    context.lineWidth = isLocal ? 5 : 4;
    context.globalAlpha = snake.invulnerable
      ? 0.5 + Math.sin(clock * 0.02) * 0.25
      : 0.92;
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(next.x, next.y);
    context.stroke();
  }

  const firstTrailPoint = snake.body[0];
  if (
    snake.jump <= 0.02 &&
    firstTrailPoint &&
    Math.hypot(head.x - firstTrailPoint.x, head.y - firstTrailPoint.y) < 28
  ) {
    context.strokeStyle = `hsl(${snake.color} 92% ${isLocal ? 65 : 58}%)`;
    context.lineWidth = isLocal ? 5 : 4;
    context.globalAlpha = snake.invulnerable
      ? 0.5 + Math.sin(clock * 0.02) * 0.25
      : 0.92;
    context.beginPath();
    context.moveTo(firstTrailPoint.x, firstTrailPoint.y);
    context.lineTo(head.x, head.y);
    context.stroke();
  }

  context.globalAlpha = snakeAlpha;
  if (snake.speedBoost > 0) {
    context.strokeStyle = 'rgba(90,242,255,.68)';
    context.lineWidth = 3;
    context.shadowBlur = 18;
    context.shadowColor = '#5af2ff';
    context.beginPath();
    context.arc(
      head.x,
      head.y,
      15 + Math.sin(clock * 0.02) * 2,
      0,
      Math.PI * 2,
    );
    context.stroke();
    context.shadowBlur = 0;
  }
  context.shadowBlur = isLocal ? 22 : 12;
  context.shadowColor = `hsl(${snake.color} 100% 60%)`;
  context.fillStyle = isLocal ? '#ffffff' : `hsl(${snake.color} 90% 70%)`;
  context.beginPath();
  context.arc(head.x, head.y, SNAKE_HEAD_RADIUS * headScale, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;

  if (snake.shield > 0) {
    context.strokeStyle = `rgba(101,168,255,${0.45 + snake.shield / 200})`;
    context.lineWidth = 2.5;
    context.shadowBlur = 12;
    context.shadowColor = '#65a8ff';
    context.beginPath();
    context.arc(head.x, head.y, 13 * headScale, 0, Math.PI * 2);
    context.stroke();
    context.shadowBlur = 0;
  }

  if (snake.stunned) {
    context.fillStyle = '#7fe8ff';
    context.font = '900 13px ui-monospace, monospace';
    context.fillText('✦  ✦', head.x, head.y - 16);
  }

  context.strokeStyle = '#071018';
  context.lineWidth = 3;
  const eyeAngle = snake.angle + Math.PI / 2;
  for (const side of [-1, 1]) {
    const ex =
      head.x + Math.cos(snake.angle) * 4.8 + Math.cos(eyeAngle) * side * 3.2;
    const ey =
      head.y + Math.sin(snake.angle) * 4.8 + Math.sin(eyeAngle) * side * 3.2;
    context.beginPath();
    context.arc(ex, ey, 1.35, 0, Math.PI * 2);
    context.stroke();
  }

  context.font = '700 15px ui-monospace, monospace';
  context.textAlign = 'center';
  context.fillStyle = 'rgba(255,255,255,.7)';
  context.fillText(
    snake.name.toUpperCase(),
    head.x,
    head.y - 25 - snake.jump * 7,
  );

  if (snake.powerUp) {
    const appearance = POWER_UP_APPEARANCE[snake.powerUp];
    const iconX = head.x + Math.cos(eyeAngle) * 19;
    const iconY = head.y + Math.sin(eyeAngle) * 19;
    context.shadowBlur = 10;
    context.shadowColor = appearance.color;
    context.fillStyle = appearance.color;
    context.strokeStyle = '#fff';
    context.lineWidth = 1.25;
    context.beginPath();
    context.arc(iconX, iconY, 7.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = '#071018';
    context.font = '900 9px ui-monospace, monospace';
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillText(appearance.icon, iconX, iconY);
  }
  context.restore();
}

function powerUpName(powerUp: PowerUpType | null) {
  return powerUp ? POWER_UP_APPEARANCE[powerUp].name : 'EMPTY';
}

function sliderValue(value: number | readonly number[]) {
  return typeof value === 'number' ? value : (value[0] ?? 0);
}

function earnedCommendations(counts: CommendationCounts = {}) {
  return COMMENDATION_IDS.filter((id) => (counts[id] ?? 0) > 0).sort(
    (a, b) => (counts[b] ?? 0) - (counts[a] ?? 0),
  );
}

function CommendationRow({ counts = {} }: { counts?: CommendationCounts }) {
  const earned = earnedCommendations(counts);
  if (earned.length === 0) return null;
  const visible = earned.slice(0, 3);
  const hidden = earned.slice(visible.length);
  return (
    <div className="commendation-row" aria-label="Commendation totals">
      {visible.map((commendationId) => {
        const commendation = COMMENDATIONS[commendationId];
        return (
          <abbr
            key={commendationId}
            className="commendation-chip"
            title={`${commendation.label} — ${commendation.description}`}
          >
            <b>{commendation.mark}</b>
            <small>{commendation.shortLabel}</small>
            <em>×{counts[commendationId]}</em>
          </abbr>
        );
      })}
      {hidden.length > 0 && (
        <abbr
          className="commendation-chip commendation-overflow"
          title={hidden
            .map((id) => `${COMMENDATIONS[id].label} ×${counts[id]}`)
            .join(', ')}
        >
          +{hidden.length}
        </abbr>
      )}
    </div>
  );
}

function RoundCommendations({ snapshot }: { snapshot: GameSnapshot }) {
  if (snapshot.roundCommendations.length === 0) return null;
  return (
    <div className="round-commendations" aria-label="Round commendations">
      {snapshot.roundCommendations.map((award) => {
        const player = snapshot.players.find(
          (candidate) => candidate.id === award.playerId,
        );
        return (
          <div key={award.playerId}>
            <strong>{player?.name ?? 'Departed noodle'}</strong>
            <span>
              {award.commendations.map((id) => (
                <abbr key={id} title={COMMENDATIONS[id].description}>
                  <b>{COMMENDATIONS[id].mark}</b> {COMMENDATIONS[id].label}
                </abbr>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function DangerNoodleGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sfxPoolRef = useRef<SfxPool>(new Map());
  const sfxEnabledRef = useRef(true);
  const sfxVolumeRef = useRef(1);
  const sfxUnlockedRef = useRef(false);
  const lastEventIdRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const snapshotRef = useRef<GameSnapshot | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const connectionTokenRef = useRef<string | null>(null);
  const inputRef = useRef<InputState>({ ...EMPTY_INPUT });
  const reconnectRef = useRef<number | null>(null);
  const reconnectFunctionRef = useRef<(room: string, name: string) => void>(
    () => undefined,
  );
  const sequenceRef = useRef(0);
  const networkStatsRef = useRef({
    lastArrival: null as number | null,
    lastSequence: null as number | null,
    intervals: [] as number[],
    decodeDurations: [] as number[],
    droppedSnapshots: 0,
    staleSnapshots: 0,
    lastReportAt: 0,
  });
  const devConnectedRef = useRef(false);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionState>('idle');
  const [name, setName] = useState('Danger Noodle');
  const [room, setRoom] = useState('NOODLE');
  const [selectedLevel, setSelectedLevel] = useState('empty');
  const [joined, setJoined] = useState(false);
  const [copied, setCopied] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(0.38);
  const [sfxVolume, setSfxVolume] = useState(1);
  const [assetPalette, setAssetPalette] = useState<AssetPalette>('classic');
  const [account, setAccount] = useState<AccountIdentity | null>(null);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [accountMode, setAccountMode] = useState<AccountMode>('register');
  const [accountUsername, setAccountUsername] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const audio = new Audio(audioAssetPath('theme', assetPalette));
    audioRef.current = audio;
    audio.preload = 'auto';
    const storedVolume = Number(localStorage.getItem('dnl-music-volume'));
    const initialVolume = Number.isFinite(storedVolume)
      ? Math.min(1, Math.max(0, storedVolume))
      : 0.38;
    audio.volume = initialVolume;
    audio.loop = true;
    const timer = window.setTimeout(() => {
      setMusicVolume(initialVolume);
      const enabled = localStorage.getItem('dnl-music-muted') !== 'true';
      setMusicEnabled(enabled);
      if (enabled) {
        void audio.play().catch(() => {
          // Audible autoplay is commonly blocked until Enter Arena is pressed.
        });
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      audio.pause();
      audioRef.current = null;
    };
  }, [assetPalette]);

  const unlockSfx = useCallback(() => {
    if (sfxUnlockedRef.current) return;
    sfxUnlockedRef.current = true;
    for (const sound of sfxPoolRef.current.values()) {
      const voice = sound.voices[0];
      voice.muted = true;
      void voice
        .play()
        .then(() => {
          voice.pause();
          voice.currentTime = 0;
        })
        .catch(() => {
          sfxUnlockedRef.current = false;
        })
        .finally(() => {
          voice.muted = false;
        });
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch('/api/account/session', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as AccountResponse;
      })
      .then((result) => {
        if (!active || !result?.ok) return;
        setAccount(result.account);
        setName(result.account.username);
        localStorage.setItem('dnl-name', result.account.username);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const pool: SfxPool = new Map();
    const storedVolume = Number(localStorage.getItem('dnl-sfx-volume'));
    const initialVolume = Number.isFinite(storedVolume)
      ? Math.min(1, Math.max(0, storedVolume))
      : 1;
    sfxVolumeRef.current = initialVolume;
    for (const [key, config] of Object.entries(SFX_LIBRARY) as [
      SfxKey,
      (typeof SFX_LIBRARY)[SfxKey],
    ][]) {
      const voices = Array.from({ length: 4 }, () => {
        const voice = new Audio(audioAssetPath(config.asset, assetPalette));
        voice.preload = 'auto';
        voice.volume = config.volume * initialVolume;
        return voice;
      });
      pool.set(key, { cursor: 0, voices });
    }
    sfxPoolRef.current = pool;
    const enabled = localStorage.getItem('dnl-sfx-muted') !== 'true';
    sfxEnabledRef.current = enabled;
    const settingsTimer = window.setTimeout(() => {
      setSfxVolume(initialVolume);
      setSfxEnabled(enabled);
    }, 0);
    window.addEventListener('pointerdown', unlockSfx, {
      capture: true,
      once: true,
    });
    window.addEventListener('keydown', unlockSfx, {
      capture: true,
      once: true,
    });
    return () => {
      window.clearTimeout(settingsTimer);
      window.removeEventListener('pointerdown', unlockSfx, { capture: true });
      window.removeEventListener('keydown', unlockSfx, { capture: true });
      stopSfx(pool);
      sfxPoolRef.current = new Map();
    };
  }, [assetPalette, unlockSfx]);

  const playGameEvents = useCallback((events: GameEvent[]) => {
    const latestEventId = events.at(-1)?.id ?? 0;
    if (lastEventIdRef.current === null) {
      lastEventIdRef.current = latestEventId;
      return;
    }
    for (const event of events) {
      if (event.id <= lastEventIdRef.current) continue;
      const key = soundForEvent(event);
      const sound = key ? sfxPoolRef.current.get(key) : null;
      if (!key || !sound || !sfxEnabledRef.current) continue;
      const voice = sound.voices[sound.cursor];
      sound.cursor = (sound.cursor + 1) % sound.voices.length;
      voice.volume = SFX_LIBRARY[key].volume * sfxVolumeRef.current;
      voice.currentTime = 0;
      void voice.play().catch(() => undefined);
    }
    lastEventIdRef.current = Math.max(lastEventIdRef.current, latestEventId);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setRoom((params.get('room') || makeRoomCode()).toUpperCase());
      setSelectedLevel(getLevel(params.get('level')).id);
      const storedPalette = localStorage.getItem('dnl-asset-palette');
      if (storedPalette === 'classic' || storedPalette === 'handmade')
        setAssetPalette(storedPalette);
      setName(
        localStorage.getItem('dnl-name') ||
          `Noodle ${Math.floor(10 + Math.random() * 90)}`,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const sendInput = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: 'input',
        input: inputRef.current,
        sequence: sequenceRef.current++,
      }),
    );
  }, []);

  const sendPing = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
    reconnectRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) socket.close();
  }, []);

  const connect = useCallback(
    (nextRoom: string, nextName: string, isReconnect = false) => {
      if (musicEnabled) {
        void audioRef.current?.play().catch(() => undefined);
      }
      disconnect();
      lastEventIdRef.current = null;
      playerIdRef.current = null;
      connectionTokenRef.current = null;
      networkStatsRef.current = {
        lastArrival: null,
        lastSequence: null,
        intervals: [],
        decodeDurations: [],
        droppedSnapshots: 0,
        staleSnapshots: 0,
        lastReportAt: performance.now(),
      };
      const safeRoom =
        nextRoom
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 8) || makeRoomCode();
      const safeName = nextName.trim().slice(0, 16) || 'Mystery Noodle';
      setRoom(safeRoom);
      setName(safeName);
      setJoined(true);
      setStatus(isReconnect ? 'reconnecting' : 'connecting');
      localStorage.setItem('dnl-name', safeName);
      const url = new URL(window.location.href);
      url.searchParams.set('room', safeRoom);
      window.history.replaceState({}, '', url);

      const devMode =
        new URLSearchParams(window.location.search).get('dev') === 'true';
      const socket = new WebSocket(
        getWebSocketUrl(safeRoom, safeName, devMode),
      );
      socketRef.current = socket;
      socket.addEventListener('open', () => {
        setStatus('connected');
        sendInput();
        sendPing();
      });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.type === 'welcome') {
          playerIdRef.current = message.playerId;
          connectionTokenRef.current = message.connectionToken ?? null;
          setPlayerId(message.playerId);
          if (message.account) {
            setAccount(message.account);
            setName(message.account.username);
            localStorage.setItem('dnl-name', message.account.username);
          }
        }
        if (message.type === 'snapshot') {
          const arrival = performance.now();
          const decoded = unpackSnapshot(message);
          const network = networkStatsRef.current;
          network.decodeDurations.push(performance.now() - arrival);
          if (network.lastArrival !== null)
            network.intervals.push(arrival - network.lastArrival);
          if (network.lastSequence !== null) {
            if (message.sequence <= network.lastSequence)
              network.staleSnapshots += 1;
            else if (message.sequence > network.lastSequence + 1)
              network.droppedSnapshots +=
                message.sequence - network.lastSequence - 1;
          }
          network.lastArrival = arrival;
          network.lastSequence = Math.max(
            network.lastSequence ?? message.sequence,
            message.sequence,
          );
          if (
            arrival - network.lastReportAt >= 2_000 &&
            network.intervals.length > 1 &&
            socket.readyState === WebSocket.OPEN
          ) {
            const intervalMean =
              network.intervals.reduce((total, value) => total + value, 0) /
              network.intervals.length;
            const intervalVariance =
              network.intervals.reduce(
                (total, value) => total + (value - intervalMean) ** 2,
                0,
              ) / network.intervals.length;
            const decodeMean =
              network.decodeDurations.reduce(
                (total, value) => total + value,
                0,
              ) / network.decodeDurations.length;
            socket.send(
              JSON.stringify({
                type: 'network-stats',
                snapshotIntervalMs: intervalMean,
                snapshotJitterMs: Math.sqrt(intervalVariance),
                snapshotDecodeMs: decodeMean,
                droppedSnapshots: network.droppedSnapshots,
                staleSnapshots: network.staleSnapshots,
              }),
            );
            network.intervals = [];
            network.decodeDurations = [];
            network.droppedSnapshots = 0;
            network.staleSnapshots = 0;
            network.lastReportAt = arrival;
          }
          playGameEvents(decoded.events ?? []);
          snapshotRef.current = decoded;
          setSnapshot(decoded);
          setSelectedLevel(decoded.levelId);
        }
        if (message.type === 'pong' && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'latency',
              pingMs: Math.max(0, Date.now() - message.sentAt),
            }),
          );
        }
      });
      socket.addEventListener('close', () => {
        if (socketRef.current !== socket) return;
        setStatus('offline');
        reconnectRef.current = window.setTimeout(
          () => reconnectFunctionRef.current(safeRoom, safeName),
          1400,
        );
      });
      socket.addEventListener('error', () => setStatus('offline'));
    },
    [disconnect, musicEnabled, playGameEvents, sendInput, sendPing],
  );

  useEffect(() => {
    reconnectFunctionRef.current = (nextRoom, nextName) =>
      connect(nextRoom, nextName, true);
  }, [connect]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (devConnectedRef.current) return;
      const params = new URLSearchParams(window.location.search);
      if (params.get('dev') !== 'true') return;
      devConnectedRef.current = true;
      const devRoom = (params.get('room') || 'DEV').toUpperCase();
      const devName = localStorage.getItem('dnl-name') || 'Dev Noodle';
      connect(devRoom, devName);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [connect]);

  useEffect(() => () => disconnect(), [disconnect]);

  useEffect(() => {
    if (!joined) return;
    const timer = window.setInterval(sendPing, 2_000);
    return () => window.clearInterval(timer);
  }, [joined, sendPing]);

  useEffect(() => {
    if (!joined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [joined]);

  useEffect(() => {
    if (!joined) return;
    const keys = new Set<string>();
    const mapInput = () => {
      inputRef.current = {
        left: keys.has('ArrowLeft') || keys.has('KeyA'),
        right: keys.has('ArrowRight') || keys.has('KeyD'),
        jump: keys.has('ArrowDown') || keys.has('KeyS'),
        power: keys.has('ArrowUp') || keys.has('KeyW'),
      };
      sendInput();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowDown',
          'ArrowUp',
          'KeyA',
          'KeyD',
          'KeyS',
          'KeyW',
        ].includes(event.code)
      )
        return;
      event.preventDefault();
      if (!keys.has(event.code)) {
        keys.add(event.code);
        mapInput();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!keys.delete(event.code)) return;
      event.preventDefault();
      mapInput();
    };
    const clear = () => {
      keys.clear();
      mapInput();
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
    };
  }, [joined, sendInput]);

  useEffect(() => {
    let animation = 0;
    const frame = (clock: number) => {
      if (canvasRef.current)
        drawArena(
          canvasRef.current,
          snapshotRef.current,
          playerId,
          clock,
          assetPalette,
        );
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [assetPalette, playerId]);

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  };

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (musicEnabled) {
      audio?.pause();
    } else {
      void audio?.play().catch(() => undefined);
    }
    const nextEnabled = !musicEnabled;
    localStorage.setItem('dnl-music-muted', String(!nextEnabled));
    setMusicEnabled(nextEnabled);
  };

  const playThemeOnRepeat = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = true;
    if (audio.volume === 0) {
      audio.volume = 0.38;
      localStorage.setItem('dnl-music-volume', '0.38');
      setMusicVolume(0.38);
    }
    localStorage.setItem('dnl-music-muted', 'false');
    setMusicEnabled(true);
    void audio.play().catch(() => undefined);
  };

  const toggleSfx = () => {
    const nextEnabled = !sfxEnabled;
    sfxEnabledRef.current = nextEnabled;
    localStorage.setItem('dnl-sfx-muted', String(!nextEnabled));
    setSfxEnabled(nextEnabled);
    if (nextEnabled) unlockSfx();
    else stopSfx(sfxPoolRef.current);
  };

  const changeMusicVolume = (value: number) => {
    const next = Math.min(1, Math.max(0, value));
    if (audioRef.current) audioRef.current.volume = next;
    localStorage.setItem('dnl-music-volume', String(next));
    setMusicVolume(next);
  };

  const changeSfxVolume = (value: number) => {
    const next = Math.min(1, Math.max(0, value));
    sfxVolumeRef.current = next;
    localStorage.setItem('dnl-sfx-volume', String(next));
    setSfxVolume(next);
  };

  const changeAssetPalette = (value: string | null) => {
    if (value !== 'classic' && value !== 'handmade') return;
    localStorage.setItem('dnl-asset-palette', value);
    setAssetPalette(value);
  };

  const openAccountDialog = () => {
    setAccountMode('register');
    setAccountUsername(account?.username ?? name);
    setAccountPassword('');
    setAccountPasswordConfirm('');
    setAccountError(null);
    setAccountDialogOpen(true);
  };

  const submitAccount = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      accountMode === 'register' &&
      accountPassword !== accountPasswordConfirm
    ) {
      setAccountError('Passwords do not match.');
      return;
    }
    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = await fetch(`/api/account/${accountMode}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: accountUsername,
          password: accountPassword,
          connectionToken: connectionTokenRef.current,
        }),
      });
      const result = (await response.json()) as AccountResponse;
      if (!response.ok || !result.ok) {
        setAccountError(
          result.ok
            ? 'The account service could not complete that request.'
            : result.error ||
                'The account service could not complete that request.',
        );
        return;
      }
      setAccount(result.account);
      setName(result.account.username);
      localStorage.setItem('dnl-name', result.account.username);
      setAccountPassword('');
      setAccountPasswordConfirm('');
      setAccountDialogOpen(false);
    } catch {
      setAccountError('Could not reach the account service. Try again.');
    } finally {
      setAccountBusy(false);
    }
  };

  const logoutAccount = async () => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = await fetch('/api/account/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          connectionToken: connectionTokenRef.current,
        }),
      });
      if (!response.ok) throw new Error('logout failed');
      const guestName = `${(account?.username ?? name).slice(0, 10)} Guest`;
      setAccount(null);
      setName(guestName);
      localStorage.setItem('dnl-name', guestName);
      setAccountDialogOpen(false);
    } catch {
      setAccountError('Could not log out. Try again.');
    } finally {
      setAccountBusy(false);
    }
  };

  const sendControl = (message: object) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  };

  const localHeads = snapshot?.snakes.filter(
    (snake) => snake.ownerId === playerId,
  );
  const localPlayer =
    localHeads?.find((snake) => snake.alive && snake.powerUp) ??
    localHeads?.find((snake) => snake.alive) ??
    localHeads?.find((snake) => snake.id === playerId);
  const scoreboard = snapshot?.snakes.filter(
    (snake) => snake.id === snake.ownerId,
  );
  const localRoomPlayer = snapshot?.players.find(
    (player) => player.id === playerId,
  );
  const isHost = snapshot?.hostId === playerId;
  const minimumPlayers = snapshot?.mode === 'survival' ? 2 : 1;
  const canStart = Boolean(
    snapshot &&
    snapshot.players.length >= minimumPlayers &&
    snapshot.players.every((player) => player.ready),
  );
  const phaseSeconds = Math.max(
    0,
    Math.ceil(((snapshot?.phaseEndsAt ?? now) - now) / 1000),
  );
  const roundWinner = snapshot?.players.find(
    (player) => player.id === snapshot.roundWinnerId,
  );
  const matchWinner = snapshot?.players.find(
    (player) => player.id === snapshot.matchWinnerId,
  );

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="eyebrow">MULTIPLAYER SNAKE COMBAT</p>
            <h1>Danger Noodle League</h1>
          </div>
        </div>
        <div className="header-actions">
          <Button
            variant="outline"
            size="icon"
            className="audio-button"
            onClick={toggleMusic}
            aria-label={musicEnabled ? 'Mute soundtrack' : 'Play soundtrack'}
            title={musicEnabled ? 'Mute soundtrack' : 'Play soundtrack'}
          >
            {musicEnabled ? <Music2 /> : <VolumeX />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="audio-button"
            onClick={toggleSfx}
            aria-label={
              sfxEnabled ? 'Mute sound effects' : 'Play sound effects'
            }
            title={sfxEnabled ? 'Mute sound effects' : 'Play sound effects'}
          >
            {sfxEnabled ? <Volume1 /> : <VolumeX />}
          </Button>
          <Popover>
            <PopoverTrigger
              className="audio-settings-trigger"
              aria-label="Audio and visual settings"
              title="Audio and visual settings"
            >
              <Settings2 />
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="audio-settings-panel"
            >
              <div>
                <label htmlFor="music-volume">Music</label>
                <output>{Math.round(musicVolume * 100)}%</output>
              </div>
              <Slider
                id="music-volume"
                value={[musicVolume * 100]}
                onValueChange={(value) =>
                  changeMusicVolume(sliderValue(value) / 100)
                }
              />
              <div>
                <label htmlFor="sfx-volume">Sound effects</label>
                <output>{Math.round(sfxVolume * 100)}%</output>
              </div>
              <Slider
                id="sfx-volume"
                value={[sfxVolume * 100]}
                onValueChange={(value) =>
                  changeSfxVolume(sliderValue(value) / 100)
                }
              />
              <div className="asset-palette-heading">
                <label htmlFor="asset-palette">Art &amp; sound</label>
                <output>{assetPalette}</output>
              </div>
              <Select value={assetPalette} onValueChange={changeAssetPalette}>
                <SelectTrigger id="asset-palette">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">Classic</SelectItem>
                  <SelectItem value="handmade">Handmade</SelectItem>
                </SelectContent>
              </Select>
              <p className="asset-palette-note">
                Missing handmade files fall back to Classic.
              </p>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            className={`account-button ${account ? 'is-saved' : ''}`}
            onClick={openAccountDialog}
          >
            {account ? <UserRoundCheck /> : <UserRound />}
            <span>{account ? account.username : 'SAVE NOODLE'}</span>
          </Button>
          <Badge variant="outline" className={`status-pill status-${status}`}>
            <Radio data-icon="inline-start" />{' '}
            {status === 'connected' ? 'LIVE' : status.toUpperCase()}
          </Badge>
          {snapshot?.devMode && (
            <Badge variant="outline" className="status-pill dev-pill">
              DEV · VOID · ALL POWERS
            </Badge>
          )}
          {joined && (
            <Button
              variant="outline"
              className="room-button"
              onClick={copyInvite}
              aria-label="Copy room invite link"
            >
              <span>
                ROOM <strong>{room}</strong>
              </span>
              <Copy data-icon="inline-end" />
              {copied && <span className="copy-toast">COPIED</span>}
            </Button>
          )}
        </div>
      </header>

      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="account-dialog">
          <DialogHeader>
            <DialogTitle>
              {account ? 'Saved noodle' : 'Save your noodle'}
            </DialogTitle>
            <DialogDescription>
              {account
                ? 'This username is protected and will be restored when you sign in again.'
                : 'Accounts are optional. Anonymous quickplay and Survival still work exactly as before.'}
            </DialogDescription>
          </DialogHeader>

          {account ? (
            <div>
              <div className="account-summary">
                <UserRoundCheck />
                <div>
                  <small>SIGNED IN AS</small>
                  <strong>{account.username}</strong>
                  <span>
                    Saved since{' '}
                    {new Date(account.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="commendation-cabinet">
                <small>LIFETIME COMMENDATIONS</small>
                <div>
                  {COMMENDATION_IDS.map((id) => (
                    <abbr key={id} title={COMMENDATIONS[id].description}>
                      <b>{COMMENDATIONS[id].mark}</b>
                      <span>{COMMENDATIONS[id].label}</span>
                      <em>
                        ×
                        {localRoomPlayer?.commendations[id] ??
                          account.commendations[id] ??
                          0}
                      </em>
                    </abbr>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <form className="account-form" onSubmit={submitAccount}>
              <Tabs
                value={accountMode}
                onValueChange={(value) => {
                  if (value !== 'register' && value !== 'login') return;
                  setAccountMode(value);
                  setAccountPassword('');
                  setAccountPasswordConfirm('');
                  setAccountError(null);
                }}
              >
                <TabsList className="account-tabs">
                  <TabsTrigger value="register">Create account</TabsTrigger>
                  <TabsTrigger value="login">Log in</TabsTrigger>
                </TabsList>
                <TabsContent value="register" className="account-tab-copy">
                  Convert this noodle into a saved account without leaving the
                  room. Current score and commendation totals stay in place.
                </TabsContent>
                <TabsContent value="login" className="account-tab-copy">
                  Restore a saved username. If you are already playing, your
                  current noodle changes over without leaving the room.
                </TabsContent>
              </Tabs>

              <label htmlFor="account-username">Username</label>
              <Input
                id="account-username"
                value={accountUsername}
                minLength={3}
                maxLength={16}
                pattern="[A-Za-z0-9 _-]{3,16}"
                autoComplete="username"
                required
                onChange={(event) => setAccountUsername(event.target.value)}
              />
              <label htmlFor="account-password">Password</label>
              <Input
                id="account-password"
                type="password"
                value={accountPassword}
                minLength={8}
                maxLength={128}
                autoComplete={
                  accountMode === 'register'
                    ? 'new-password'
                    : 'current-password'
                }
                required
                onChange={(event) => setAccountPassword(event.target.value)}
              />
              <small className="account-password-hint">
                8 characters minimum. Passwords are stored as salted hashes.
              </small>
              {accountMode === 'register' && (
                <>
                  <label htmlFor="account-password-confirm">
                    Confirm password
                  </label>
                  <Input
                    id="account-password-confirm"
                    type="password"
                    value={accountPasswordConfirm}
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    required
                    onChange={(event) =>
                      setAccountPasswordConfirm(event.target.value)
                    }
                  />
                </>
              )}
              {accountError && <p className="account-error">{accountError}</p>}
              <Button type="submit" disabled={accountBusy}>
                {accountMode === 'register' ? <UserRoundCheck /> : <LogIn />}
                {accountBusy
                  ? 'WORKING…'
                  : accountMode === 'register'
                    ? 'SAVE NOODLE'
                    : 'LOG IN'}
              </Button>
            </form>
          )}

          {account && (
            <DialogFooter className="account-footer">
              {accountError && <p className="account-error">{accountError}</p>}
              <Button
                variant="outline"
                disabled={accountBusy}
                onClick={logoutAccount}
              >
                <LogOut /> {accountBusy ? 'WORKING…' : 'LOG OUT'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <section className="arena-frame" aria-label="Danger Noodle game arena">
        <canvas ref={canvasRef} className="game-canvas" />

        {!joined && (
          <div className="lobby-card">
            <p className="lobby-kicker">WELCOME TO THE PIT</p>
            <h2>
              Eat dots. Get longer.
              <br />
              Don’t eat yourself.
            </h2>
            <p className="lobby-copy">
              Create a room, copy the invite, and open it in another browser to
              add a rival.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                connect(room, name);
              }}
            >
              <label htmlFor="player-name">Noodle name</label>
              <Input
                id="player-name"
                value={name}
                maxLength={16}
                readOnly={Boolean(account)}
                onChange={(event) => setName(event.target.value)}
                autoComplete="nickname"
              />
              <label htmlFor="room-code">Room code</label>
              <div className="room-input-row">
                <Input
                  id="room-code"
                  value={room}
                  maxLength={8}
                  onChange={(event) =>
                    setRoom(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, ''),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  onClick={() => setRoom(makeRoomCode())}
                  aria-label="Generate another room code"
                >
                  <RotateCcw />
                </Button>
              </div>
              <label htmlFor="level-select">Level</label>
              <div className="level-picker-row">
                <div
                  className="level-preview"
                  aria-hidden="true"
                  style={{
                    backgroundImage: `url(${levelPreviewPath(selectedLevel, 'small', assetPalette)})`,
                  }}
                />
                <Select
                  value={selectedLevel}
                  onValueChange={(value) => {
                    if (!value) return;
                    setSelectedLevel(value);
                    const url = new URL(window.location.href);
                    url.searchParams.set('level', value);
                    window.history.replaceState({}, '', url);
                  }}
                >
                  <SelectTrigger
                    id="level-select"
                    aria-label="Select arena level"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.filter((level) => level.selectable).map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {level.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" size="lg" className="enter-button">
                ENTER ARENA <ArrowRight />
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              className="theme-repeat-button"
              onClick={playThemeOnRepeat}
            >
              Play the theme song on repeat thanks
            </Button>
          </div>
        )}

        {joined && snapshot?.phase === 'lobby' && (
          <div className="match-lobby">
            <div className="match-lobby-heading">
              <div>
                <p className="lobby-kicker">ROOM {snapshot.room}</p>
                <h2>Choose your chaos.</h2>
                <p>
                  {snapshot.mode === 'survival'
                    ? 'Last noodle alive wins the round. First to the match target takes the league.'
                    : 'Endless drop-in mayhem with fast automatic respawns.'}
                </p>
              </div>
              <Button variant="outline" onClick={copyInvite}>
                <Copy /> {copied ? 'COPIED' : 'COPY INVITE'}
              </Button>
            </div>

            <div className="match-lobby-grid">
              <section className="room-roster" aria-label="Room players">
                <div className="panel-label">
                  <Users /> PLAYERS · {snapshot.players.length}/8
                </div>
                <div className="roster-list">
                  {snapshot.players.map((player) => (
                    <div
                      key={player.id}
                      className={player.ready ? 'ready' : ''}
                    >
                      <span
                        className="roster-color"
                        style={{ background: `hsl(${player.color} 90% 65%)` }}
                      />
                      <div className="roster-identity">
                        <div className="roster-name-line">
                          <strong>{player.name}</strong>
                          {player.saved && (
                            <small className="saved-player-chip">
                              <UserRoundCheck /> SAVED
                            </small>
                          )}
                        </div>
                        <CommendationRow counts={player.commendations} />
                      </div>
                      {player.id === snapshot.hostId && (
                        <small className="host-chip">
                          <Crown /> HOST
                        </small>
                      )}
                      <em>
                        {player.ready ? (
                          <>
                            <Check /> READY
                          </>
                        ) : (
                          'NOT READY'
                        )}
                      </em>
                    </div>
                  ))}
                </div>
              </section>

              <section className="room-settings" aria-label="Match settings">
                <div className="panel-label">
                  <Swords /> MATCH SETUP
                </div>
                <label htmlFor="room-mode">Mode</label>
                <Select
                  value={snapshot.mode}
                  disabled={!isHost}
                  onValueChange={(value) =>
                    value && sendControl({ type: 'configure', mode: value })
                  }
                >
                  <SelectTrigger id="room-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="survival">Survival</SelectItem>
                    <SelectItem value="quickplay">Quickplay</SelectItem>
                  </SelectContent>
                </Select>

                <label htmlFor="room-level">Arena</label>
                <div className="level-picker-row">
                  <div
                    className="level-preview"
                    aria-hidden="true"
                    style={{
                      backgroundImage: `url(${levelPreviewPath(snapshot.levelId, 'small', assetPalette)})`,
                    }}
                  />
                  <Select
                    value={snapshot.levelId}
                    disabled={!isHost}
                    onValueChange={(value) => {
                      if (!value) return;
                      const url = new URL(window.location.href);
                      url.searchParams.set('level', value);
                      window.history.replaceState({}, '', url);
                      sendControl({ type: 'configure', levelId: value });
                    }}
                  >
                    <SelectTrigger id="room-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.filter((level) => level.selectable).map(
                        (level) => (
                          <SelectItem key={level.id} value={level.id}>
                            {level.displayName}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {snapshot.mode === 'survival' && (
                  <>
                    <label htmlFor="wins-target">Match target</label>
                    <Select
                      value={String(snapshot.winsToMatch)}
                      disabled={!isHost}
                      onValueChange={(value) =>
                        value &&
                        sendControl({
                          type: 'configure',
                          winsToMatch: Number(value),
                        })
                      }
                    >
                      <SelectTrigger id="wins-target">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 3, 5, 10].map((target) => (
                          <SelectItem key={target} value={String(target)}>
                            First to {target}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </section>
            </div>

            <div className="lobby-actions">
              <Button
                variant={localRoomPlayer?.ready ? 'outline' : 'default'}
                onClick={() =>
                  sendControl({
                    type: 'ready',
                    ready: !localRoomPlayer?.ready,
                  })
                }
              >
                {localRoomPlayer?.ready ? 'NOT READY' : 'READY UP'}
              </Button>
              {isHost && (
                <Button
                  className="start-match-button"
                  disabled={!canStart}
                  onClick={() => sendControl({ type: 'start-match' })}
                >
                  START {snapshot.mode === 'survival' ? 'MATCH' : 'QUICKPLAY'}
                  <ArrowRight />
                </Button>
              )}
              {!isHost && <p>Waiting for the host to start the match.</p>}
              {isHost && !canStart && (
                <p>
                  {snapshot.players.length < minimumPlayers
                    ? `Survival needs at least ${minimumPlayers} players.`
                    : 'Everyone must be ready.'}
                </p>
              )}
            </div>
          </div>
        )}

        {joined && snapshot && snapshot.phase !== 'lobby' && (
          <div className="arena-hud">
            <div className="player-count">
              <Users /> {snapshot.players.length} ONLINE ·{' '}
              {snapshot.mode.toUpperCase()}
            </div>
            <div className="score-strip">
              {[...(scoreboard ?? [])]
                .sort((a, b) => b.dots - a.dots)
                .map((snake) => (
                  <div
                    key={snake.id}
                    className={snake.ownerId === playerId ? 'is-you' : ''}
                  >
                    <span
                      style={{ backgroundColor: `hsl(${snake.color} 90% 65%)` }}
                    />
                    <div className="score-player">
                      <strong>{snake.name}</strong>
                      {(() => {
                        const commendations =
                          snapshot.players.find(
                            (player) => player.id === snake.ownerId,
                          )?.commendations ?? {};
                        const total = Object.values(commendations).reduce(
                          (sum, count) => sum + (count ?? 0),
                          0,
                        );
                        if (total === 0) return null;
                        return (
                          <small
                            className="score-commendations"
                            title={earnedCommendations(commendations)
                              .map(
                                (id) =>
                                  `${COMMENDATIONS[id].label} ×${commendations[id]}`,
                              )
                              .join(', ')}
                          >
                            ★{total}
                          </small>
                        );
                      })()}
                    </div>
                    <small className="player-ping">
                      {snake.pingMs === null ? '—' : snake.pingMs}ms
                    </small>
                    <em>{snake.dots}</em>
                    {snapshot.mode === 'survival' && (
                      <b>
                        {snapshot.players.find(
                          (player) => player.id === snake.ownerId,
                        )?.wins ?? 0}
                        /{snapshot.winsToMatch}
                      </b>
                    )}
                  </div>
                ))}
            </div>
            {isHost && snapshot.phase === 'playing' && (
              <Button
                variant="outline"
                size="sm"
                className="return-lobby-button"
                onClick={() => sendControl({ type: 'return-to-lobby' })}
              >
                RETURN TO LOBBY
              </Button>
            )}
          </div>
        )}

        {snapshot?.phase === 'countdown' && (
          <div className="phase-overlay countdown-overlay">
            <small>ROUND {snapshot.roundNumber}</small>
            <strong>{phaseSeconds || 'GO'}</strong>
            <span>{getLevel(snapshot.levelId).displayName}</span>
          </div>
        )}

        {(snapshot?.phase === 'round-over' ||
          snapshot?.phase === 'intermission') && (
          <div className="phase-overlay result-overlay">
            <Trophy />
            <small>ROUND {snapshot.roundNumber}</small>
            <strong>{roundWinner ? `${roundWinner.name} WINS` : 'DRAW'}</strong>
            <RoundCommendations snapshot={snapshot} />
            <span>Next round in {phaseSeconds}</span>
          </div>
        )}

        {snapshot?.phase === 'match-over' && (
          <div className="phase-overlay match-over-overlay">
            <Trophy />
            <small>MATCH COMPLETE</small>
            <strong>{matchWinner?.name ?? 'NOODLE'} TAKES THE LEAGUE</strong>
            <RoundCommendations snapshot={snapshot} />
            {isHost ? (
              <div className="match-actions">
                <Button onClick={() => sendControl({ type: 'rematch' })}>
                  REMATCH
                </Button>
                <Button
                  variant="outline"
                  onClick={() => sendControl({ type: 'return-to-lobby' })}
                >
                  CHANGE SETTINGS
                </Button>
              </div>
            ) : (
              <span>Waiting for the host.</span>
            )}
          </div>
        )}

        {joined &&
          snapshot?.phase === 'playing' &&
          localPlayer &&
          !localPlayer.alive && (
            <div className="respawn-banner">
              {localRoomPlayer?.spectator
                ? 'SPECTATING · JOINING NEXT ROUND'
                : snapshot.mode === 'quickplay'
                  ? 'KNOTTED. REFORMING…'
                  : 'ELIMINATED · WATCH THE ROUND'}
            </div>
          )}
        {joined && status === 'offline' && (
          <div className="offline-banner">
            MULTIPLAYER SERVER LOST — RECONNECTING
          </div>
        )}
        <div className="edge-fade edge-fade-left" />
        <div className="edge-fade edge-fade-right" />
      </section>

      <footer className="control-deck">
        <div className="control-group">
          <span className="control-label">STEER</span>
          <div>
            <Kbd>
              <ArrowLeft />
            </Kbd>
            <Kbd>
              <ArrowRight />
            </Kbd>
          </div>
        </div>
        <div className="control-divider" />
        <div className="control-group">
          <span className="control-label">JUMP</span>
          <Kbd>
            <ArrowDown />
          </Kbd>
        </div>
        <div className="control-divider" />
        <div
          className={`control-group ${localPlayer?.powerUp ? 'control-ready' : 'control-muted'}`}
        >
          <span className="control-label">POWER-UP</span>
          <div className="power-control-status">
            <Kbd>
              <ArrowUp />
            </Kbd>
            {localPlayer?.powerUp ? (
              <span
                className="held-power-chip"
                style={{
                  borderColor: POWER_UP_APPEARANCE[localPlayer.powerUp].color,
                  boxShadow: `0 0 16px ${POWER_UP_APPEARANCE[localPlayer.powerUp].color}35`,
                }}
              >
                <b
                  style={{
                    color: POWER_UP_APPEARANCE[localPlayer.powerUp].color,
                  }}
                >
                  {POWER_UP_APPEARANCE[localPlayer.powerUp].icon}
                </b>
                <span>
                  <small>READY</small>
                  <strong>{powerUpName(localPlayer.powerUp)}</strong>
                </span>
              </span>
            ) : (
              <span className="empty-power">EMPTY</span>
            )}
          </div>
        </div>
        <p className="build-note">
          {snapshot
            ? getLevel(snapshot.levelId).displayName.toUpperCase()
            : 'VOID'}{' '}
          · WRAPAROUND ·{' '}
          {localPlayer
            ? `${localPlayer.dots} DOT${localPlayer.dots === 1 ? '' : 'S'}`
            : 'ROOM-BASED MULTIPLAYER'}
        </p>
      </footer>
    </main>
  );
}
