import test from 'node:test';
import assert from 'node:assert/strict';
import { Color } from 'three';
import { COLOR_PALETTES, COLOR_PALETTE_OPTIONS, sampleColorPalette } from './color-palettes.js';

test('shared color palettes include every existing detector combination', () => {
  assert.deepEqual(COLOR_PALETTES.map(({ value }) => value), ['thermal', 'phosphor', 'monochrome', 'plasma', 'black-red']);
  assert.deepEqual(COLOR_PALETTE_OPTIONS.map(({ value }) => value), ['native', 'thermal', 'phosphor', 'monochrome', 'plasma', 'black-red']);
  assert.ok(COLOR_PALETTE_OPTIONS.every(({ stops }) => Array.isArray(stops) && stops.length >= 2));
});

test('palette sampling clamps endpoints and reuses its target color', () => {
  const target = new Color();
  assert.equal(sampleColorPalette('thermal', -1, target), target);
  assert.equal(target.getHexString(), '10242d');
  sampleColorPalette('thermal', 1, target);
  assert.equal(target.getHexString(), 'fff4dc');
  sampleColorPalette('thermal', 1 / 3, target);
  assert.equal(target.getHexString(), '37c4c8');
});