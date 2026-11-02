import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CAMERA_WHEEL_MODE_OPTIONS } from './lib/simulator-base.js';
import { createParameterDefaults, createParameterMetaFromDefaults, generateJsonSchema, SUBWAY_SIMULATOR_DEFAULTS, SUBWAY_SIMULATOR_JSON_SCHEMA, SUBWAY_SIMULATOR_PARAMETER_META } from './simulatorParameterSchema.js';
import { SIMULATOR_PARAMETER_DEFAULTS, SIMULATOR_PARAMETER_PROFILES, generateSimulatorParameterSchemaRegistry } from './simulatorParameterRegistry.js';

test('SubwaySim metadata generates complete defaults and Draft 2020-12 JSON Schema', () => {
  const schema = generateJsonSchema(SUBWAY_SIMULATOR_PARAMETER_META);
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), Object.keys(SUBWAY_SIMULATOR_DEFAULTS).sort());
  assert.equal(schema.properties.surfaceTemperature.default, 81.5);
  assert.equal(schema.properties.surfaceTemperature.minimum, 60);
  assert.equal(schema.properties.surfaceTemperature.maximum, 110);
  assert.equal(schema.properties.surfaceTemperature['x-step'], 0.5);
  assert.equal('multipleOf' in schema.properties.surfaceTemperature, false);
  assert.deepEqual(schema.properties.shaftControls.default, [1, 1, 1]);
  assert.equal(schema.properties.shaftControls.items.minimum, -1);
  assert.equal(schema.properties.shaftControls.items.maximum, 1);
  assert.equal(schema.properties.particleAppearance.properties.opacity.default, 1);
});

