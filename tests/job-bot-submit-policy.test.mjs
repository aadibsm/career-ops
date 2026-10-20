import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

test('agent policy allows only exact single-use final-submit authorization', () => {
  const agents = read('AGENTS.md');
  assert.match(agents, /Final submit allowed/);
  assert.match(agents, /single-use/i);
  assert.match(agents, /plugins\.local\/job-bot\/submission-authorization\.mjs/);
  assert.match(agents, /payload change/i);
});

test('apply mode requires preview then authorize check and consume', () => {
  const apply = read('modes/apply.md');
  assert.match(apply, /final payload preview/i);
  assert.match(apply, /plugins\.local\/job-bot\/submission-authorization\.mjs authorize/);
  assert.match(apply, /plugins\.local\/job-bot\/submission-authorization\.mjs check/);
  assert.match(apply, /plugins\.local\/job-bot\/submission-authorization\.mjs consume/);
  assert.match(apply, /never bypass.*captcha/i);
});

test('authorization state is declared user data and ignored by git', () => {
  assert.match(read('DATA_CONTRACT.md'), /data\/submission-authorization\.json/);
  assert.match(read('.gitignore'), /^data\/\*$/m);
});
