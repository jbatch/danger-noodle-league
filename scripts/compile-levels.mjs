import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapsDirectory = path.join(root, 'public/levels/maps');
const outputPath = path.join(root, 'shared/levels.generated.ts');
const checkOnly = process.argv.includes('--check');

const catalogue = [
  ['empty', 'Void', true],
  ['castle', 'Castle', true],
  ['skull', 'Skull', true],
  ['fireandice', 'Fire and Ice', true],
  ['urban', 'Urban', true],
  ['crosshairs', 'Crosshairs', true],
  ['noveria', 'Noveria', true],
  ['sprint2', 'Sprint 2', true],
  ['corners', 'Corners', true],
  ['icefortress', 'Ice Fortress', true],
  ['sunshine', 'Sunshine', true],
  ['jungle', 'Jungle', true],
  ['bullethell', 'Bullet Hell', true],
  ['starfield', 'Starfield', false],
];

const fixedItemKinds = [
  'egg',
  'speed-boost',
  'jumper',
  'ghost',
  'grenade',
  'fireball',
  'one-eighty',
  'shield',
  'napalm',
  'disco-ball',
];

function attributes(source) {
  return Object.fromEntries(
    [...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function scalar(value) {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const numeric = Number(value);
  return value.trim() !== '' && Number.isFinite(numeric) ? numeric : value;
}

function properties(source = '') {
  return Object.fromEntries(
    [
      ...source.matchAll(/<property\b([^>]*?)(?:\/>|>([\s\S]*?)<\/property>)/g),
    ].map((match) => {
      const attrs = attributes(match[1]);
      return [attrs.name, scalar(attrs.value ?? match[2]?.trim() ?? '')];
    }),
  );
}

function resolveTileset(gid, tilesets) {
  if (!gid) return null;
  const tileset = [...tilesets]
    .reverse()
    .find((candidate) => gid >= candidate.firstgid);
  assert.ok(tileset, `No tileset owns gid ${gid}`);
  const frame = gid - tileset.firstgid;
  assert.ok(frame >= 0 && frame < tileset.tilecount, `Invalid gid ${gid}`);
  return { name: tileset.name, frame };
}

function extractObjectGroup(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const selfClosing = new RegExp(
    `<objectgroup\\b[^>]*\\bname="${escaped}"[^>]*\\/>`,
  );
  if (selfClosing.test(xml)) return '';
  const match = xml.match(
    new RegExp(
      `<objectgroup\\b[^>]*\\bname="${escaped}"[^>]*>([\\s\\S]*?)<\\/objectgroup>`,
    ),
  );
  return match?.[1] ?? '';
}

function objects(xml, groupName, tilesets) {
  const body = extractObjectGroup(xml, groupName);
  return [
    ...body.matchAll(/<object\s([^>]*?)(?:\/>|>([\s\S]*?)<\/object>)/g),
  ].map((match) => {
    const attrs = attributes(match[1]);
    const gid = Number(attrs.gid || 0);
    const tile = resolveTileset(gid, tilesets);
    return {
      id: Number(attrs.id),
      name: attrs.name || '',
      type: attrs.type || '',
      x: Number(attrs.x || 0),
      y: Number(attrs.y || 0),
      width: Number(attrs.width || 0),
      height: Number(attrs.height || 0),
      rotation: Number(attrs.rotation || 0),
      tileset: tile?.name ?? null,
      frame: tile?.frame ?? null,
      properties: properties(match[2]),
    };
  });
}

function layer(xml, name, tilesets, mapWidth) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(
    new RegExp(
      `<layer\\b[^>]*\\bname="${escaped}"[^>]*>[\\s\\S]*?<data[^>]*>([\\s\\S]*?)<\\/data>[\\s\\S]*?<\\/layer>`,
    ),
  );
  if (!match) return [];
  return [...match[1].matchAll(/<tile\b[^>]*\bgid="(\d+)"[^>]*\/>/g)]
    .map((tile, index) => ({ gid: Number(tile[1]), index }))
    .filter(({ gid }) => gid !== 0)
    .map(({ gid, index }, id) => {
      const resolved = resolveTileset(gid, tilesets);
      assert.ok(resolved, `${name} tile ${id} has no tileset`);
      return {
        id,
        x: (index % mapWidth) * 32,
        y: Math.floor(index / mapWidth) * 32,
        frame: resolved.frame,
      };
    });
}

function compileLevel(id, displayName, selectable, xml) {
  const mapMatch = xml.match(/<map\b([^>]*)>/);
  assert.ok(mapMatch, `${id} has no map element`);
  const map = attributes(mapMatch[1]);
  const width = Number(map.width);
  const height = Number(map.height);
  const tileWidth = Number(map.tilewidth);
  const tileHeight = Number(map.tileheight);
  assert.deepEqual(
    { width, height, tileWidth, tileHeight },
    { width: 40, height: 21, tileWidth: 32, tileHeight: 32 },
    `${id} must retain the original arena dimensions`,
  );

  const firstTileset = xml.indexOf('<tileset');
  const mapProperties = properties(xml.slice(0, firstTileset));
  const tilesets = [...xml.matchAll(/<tileset\b([^>]*)>/g)].map((match) => {
    const attrs = attributes(match[1]);
    return {
      firstgid: Number(attrs.firstgid),
      name: attrs.name === 'wallTileSheet' ? 'Walls' : attrs.name,
      tilecount: Number(attrs.tilecount),
    };
  });
  tilesets.sort((a, b) => a.firstgid - b.firstgid);

  const playerSpawns = objects(xml, 'PlayerSpawns', tilesets)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((object) => ({
      x: object.x + 16,
      y: object.y + 16,
      angle:
        (Number(object.properties.rotation ?? object.rotation ?? 0) * Math.PI) /
        180,
      ...(object.properties.speed === undefined
        ? {}
        : { speed: Number(object.properties.speed) }),
      ...(object.properties.tailLength === undefined
        ? {}
        : { tailLength: Number(object.properties.tailLength) }),
    }));
  assert.equal(playerSpawns.length, 8, `${id} must define eight player spawns`);

  const powerUpSpawns = objects(xml, 'PowerUpSpawns', tilesets).map(
    (object) => ({
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
    }),
  );

  const fixedItems = objects(xml, 'PowerUps', tilesets).map((object) => {
    assert.equal(
      object.tileset,
      'PowerUps',
      `${id} fixed item uses wrong tileset`,
    );
    const kind = fixedItemKinds[object.frame];
    assert.ok(kind, `${id} has unknown fixed item frame ${object.frame}`);
    return {
      x: object.x + 16,
      y: object.y - 16,
      kind,
      lifespan:
        object.properties.lifespan === undefined
          ? null
          : Number(object.properties.lifespan),
    };
  });

  function compiledObjects(groupName) {
    return objects(xml, groupName, tilesets).map((object) => ({
      id: object.id,
      x: object.tileset ? object.x + 16 : object.x,
      y: object.tileset ? object.y - 16 : object.y,
      width: object.width,
      height: object.height,
      rotation: Number(object.properties.rotation ?? object.rotation ?? 0),
      frame: object.frame,
      properties: object.properties,
    }));
  }

  return {
    id,
    displayName,
    source: `/levels/maps/${id}.tmx`,
    previewSmall: `/levels/previews/${id}-small-classic.png`,
    previewMedium: `/levels/previews/${id}-medium-classic.png`,
    selectable,
    width: width * tileWidth,
    height: height * tileHeight,
    tileWidth,
    tileHeight,
    maxEggs: Number(mapProperties.MaxEggs ?? 4),
    powerUpSpawnFrequency: Number(mapProperties.PowerUpSpawnFrequency ?? 8),
    singlePlayer: Boolean(mapProperties.SinglePlayer ?? false),
    walls: layer(xml, 'Walls', tilesets, width),
    terrain: layer(xml, 'Terrain', tilesets, width),
    overlays: layer(xml, 'Overlay', tilesets, width),
    playerSpawns,
    powerUpSpawns,
    fixedItems,
    features: compiledObjects('Features'),
    movingWalls: compiledObjects('WallObjects'),
    droneSpawns: compiledObjects('DroneSpawns'),
  };
}

const sourceFiles = new Set(
  (await readdir(mapsDirectory))
    .filter((file) => file.endsWith('.tmx'))
    .map((file) => path.basename(file, '.tmx')),
);
assert.deepEqual(
  [...sourceFiles].sort((a, b) => a.localeCompare(b)),
  catalogue.map(([id]) => id).sort((a, b) => a.localeCompare(b)),
  'The level catalogue and TMX directory must match exactly',
);

const levels = [];
for (const [id, displayName, selectable] of catalogue) {
  const xml = await readFile(path.join(mapsDirectory, `${id}.tmx`), 'utf8');
  levels.push(compileLevel(id, displayName, selectable, xml));
}

const output = `// Generated by scripts/compile-levels.mjs. Do not edit by hand.\nimport type { CompiledLevel } from './levels.ts';\n\nexport const LEVELS = ${JSON.stringify(levels, null, 2)} as const satisfies readonly CompiledLevel[];\n\nexport const DEFAULT_LEVEL_ID = 'empty';\n\nexport function getLevel(levelId: string | null | undefined): CompiledLevel {\n  return LEVELS.find((level) => level.id === levelId) ?? LEVELS[0];\n}\n`;

if (checkOnly) {
  const existing = await readFile(outputPath, 'utf8').catch(() => '');
  assert.equal(
    existing,
    output,
    'Generated level catalogue is stale; run npm run levels',
  );
} else {
  await writeFile(outputPath, output);
  console.log(
    `Compiled ${levels.length} TMX levels to shared/levels.generated.ts`,
  );
}
