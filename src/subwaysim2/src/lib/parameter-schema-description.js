function pathParts(path) {
  if (Array.isArray(path)) return path.map(String);
  if (typeof path !== 'string' || path.length === 0) return [];
  return path.replace(/\[(\d*)\]/g, (_, index) => `.${index || '0'}`).split('.').filter(Boolean);
}

function definitionAtPath(schema, path) {
  let definition = schema;
  for (const part of pathParts(path)) {
    if (/^\d+$/.test(part)) definition = definition?.items;
    else definition = definition?.properties?.[part];
  }
  return definition;
}

function normalizeText(value) {
  return String(value ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function schemaTypes(definition) {
  return Array.isArray(definition.type) ? definition.type : [definition.type];
}

function collectDefinitions(schema, output = []) {
  if (!schema || typeof schema !== 'object') return output;
  if (schema.description) output.push(schema);
  for (const property of Object.values(schema.properties ?? {})) collectDefinitions(property, output);
  collectDefinitions(schema.items, output);
  return output;
}

export function resolveParameterDescription(schema, { path, label, type, options, min, max, step } = {}) {
  const exact = definitionAtPath(schema, path);
  if (exact?.description) return exact.description;
  if (!schema || !label) return undefined;

  const labelWords = new Set(normalizeText(label).split(' ').filter(Boolean));
  let bestDefinition;
  let bestScore = 0;
  for (const definition of collectDefinitions(schema)) {
    const definitionType = schemaTypes(definition);
    const typeMatches = !type || definitionType.includes(type) || (type === 'number' && definitionType.includes('integer'));
    if (!typeMatches) continue;

    const title = normalizeText(definition.title);
    const titleWords = new Set(title.split(' ').filter(Boolean));
    const sharedWords = [...labelWords].filter((word) => titleWords.has(word)).length;
    let score = sharedWords * 20;
    if (title === normalizeText(label)) score += 100;

    const providedRanges = [['minimum', min], ['maximum', max], ['x-step', step]].filter(([, value]) => value !== undefined);
    for (const [key, value] of providedRanges) {
      score += Math.abs(Number(definition[key]) - Number(value)) < 1e-8 ? 12 : -16;
    }

    if (options?.length && definition.enum) {
      const optionValues = options.map((option) => typeof option === 'object' ? option.value : option);
      if (optionValues.every((value) => definition.enum.includes(value))) score += 24;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDefinition = definition;
    }
  }
  return bestDefinition?.description;
}