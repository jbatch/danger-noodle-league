'use client';
// @refresh reset

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Radio,
  RotateCcw,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type GameSnapshot,
  type InputState,
  type PowerUpType,
  type ServerMessage,
  type SnakeSnapshot,
} from '@/shared/protocol';

type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

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

function getWebSocketUrl(room: string, name: string) {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) {
    const url = new URL(configured);
    url.searchParams.set('room', room);
    url.searchParams.set('name', name);
    return url.toString();
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`;
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
};

function drawArena(
  canvas: HTMLCanvasElement,
  snapshot: GameSnapshot | null,
  playerId: string | null,
  clock: number,
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
    const pulse = 1 + Math.sin(clock * 0.006 + powerUp.id) * 0.08;
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
    glow.addColorStop(0, 'rgba(255,250,190,.9)');
    glow.addColorStop(0.35, 'rgba(255,155,45,.7)');
    glow.addColorStop(1, 'rgba(255,66,20,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(blast.x, blast.y, radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffd84d';
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

  for (const snake of snapshot.snakes)
    drawSnake(context, snake, snake.ownerId === playerId, clock);
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

  if (snake.jump > 0.02) {
    context.save();
    context.globalAlpha = 0.28 * (1 - snake.jump * 0.35);
    context.fillStyle = '#000';
    context.beginPath();
    context.ellipse(
      head.x,
      head.y + 8,
      14 + snake.jump * 5,
      5 + snake.jump * 2,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();
  }

  context.save();
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

  context.globalAlpha = 1;
  if (snake.speedBoost > 0) {
    context.strokeStyle = 'rgba(90,242,255,.68)';
    context.lineWidth = 3;
    context.shadowBlur = 18;
    context.shadowColor = '#5af2ff';
    context.beginPath();
    context.arc(
      head.x,
      head.y,
      17 + Math.sin(clock * 0.02) * 2,
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
  context.arc(
    head.x,
    head.y,
    (isLocal ? 12.5 : 10.5) * headScale,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.shadowBlur = 0;

  context.strokeStyle = '#071018';
  context.lineWidth = 3;
  const eyeAngle = snake.angle + Math.PI / 2;
  for (const side of [-1, 1]) {
    const ex =
      head.x + Math.cos(snake.angle) * 6 + Math.cos(eyeAngle) * side * 4;
    const ey =
      head.y + Math.sin(snake.angle) * 6 + Math.sin(eyeAngle) * side * 4;
    context.beginPath();
    context.arc(ex, ey, 1.7, 0, Math.PI * 2);
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
    const iconX = head.x - Math.cos(snake.angle) * 23;
    const iconY = head.y - Math.sin(snake.angle) * 23;
    context.fillStyle = appearance.color;
    context.shadowBlur = 12;
    context.shadowColor = context.fillStyle;
    context.beginPath();
    context.arc(iconX, iconY, 5.5, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function powerUpName(powerUp: PowerUpType | null) {
  return powerUp ? POWER_UP_APPEARANCE[powerUp].name : 'EMPTY';
}

export function DangerNoodleGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const snapshotRef = useRef<GameSnapshot | null>(null);
  const inputRef = useRef<InputState>({ ...EMPTY_INPUT });
  const reconnectRef = useRef<number | null>(null);
  const reconnectFunctionRef = useRef<(room: string, name: string) => void>(
    () => undefined,
  );
  const sequenceRef = useRef(0);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionState>('idle');
  const [name, setName] = useState('Danger Noodle');
  const [room, setRoom] = useState('NOODLE');
  const [joined, setJoined] = useState(false);
  const [copied, setCopied] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);

  useEffect(() => {
    const audio = new Audio('/snakes-theme.ogg');
    audioRef.current = audio;
    audio.preload = 'auto';
    audio.volume = 0.38;
    audio.loop = true;
    const timer = window.setTimeout(() => {
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
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setRoom((params.get('room') || makeRoomCode()).toUpperCase());
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

      const socket = new WebSocket(getWebSocketUrl(safeRoom, safeName));
      socketRef.current = socket;
      socket.addEventListener('open', () => {
        setStatus('connected');
        sendInput();
        sendPing();
      });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.type === 'welcome') setPlayerId(message.playerId);
        if (message.type === 'snapshot') {
          snapshotRef.current = message;
          setSnapshot(message);
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
    [disconnect, musicEnabled, sendInput, sendPing],
  );

  useEffect(() => {
    reconnectFunctionRef.current = (nextRoom, nextName) =>
      connect(nextRoom, nextName, true);
  }, [connect]);

  useEffect(() => () => disconnect(), [disconnect]);

  useEffect(() => {
    if (!joined) return;
    const timer = window.setInterval(sendPing, 2_000);
    return () => window.clearInterval(timer);
  }, [joined, sendPing]);

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
        drawArena(canvasRef.current, snapshotRef.current, playerId, clock);
      animation = requestAnimationFrame(frame);
    };
    animation = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animation);
  }, [playerId]);

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
            <p className="eyebrow">ONLINE ARENA TEST 01</p>
            <h1>Danger Noodle League</h1>
          </div>
        </div>
        <div className="header-actions">
          <Button
            variant="outline"
            size="icon"
            className="music-button"
            onClick={toggleMusic}
            aria-label={musicEnabled ? 'Mute soundtrack' : 'Play soundtrack'}
            title={musicEnabled ? 'Mute soundtrack' : 'Play soundtrack'}
          >
            {musicEnabled ? <Volume2 /> : <VolumeX />}
          </Button>
          <Badge variant="outline" className={`status-pill status-${status}`}>
            <Radio data-icon="inline-start" />{' '}
            {status === 'connected' ? 'LIVE' : status.toUpperCase()}
          </Badge>
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
              <Button type="submit" size="lg" className="enter-button">
                ENTER ARENA <ArrowRight />
              </Button>
            </form>
          </div>
        )}

        {joined && snapshot && (
          <div className="arena-hud">
            <div className="player-count">
              <Users /> {scoreboard?.length ?? 0} ONLINE
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
                    <strong>{snake.name}</strong>
                    <small className="player-ping">
                      {snake.pingMs === null ? '—' : snake.pingMs}ms
                    </small>
                    <em>{snake.dots}</em>
                  </div>
                ))}
            </div>
          </div>
        )}

        {joined && localPlayer && !localPlayer.alive && (
          <div className="respawn-banner">KNOTTED. REFORMING…</div>
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
          <div>
            <Kbd>
              <ArrowUp />
            </Kbd>
            <span>{powerUpName(localPlayer?.powerUp ?? null)}</span>
          </div>
        </div>
        <p className="build-note">
          NO WALLS · WRAPAROUND ·{' '}
          {localPlayer
            ? `${localPlayer.dots} DOT${localPlayer.dots === 1 ? '' : 'S'}`
            : 'ROOM-BASED MULTIPLAYER'}
        </p>
      </footer>
    </main>
  );
}
