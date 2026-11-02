import { FLUID_MODEL_OPTIONS } from './mechanicsModels.js';
import { STAIR_ROUTE } from './routeModel.js';

const boolean = (defaultValue) => ({ type: 'boolean', default: defaultValue });
const number = (defaultValue, minimum, maximum, step) => ({ type: 'number', default: defaultValue, minimum, maximum, step });
const integer = (defaultValue, minimum, maximum, step) => ({ type: 'integer', default: defaultValue, minimum, maximum, step });
const enumeration = (defaultValue, values) => ({ type: 'enum', default: defaultValue, values });
const object = (properties, { required = Object.keys(properties), additionalProperties = false } = {}) => ({
  type: 'object',
  properties,
  required,
  additionalProperties
});

export const COMMON_SIMULATOR_PARAMETER_META = Object.freeze({
  cameraControlsEnabled: boolean(true),
  cameraOrbitOn: boolean(true),
  cameraZoomEnabled: boolean(true),
  cameraWheelMode: enumeration('zoom', ['zoom', 'dolly']),
  replayCameraOrbitSpeed: number(0.55, 0.01, 2, 0.01),
  replayCameraOrbitX: number(0, -1, 1, 0.01),
  replayCameraOrbitY: number(1, -1, 1, 0.01),
  replayCameraOrbitZ: number(0, -1, 1, 0.01),
  particleAppearance: object({
    sizeScale: number(1, 0.25, 8, 0.05),
    zoomSizeEnabled: boolean(false),
    zoomSizeSensitivity: number(1, 0, 2, 0.05),
    shape: enumeration('native', ['native', 'circle', 'square', 'sphere', 'vector']),
    derivativeOrder: integer(1, 0, 4, 1),
    colorMode: enumeration('native', ['native', 'custom']),
    color: { type: 'string', default: '#ffffff', pattern: '^#[0-9a-fA-F]{6}$' },
    opacity: number(1, 0, 1, 0.01)
  })
});

export const SUBWAY_SIMULATION_PARAMETER_META = Object.freeze({
  surfaceTemperature: number(81.5, 60, 110, 0.5),
  roadSurfaceTemperature: number(92, 45, 130, 0.5),
  ambientAirTemperature: number(72, 40, 110, 0.5),
  passengerHeat: number(0.75, 0, 1.5, 0.05),
  surfaceCrosswind: number(3, -8, 8, 0.25),
  stairUndergroundOpeningHeight: number(STAIR_ROUTE.tunnelHeight, 2.2, 5, 0.1),
  stairLandingHeight: number(STAIR_ROUTE.landingY, 1, 5, 0.05),
  stairSurfaceOpeningHeight: number(STAIR_ROUTE.baseY + STAIR_ROUTE.riseY, 8.2, 10, 0.1),
  density: number(1.18, 0.5, 3, 0.01),
  stiffness: number(5, 1, 20, 0.5),
  viscosity: number(0.012, 0.001, 0.05, 0.001),
  constitutiveModel: enumeration('baseline', FLUID_MODEL_OPTIONS.map(({ value }) => value)),
  constitutiveStrength: number(1, 0, 10, 0.05),
  constitutiveSpeedLimit: number(8, 0.1, 20, 0.1),
  train: boolean(true),
  ac: boolean(true),
  brakes: boolean(true),
  shaftExchange: number(0.65, 0, 1, 0.05),
  shaftControls: {
    type: 'array',
    default: [1, 1, 1],
    minItems: 3,
    maxItems: 3,
    items: number(1, -1, 1, 0.05)
  },
  shaftFans: boolean(true),
  shaftFanVelocity: number(2.5, 0, 8, 0.25),
  downFans: number(0.45, 0, 1, 0.05),
  floorAirMovers: number(0.5, 0, 1, 0.05),
  ceilingFans: number(0.5, 0, 1, 0.05),
  grooves: number(0.7, 0, 1, 0.05),
  floodTunnels: boolean(true),
  floodFlow: number(0.55, 0, 1, 0.05),
  floodPumpDirection: number(1, -1, 1, 0.1),
  roofPitch: number(14, -28, 28, 1),
  roofOffset: number(0, -2, 2, 0.1),
  roofGapHorizontal: number(0, 0, 2.4, 0.1),
  roofGapVertical: number(0, 0, 3, 0.1),
  clerestoryWindows: boolean(true),
  clerestoryOpen: number(0, 0, 1, 0.05),
  stackEffect: number(0.65, 0, 1, 0.05),
  trainInterval: integer(20, 8, 60, 1),
  trainStopFrequency: number(0.5, 0, 1, 0.05),
  trainStopDuration: integer(6, 0, 30, 1),
  particleCount: integer(4096, 1024, 9216, 512),
  particleDiameter: number(0.7, 0.2, 1.4, 0.05),
  particleMagnitudeScale: number(0.6, 0, 2, 0.05),
  windOcclusion: boolean(true)
});

export const SUBWAY_SIMULATOR_PARAMETER_META = Object.freeze({
  ...COMMON_SIMULATOR_PARAMETER_META,
  ...SUBWAY_SIMULATION_PARAMETER_META
});

