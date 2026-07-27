import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const forbiddenServerNames = ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN'];

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(candidate));
    else files.push(candidate);
  }
  return files;
};

test('client feature source and production bundle contain no server credential names', async () => {
  const featureFiles = (await filesUnder('src/features/turn-intelligence'))
    .filter((file) => /\.(ts|tsx|css|html)$/.test(file));
  const distFiles = (await filesUnder('dist')).filter((file) => /\.(js|html|css)$/.test(file));
  const clientText = (await Promise.all([...featureFiles, ...distFiles].map((file) => readFile(file, 'utf8')))).join('\n');
  for (const name of forbiddenServerNames) assert.doesNotMatch(clientText, new RegExp(name));
});
