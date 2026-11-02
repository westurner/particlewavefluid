import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveParameterDescription } from './parameter-schema-description.js';

const schema = {
  properties: {
    waves: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          wavelength: { type: 'number', title: 'Waves Wavelength', description: 'Sets wave wavelength.' }
        }
      }
    },
    detector: {
      type: 'object',
      properties: {
        wavelength: { type: 'number', title: 'Detector Wavelength', minimum: 0.25, maximum: 6, 'x-step': 0.05, description: 'Sets detector wavelength.' }
      }
    },
    particles: {
      type: 'object',
      properties: {
        count: { type: 'integer', title: 'Particle Count', minimum: 100, maximum: 1000, 'x-step': 10, description: 'Sets the number of simulated particles.' }
      }
    }
  }
};

test('parameter description lookup follows nested and indexed array paths', () => {
  assert.equal(resolveParameterDescription(schema, { path: 'waves[2].wavelength' }), 'Sets wave wavelength.');
});

test('parameter description lookup resolves pathless controls by label and constraints', () => {
  assert.equal(resolveParameterDescription(schema, {
    label: 'Wavelength',
    type: 'number',
    min: 0.25,
    max: 6,
    step: 0.05
  }), 'Sets detector wavelength.');
});

test('numeric controls can resolve integer-valued schema parameters', () => {
  assert.equal(resolveParameterDescription(schema, {
    label: 'Particle count',
    type: 'number',
    min: 100,
    max: 1000,
    step: 10
  }), 'Sets the number of simulated particles.');
});