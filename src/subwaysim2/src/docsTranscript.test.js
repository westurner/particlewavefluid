import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const docsDirectory = join(projectRoot, 'docs');

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

for (const jsonName of readdirSync(docsDirectory).filter((name) => name.endsWith('.json'))) {
  const stem = basename(jsonName, '.json');
  test(`${stem} Markdown preserves its JSON transcript`, () => {
    const rows = JSON.parse(readFileSync(join(docsDirectory, jsonName), 'utf8'));
    const markdown = normalizeWhitespace(readFileSync(join(docsDirectory, `${stem}.md`), 'utf8'));
    const userCount = rows.filter(({ role }) => role === 'user').length;
    const assistantCount = rows.filter(({ role }) => role === 'assistant').length;
    assert.equal((markdown.match(/# you asked/g) ?? []).length, userCount);
    assert.equal((markdown.match(/# (?:gemini|googlesearch) response/g) ?? []).length, assistantCount);

    let cursor = 0;
    for (const row of rows) {
      for (const content of row.contents) {
        if (!['text', 'markdown', 'thinking'].includes(content.type)) continue;
        const expected = normalizeWhitespace(content.content);
        const nextIndex = markdown.indexOf(expected, cursor);
        assert.notEqual(nextIndex, -1, `Missing or reordered ${content.type} content from ${row.id}`);
        cursor = nextIndex + expected.length;
      }
    }
  });
}