test('every simulator default satisfies its declared type, range, enum, and array constraints', () => {
  const assertDefinition = (definition, value, path, requireStepGrid, checkDefault = true) => {
    if (definition.type === 'object') {
      assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${path} must be an object`);
      for (const requiredKey of definition.required ?? []) {
        assert.ok(Object.hasOwn(value, requiredKey), `${path}.${requiredKey} is required`);
      }
      for (const [key, nestedValue] of Object.entries(value)) {
        assert.ok(Object.hasOwn(definition.properties, key) || definition.additionalProperties !== false, `${path}.${key} is not allowed`);
        if (Object.hasOwn(definition.properties, key)) assertDefinition(definition.properties[key], nestedValue, `${path}.${key}`, requireStepGrid, checkDefault);
      }
      return;
    }
    if (value === null && definition.nullable) return;
    if (checkDefault) assert.deepEqual(value, definition.default, `${path} default differs from metadata`);

    if (definition.type === 'boolean') {
      assert.equal(typeof value, 'boolean', `${path} must be a boolean`);
      return;
    }
    if (definition.type === 'enum') {
      assert.ok(definition.values.includes(value), `${path} default is not an allowed enum value`);
      return;
    }
    if (definition.type === 'string') {
      assert.equal(typeof value, 'string', `${path} must be a string`);
      if (definition.pattern) assert.match(value, new RegExp(definition.pattern), `${path} default does not match its pattern`);
      return;
    }
    if (definition.type === 'array') {
      assert.ok(Array.isArray(value), `${path} must be an array`);
      if (definition.minItems !== undefined) assert.ok(value.length >= definition.minItems, `${path} has too few default items`);
      if (definition.maxItems !== undefined) assert.ok(value.length <= definition.maxItems, `${path} has too many default items`);
      value.forEach((item, index) => assertDefinition(definition.items, item, `${path}[${index}]`, requireStepGrid, false));
      return;
    }
    if (definition.type === 'number' || definition.type === 'integer') {
      assert.ok(Number.isFinite(value), `${path} must be finite`);
      if (definition.type === 'integer') assert.ok(Number.isInteger(value), `${path} must be an integer`);
      if (definition.minimum !== undefined) assert.ok(value >= definition.minimum, `${path} default is below minimum`);
      if (definition.maximum !== undefined) assert.ok(value <= definition.maximum, `${path} default is above maximum`);
      if (definition.step !== undefined) {
        assert.ok(definition.step > 0, `${path} step must be positive`);
        if (requireStepGrid && definition.minimum !== undefined) {
          assert.ok(Math.abs((value - definition.minimum) / definition.step - Math.round((value - definition.minimum) / definition.step)) < 1e-8, `${path} default is off its min-relative step grid`);
        }
        if (requireStepGrid && definition.maximum !== undefined && definition.minimum !== undefined) {
          assert.ok(Math.abs((definition.maximum - definition.minimum) / definition.step - Math.round((definition.maximum - definition.minimum) / definition.step)) < 1e-8, `${path} maximum is off its min-relative step grid`);
        }
      }
      return;
    }
    assert.fail(`${path} has unsupported metadata type: ${definition.type}`);
  };

  const assertDefaultsSatisfyMetadata = (meta, defaults, requireStepGrid, path = '') => {
    for (const [key, definition] of Object.entries(meta)) {
      const currentPath = path ? `${path}.${key}` : key;
      assertDefinition(definition, defaults[key], currentPath, requireStepGrid);
    }
  };

  for (const [id, { meta, defaults }] of Object.entries(SIMULATOR_PARAMETER_PROFILES)) {
    assertDefaultsSatisfyMetadata(meta, defaults, id === 'subwaysim2');
  }
});

test('parameter registry covers every simulator route and preserves special schemas', () => {
  const expectedIds = [
    'waveinterferencesim', 'simpleattractorsim', 'sqgblackholesim', 'frcfusionsim', 'ddfblackholesim',
    'subwaysim2', 'amplitudegravitysim', 'ftlelabsim', 'quantumfluidsim', 'thermalloopsim',
    'phasesignalsim', 'longitudinallasersim', 'oamsolitonsim', 'railtiesim', 'railheatsim',
    'spacetieaccelerator', 'halbachlinearmotor', 'quantumcircuitsim', 'twistorspinortrainer'
  ];
  const registry = generateSimulatorParameterSchemaRegistry();
  assert.deepEqual(Object.keys(SIMULATOR_PARAMETER_PROFILES).sort(), expectedIds.sort());
  assert.deepEqual(Object.keys(registry.$defs).sort(), expectedIds.sort());

  const wave = registry.$defs.waveinterferencesim.properties.apertureSettings.properties;
  assert.deepEqual(wave.slitCount.type, ['integer', 'null']);
  assert.deepEqual(wave.slitSpacing.type, ['number', 'null']);

  const gates = registry.$defs.quantumcircuitsim.properties.gates.items;
  assert.ok(gates.properties.control);
  assert.deepEqual(gates.required, ['type', 'target']);
  assert.equal(gates.additionalProperties, false);

  assert.equal(SIMULATOR_PARAMETER_PROFILES.spacetieaccelerator.meta.halbachPolePairs.type, 'integer');
  assert.equal(SIMULATOR_PARAMETER_PROFILES.quantumfluidsim.meta.stepSize.minimum, undefined);
});

test('every simulator schema property has a title and description', () => {
  const assertDescribed = (definition, path) => {
    assert.ok(typeof definition.title === 'string' && definition.title.length > 0, `${path} needs a title`);
    assert.ok(typeof definition.description === 'string' && definition.description.length > 0, `${path} needs a description`);
    assert.doesNotMatch(definition.description, /^(Sets|Enables or disables|Selects|Groups|Lists)\b/, `${path} should describe the parameter, not issue an instruction`);
    if (definition.type === 'object') {
      for (const [key, nested] of Object.entries(definition.properties)) assertDescribed(nested, `${path}.${key}`);
    } else if (definition.type === 'array') {
      assertDescribed(definition.items, `${path}[]`);
    }
  };

  for (const [id, { meta }] of Object.entries(SIMULATOR_PARAMETER_PROFILES)) {
    const schema = generateJsonSchema(meta);
    for (const [key, definition] of Object.entries(schema.properties)) assertDescribed(definition, `${id}.${key}`);
  }
});

test('generated descriptions define parameter values in plain language', () => {
  const properties = SUBWAY_SIMULATOR_JSON_SCHEMA.properties;
  assert.equal(properties.cameraControlsEnabled.description, 'Availability of camera controls.');
  assert.equal(properties.cameraOrbitOn.description, 'Whether camera orbit is on.');
  assert.equal(properties.replayCameraOrbitSpeed.description, 'Numeric value for replay camera orbit speed.');
  assert.equal(properties.shaftControls.items.description, 'Signed ventilation speed for one shaft; negative values reverse vertical flow.');
  assert.equal(SIMULATOR_PARAMETER_PROFILES.quantumfluidsim.meta.vortexCoreRadius.description, 'Radial distance over which density rises from zero at the vortex core.');
  assert.equal(SIMULATOR_PARAMETER_PROFILES.quantumfluidsim.meta.particleAppearance.properties.derivativeOrder.description, 'Order used to estimate vector direction: 0 uses local current when available; 1-4 use periodic derivatives of the active scalar field.');
  assert.equal(SIMULATOR_PARAMETER_PROFILES.simpleattractorsim.meta.fieldMechanics.properties.dilatancy.description, 'Coefficient of the speed- and strain-dependent viscosity increase in the DDF mobility model.');
});

test('checked-in JSON Schema matches the metadata generator', async () => {
  const schemaUrl = new URL('../docs/schemas/subwaysim2.parameters.schema.json', import.meta.url);
  const checkedInSchema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.deepEqual(checkedInSchema, SUBWAY_SIMULATOR_JSON_SCHEMA);
});

test('checked-in defaults are directly consumable instead of relying on schema annotations', async () => {
  const defaultsUrl = new URL('../docs/schemas/subwaysim2.defaults.json', import.meta.url);
  const checkedInDefaults = JSON.parse(await readFile(defaultsUrl, 'utf8'));
  assert.deepEqual(checkedInDefaults, SUBWAY_SIMULATOR_DEFAULTS);
});

test('checked-in simulator registry artifacts match the metadata generator', async () => {
  const normalizeRuntimeDate = (value) => {
    if (Array.isArray(value)) return value.map(normalizeRuntimeDate);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined).map(([key, nestedValue]) => [
      key,
      key === 'ephemerisDate' ? '<runtime-date>' : normalizeRuntimeDate(nestedValue)
    ]));
  };
  const schemaUrl = new URL('../docs/schemas/simulators.parameters.schema.json', import.meta.url);
  const defaultsUrl = new URL('../docs/schemas/simulators.defaults.json', import.meta.url);
  const checkedInSchema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  const checkedInDefaults = JSON.parse(await readFile(defaultsUrl, 'utf8'));

  assert.deepEqual(normalizeRuntimeDate(checkedInSchema), normalizeRuntimeDate(generateSimulatorParameterSchemaRegistry()));
  assert.deepEqual(normalizeRuntimeDate(checkedInDefaults), normalizeRuntimeDate(SIMULATOR_PARAMETER_DEFAULTS));
});

test('camera wheel options use the shared schema enum', () => {
  assert.deepEqual(CAMERA_WHEEL_MODE_OPTIONS, [
    { value: 'zoom', label: 'Zoom' },
    { value: 'dolly', label: 'Move camera' }
  ]);
  assert.deepEqual(CAMERA_WHEEL_MODE_OPTIONS.map(({ value }) => value), SUBWAY_SIMULATOR_PARAMETER_META.cameraWheelMode.values);
});

test('numeric enums preserve their JSON value type', () => {
  const schema = generateJsonSchema({
    gridSize: { type: 'enum', default: 32, values: [16, 32, 64] },
    vortexCharge: { type: 'enum', default: -1, values: [-1, 1] }
  });
  assert.equal(schema.properties.gridSize.type, 'integer');
  assert.deepEqual(schema.properties.gridSize.enum, [16, 32, 64]);
  assert.equal(schema.properties.vortexCharge.type, 'integer');
  assert.deepEqual(schema.properties.vortexCharge.enum, [-1, 1]);
});

test('metadata builder preserves nested defaults and declared control constraints', () => {
  const metadata = createParameterMetaFromDefaults({
    settings: { enabled: true, speed: 1.5, count: 4, mode: 'steady', axes: [0, 1, 2] }
  }, {
    ranges: { 'settings.speed': [0, 3, 0.1], 'settings.count': [1, 8, 1], 'settings.axes[]': [-2, 2, 0.5] },
    enums: { 'settings.mode': ['steady', 'pulsed'] },
    integers: ['settings.count'],
    arrayBounds: { 'settings.axes': [3, 3] }
  });
  const defaults = createParameterDefaults(metadata);
  const schema = generateJsonSchema(metadata);

  assert.deepEqual(defaults, { settings: { enabled: true, speed: 1.5, count: 4, mode: 'steady', axes: [0, 1, 2] } });
  assert.equal(schema.properties.settings.properties.speed.minimum, 0);
  assert.equal(schema.properties.settings.properties.speed['x-step'], 0.1);
  assert.equal(schema.properties.settings.properties.count.type, 'integer');
  assert.deepEqual(schema.properties.settings.properties.mode.enum, ['steady', 'pulsed']);
  assert.equal(schema.properties.settings.properties.axes.minItems, 3);
  assert.equal(schema.properties.settings.properties.axes.maxItems, 3);
  assert.equal(schema.properties.settings.properties.axes.items.maximum, 2);
});

test('metadata builder supports nullable controls and optional array-item properties', () => {
  const metadata = createParameterMetaFromDefaults({
    autoCount: null,
    gates: [{ type: 'H', target: 0 }, { type: 'CNOT', control: 0, target: 1 }]
  }, {
    arrayItems: {
      gates: {
        type: 'object',
        properties: {
          type: { type: 'string', default: 'H', values: ['H', 'CNOT'] },
          target: { type: 'integer', default: 0, minimum: 0, maximum: 1 },
          control: { type: 'integer', default: 0, minimum: 0, maximum: 1 }
        },
        required: ['type', 'target'],
        additionalProperties: false
      }
    }
  });
  const schema = generateJsonSchema(metadata);
  assert.equal(schema.properties.autoCount.type, 'null');
  assert.deepEqual(schema.properties.gates.items.required, ['type', 'target']);
  assert.equal(schema.properties.gates.items.additionalProperties, false);
});