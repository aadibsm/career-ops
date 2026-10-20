import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mod = await import('../plugins.local/job-bot/submission-authorization.mjs');

const payload = {
  company: 'Example Corp',
  role: 'Senior Engineer',
  posting_url: 'https://example.com/jobs/123',
  files: ['output/cv-example.pdf'],
  answers: { sponsorship: 'No', salary: '150000' },
  attestations: ['information is accurate'],
  warnings: [],
};

test('exact application-scoped phrase authorizes one unchanged payload', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-submit-'));
  const state = join(dir, 'state.json');
  const digest = mod.payloadDigest(payload);

  assert.throws(
    () => mod.authorize({ statePath: state, phrase: 'submit allowed', payload }),
    /exact phrase/i,
  );

  const auth = mod.authorize({
    statePath: state,
    phrase: 'Final submit allowed',
    payload,
  });
  assert.equal(auth.payload_digest, digest);
  assert.equal(mod.check({ statePath: state, payload }).allowed, true);

  const consumed = mod.consume({ statePath: state, payload });
  assert.equal(consumed.allowed, true);
  assert.equal(mod.check({ statePath: state, payload }).allowed, false);
});

test('authorization fails closed after payload changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-submit-change-'));
  const state = join(dir, 'state.json');
  mod.authorize({ statePath: state, phrase: 'Final submit allowed', payload });

  const changed = structuredClone(payload);
  changed.answers.salary = '160000';
  assert.equal(mod.check({ statePath: state, payload: changed }).allowed, false);
});

test('authorization state stores scope and digest but not form answers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-submit-private-'));
  const state = join(dir, 'state.json');
  mod.authorize({ statePath: state, phrase: 'Final submit allowed', payload });
  const raw = readFileSync(state, 'utf8');

  assert.match(raw, /Example Corp/);
  assert.match(raw, /Senior Engineer/);
  assert.doesNotMatch(raw, /150000/);
  assert.doesNotMatch(raw, /sponsorship/);
});
