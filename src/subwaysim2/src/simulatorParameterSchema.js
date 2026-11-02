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

function parameterTitle(path) {
  return path.replace(/\[\]/g, '').split('.').filter(Boolean).map((part) => part
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => word.length <= 2 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1))
    .join(' ')).join(' ');
}

function generatedDescription(definition, title) {
  const name = title.toLowerCase();
  if (definition.type === 'object') return `A group of related ${name} settings.`;
  if (definition.type === 'array') return `An ordered collection of ${name} values.`;
  if (definition.type === 'boolean') {
    if (name.endsWith(' enabled')) return `Availability of ${name.slice(0, -8)}.`;
    if (name.endsWith(' on')) return `Whether ${name.slice(0, -3)} is on.`;
    if (name.endsWith(' visible')) return `Visibility of ${name.slice(0, -8)}.`;
    if (name === 'running') return 'Whether the simulation is running.';
    return `Whether ${name} is active.`;
  }
  if (definition.type === 'enum') return `The selected ${name} option.`;
  if (definition.type === 'string') return `The text value associated with ${name}.`;
  return `Numeric value for ${name}.`;
}

function describeParameter(definition, path, descriptions) {
  const title = parameterTitle(path);
  const description = descriptions[path] ?? definition.description ?? generatedDescription(definition, title);
  if (definition.type === 'object') {
    return {
      ...definition,
      title,
      description,
      properties: Object.fromEntries(Object.entries(definition.properties).map(([key, nested]) => [
        key,
        describeParameter(nested, `${path}.${key}`, descriptions)
      ]))
    };
  }
  if (definition.type === 'array') {
    return { ...definition, title, description, items: describeParameter(definition.items, `${path}[]`, descriptions) };
  }
  return { ...definition, title, description };
}

function addParameterDescriptions(meta, descriptions = {}, prefix = '') {
  return Object.fromEntries(Object.entries(meta).map(([key, definition]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [key, describeParameter(definition, path, descriptions)];
  }));
}

export const COMMON_SIMULATOR_PARAMETER_META = Object.freeze(addParameterDescriptions({
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
}));

const SUBWAY_PARAMETER_DESCRIPTIONS = Object.freeze({
  'shaftControls[]': 'Signed ventilation speed for one shaft; negative values reverse vertical flow.',
  surfaceTemperature: "Station-floor temperature in °F, which determines heat transfer to nearby air.",
  passengerHeat: 'Heat released around the visible passengers.',
  roadSurfaceTemperature: 'Outdoor road temperature that drives convection above the street.',
  ambientAirTemperature: 'Outdoor air temperature approached by the upper part of the simulated field.',
  surfaceCrosswind: 'Outdoor wind speed across the station along the Z axis; negative values reverse its direction.',
  stairUndergroundOpeningHeight: 'Clear height of the underground tunnel and doorway, independent of stair and turnstile height.',
  stairLandingHeight: 'Elevation of the level landing between the lower and upper stair flights.',
  stairSurfaceOpeningHeight: 'Elevation of the stair opening at street level, which also determines the street and shaft outlet heights.',
  train: 'Whether trains pass through the station at the configured interval.',
  shaftFans: 'Whether powered upward flow is applied in the three ventilation shafts.',
  clerestoryWindows: 'Whether the roof-bridging clerestory panes and their airflow exchange are enabled.',
  windOcclusion: 'Whether airflow is deflected by station columns, platforms, and the train.',
  ac: 'Whether the active train produces air-conditioning heat and lift.',
  brakes: 'Whether braking produces localized heat and turbulence.',
  floodTunnels: 'Whether the below-station cold-sink gallery is enabled.',
  shaftExchange: 'Strength of air capture toward the three passive vertical shafts.',
  shaftFanVelocity: 'Upward air speed produced by the powered ventilation shafts.',
  downFans: 'Downward airflow strength from the station ceiling fan banks.',
  floorAirMovers: 'Airflow strength across the platform floor toward the stair route.',
  ceilingFans: 'Airflow strength carrying the warm ceiling band toward the egress.',
  grooves: 'Strength of passive airflow guidance along the roof grooves.',
  roofPitch: 'Roof angle, which determines the envelope slope and buoyant headroom.',
  roofOffset: 'Lateral position of the roof ridge across the station width.',
  roofGapHorizontal: 'Horizontal distance between the two roof panels.',
  roofGapVertical: 'Vertical span bridged by each clerestory pane.',
  clerestoryOpen: 'Fraction of passive airflow exchange through the clerestory span.',
  stackEffect: 'Strength of passive warm-air lift through the shafts, separate from powered fans and crosswind.',
  floodFlow: 'Strength of warm lower-air flow into the gallery cold sink.',
  floodPumpDirection: 'Direction of flood-gallery air pumping along the X axis.',
  trainInterval: 'Elapsed time between the starts of consecutive train passes.',
  trainStopFrequency: 'Fraction of train passes that stop at the platform.',
  trainStopDuration: 'Dwell time at the platform for a stopping train.',
  particleCount: 'Number of particles rendered in the GPU simulation field.',
  particleMagnitudeScale: 'Change in particle diameter associated with velocity magnitude.',
  constitutiveStrength: 'Strength of the selected experimental shear response.',
  constitutiveSpeedLimit: 'Dimensionless speed threshold for the onset of the DDF viscosity increase.',
  density: 'Mass per simulated air volume.',
  stiffness: 'Resistance of neighboring particles to compression.',
  viscosity: 'Rate at which neighboring air velocities blend.'
});

export const SUBWAY_SIMULATION_PARAMETER_META = Object.freeze(addParameterDescriptions({
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
}, SUBWAY_PARAMETER_DESCRIPTIONS));

export const SUBWAY_SIMULATOR_PARAMETER_META = Object.freeze(addParameterDescriptions({
  ...COMMON_SIMULATOR_PARAMETER_META,
  ...SUBWAY_SIMULATION_PARAMETER_META
}));

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

export function createParameterMetaFromDefaults(defaults, { ranges = {}, enums = {}, integers = [], arrayBounds = {}, arrayItems = {}, nullable = [], descriptions = {} } = {}) {
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

  return addParameterDescriptions(build(defaults).properties, descriptions);
}

export function toJsonSchemaDefinition(definition) {
  if (definition.type === 'object') {
    const properties = Object.fromEntries(Object.entries(definition.properties).map(([key, property]) => (
      [key, toJsonSchemaDefinition(property)]
    )));
    const schema = {
      type: 'object',
      properties,
      required: definition.required ?? Object.keys(properties),
      additionalProperties: definition.additionalProperties ?? false
    };
    if (definition.title !== undefined) schema.title = definition.title;
    if (definition.description !== undefined) schema.description = definition.description;
    return schema;
  }

  if (definition.type === 'array') {
    const schema = {
      type: 'array',
      default: [...definition.default],
      minItems: definition.minItems,
      maxItems: definition.maxItems,
      items: toJsonSchemaDefinition(definition.items)
    };
    if (definition.title !== undefined) schema.title = definition.title;
    if (definition.description !== undefined) schema.description = definition.description;
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
  if (definition.title !== undefined) schema.title = definition.title;
  if (definition.description !== undefined) schema.description = definition.description;
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