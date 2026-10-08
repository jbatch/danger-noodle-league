import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AUDIO_ASSETS,
  audioAssetPath,
  levelPreviewPath,
  TILE_ASSETS,
  tileAssetPath,
} from '../shared/assets.ts';
import { LEVELS } from '../shared/levels.generated.ts';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));

function publicFile(url: string) {
  return path.join(publicDirectory, url.replace(/^\//, ''));
}

void test('every manifest asset has paired classic and handmade names', () => {
  for (const [id, asset] of Object.entries(AUDIO_ASSETS)) {
    assert.match(asset.classic, /-classic\.[a-z0-9]+$/i, id);
    assert.match(asset.handmade, /-handmade\.[a-z0-9]+$/i, id);
    assert.ok(existsSync(publicFile(asset.classic)), asset.classic);
  }
  for (const [id, asset] of Object.entries(TILE_ASSETS)) {
    assert.match(asset.classic, /-classic\.png$/i, id);
    assert.match(asset.handmade, /-handmade\.png$/i, id);
    assert.ok(existsSync(publicFile(asset.classic)), asset.classic);
  }
});

void test('handmade mode falls back until an asset is marked ready', () => {
  assert.equal(audioAssetPath('theme', 'handmade'), AUDIO_ASSETS.theme.classic);
  assert.equal(
    tileAssetPath('terrain', 'handmade'),
    TILE_ASSETS.terrain.classic,
  );
  assert.equal(
    levelPreviewPath('castle', 'small', 'handmade'),
    '/levels/previews/castle-small-classic.png',
  );
});

void test('selectable level previews use existing classic assets', () => {
  for (const level of LEVELS.filter((candidate) => candidate.selectable)) {
    for (const size of ['small', 'medium'] as const) {
      const expected = levelPreviewPath(level.id, size, 'classic');
      assert.equal(
        level[`preview${size === 'small' ? 'Small' : 'Medium'}`],
        expected,
      );
      assert.ok(existsSync(publicFile(expected)), expected);
    }
  }
});

void test('recovered audiovisual files are explicitly suffixed classic', () => {
  const directories = [
    'audio/music',
    'audio/sfx',
    'levels/previews',
    'levels/tiles',
  ];
  for (const directory of directories) {
    for (const filename of readdirSync(path.join(publicDirectory, directory)))
      assert.match(
        filename,
        /-classic\.[a-z0-9]+$/i,
        `${directory}/${filename}`,
      );
  }
});
