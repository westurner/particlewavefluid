import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { SIMULATOR_PARAMETER_DEFAULTS, generateSimulatorParameterSchemaRegistry } from '../src/simulatorParameterRegistry.js';

const outputs = [
	['../docs/schemas/simulators.parameters.schema.json', generateSimulatorParameterSchemaRegistry()],
	['../docs/schemas/simulators.defaults.json', SIMULATOR_PARAMETER_DEFAULTS]
];

for (const [relativePath, value] of outputs) {
	const outputUrl = new URL(relativePath, import.meta.url);
	await mkdir(dirname(fileURLToPath(outputUrl)), { recursive: true });
	await writeFile(outputUrl, `${JSON.stringify(value, null, 2)}\n`);
	console.log(`Wrote ${fileURLToPath(outputUrl)}`);
}