export function createParameterDefaults(meta) {
  return Object.fromEntries(Object.entries(meta).map(([key, definition]) => {
    if (definition.type === 'object') return [key, createParameterDefaults(definition.properties)];
    if (Array.isArray(definition.default)) return [key, definition.default.map((value) => (
      value && typeof value === 'object'
        ? Array.isArray(value) ? value.map((item) => item && typeof item === 'object' ? { ...item } : item) : { ...value }
        : value
    ))];
    return [key, definition.default];
  }));
}

export function createParameterMetaFromDefaults(defaults, { ranges = {}, enums = {}, integers = [], arrayBounds = {}, arrayItems = {}, nullable = [] } = {}) {
  const integerPaths = new Set(integers);
  const nullablePaths = new Set(nullable);
  const build = (value, path = '') => {
    if (Array.isArray(value)) {
      const bounds = arrayBounds[path] ?? [0, undefined];
      const itemDefinition = arrayItems[path] ?? (value.length > 0
        ? build(value[0], `${path}[]`)
        : { type: 'string', default: '' });
      return {
        type: 'array',
        default: value,
        minItems: bounds[0],
        ...(bounds[1] === undefined ? {} : { maxItems: bounds[1] }),
        items: itemDefinition
      };
    }
    if (value && typeof value === 'object') {
      return object(Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => {
        const nestedPath = path ? `${path}.${key}` : key;
        return [key, build(nestedValue, nestedPath)];
      })));
    }
    if (Object.hasOwn(enums, path)) return enumeration(value, enums[path]);
    if (typeof value === 'boolean') return boolean(value);
    if (value === null) {
      if (!nullablePaths.has(path)) return { type: 'null', default: null };
      const [minimum, maximum, step] = ranges[path] ?? [];
      return {
        ...(integerPaths.has(path) ? integer(0, minimum, maximum, step) : number(0, minimum, maximum, step)),
        default: null,
        nullable: true
      };
    }
    if (typeof value === 'number') {
      const [minimum, maximum, step] = ranges[path] ?? [];
      return integerPaths.has(path)
        ? integer(value, minimum, maximum, step)
        : number(value, minimum, maximum, step);
    }
    return { type: 'string', default: value };
  };

  return build(defaults).properties;
}

export function toJsonSchemaDefinition(definition) {
  if (definition.type === 'object') {
    const properties = Object.fromEntries(Object.entries(definition.properties).map(([key, property]) => (
      [key, toJsonSchemaDefinition(property)]
    )));
    return {
      type: 'object',
      properties,
      required: definition.required ?? Object.keys(properties),
      additionalProperties: definition.additionalProperties ?? false
    };
  }

  if (definition.type === 'array') {
    const schema = {
      type: 'array',
      default: [...definition.default],
      minItems: definition.minItems,
      maxItems: definition.maxItems,
      items: toJsonSchemaDefinition(definition.items)
    };
    if (definition.nullable) schema.type = ['array', 'null'];
    return schema;
  }

  const schema = {
    type: definition.type === 'enum'
      ? definition.values.every((value) => typeof value === 'number')
        ? definition.values.every(Number.isInteger) ? 'integer' : 'number'
        : 'string'
      : definition.type,
    default: definition.default
  };
  if (definition.type === 'enum') schema.enum = [...definition.values];
  if (definition.minimum !== undefined) schema.minimum = definition.minimum;
  if (definition.maximum !== undefined) schema.maximum = definition.maximum;
  if (definition.step !== undefined) schema['x-step'] = definition.step;
  if (definition.pattern !== undefined) schema.pattern = definition.pattern;
  if (definition.nullable) schema.type = [schema.type, 'null'];
  return schema;
}

export function generateJsonSchema(meta, { id, title, description } = {}) {
  const definition = toJsonSchemaDefinition(object(meta));
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...(id ? { $id: id } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...definition
  };
}

export const DEFAULT_ORBITAL_TRACKING_CONFIGURATION = Object.freeze(
  createParameterDefaults(Object.fromEntries(Object.entries(COMMON_SIMULATOR_PARAMETER_META).filter(([key]) => key !== 'particleAppearance')))
);

export const DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION = Object.freeze(
  createParameterDefaults(COMMON_SIMULATOR_PARAMETER_META.particleAppearance.properties)
);

export const DEFAULT_SIMULATOR_3D_PARAMETERS = Object.freeze({
  ...DEFAULT_ORBITAL_TRACKING_CONFIGURATION,
  particleAppearance: DEFAULT_PARTICLE_APPEARANCE_CONFIGURATION
});

export const SUBWAY_SIMULATOR_DEFAULTS = Object.freeze(createParameterDefaults(SUBWAY_SIMULATOR_PARAMETER_META));

export const SUBWAY_SIMULATOR_JSON_SCHEMA = generateJsonSchema(SUBWAY_SIMULATOR_PARAMETER_META, {
  title: 'SubwaySim2 simulator parameters',
  description: 'Complete SubwaySim2 parameter object. Property defaults are annotations; use the companion defaults JSON to initialize a configuration.'
});