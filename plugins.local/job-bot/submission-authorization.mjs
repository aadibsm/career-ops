#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_PHRASE = 'Final submit allowed';
const DEFAULT_STATE = resolve('data/submission-authorization.json');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function requirePayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('A final application payload is required');
  for (const key of ['company', 'role', 'posting_url']) {
    if (typeof payload[key] !== 'string' || !payload[key].trim()) throw new Error(`Payload field ${key} is required`);
  }
  return payload;
}

export function payloadDigest(payload) {
  requirePayload(payload);
  return createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');
}

function readState(statePath) {
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  const temp = `${statePath}.tmp-${process.pid}`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, statePath);
}

export function authorize({ statePath = DEFAULT_STATE, phrase, payload }) {
  requirePayload(payload);
  if (phrase !== REQUIRED_PHRASE) throw new Error(`Authorization requires the exact phrase: ${REQUIRED_PHRASE}`);
  const state = {
    version: 1,
    company: payload.company.trim(),
    role: payload.role.trim(),
    posting_url: payload.posting_url.trim(),
    payload_digest: payloadDigest(payload),
    authorized_at: new Date().toISOString(),
    consumed_at: null,
  };
  writeState(statePath, state);
  return state;
}

export function check({ statePath = DEFAULT_STATE, payload }) {
  requirePayload(payload);
  const state = readState(statePath);
  if (!state) return { allowed: false, reason: 'No authorization exists' };
  if (state.consumed_at) return { allowed: false, reason: 'Authorization was already consumed' };
  if (state.company !== payload.company.trim() || state.role !== payload.role.trim() || state.posting_url !== payload.posting_url.trim()) {
    return { allowed: false, reason: 'Authorization scope does not match this application' };
  }
  if (state.payload_digest !== payloadDigest(payload)) {
    return { allowed: false, reason: 'Final payload changed after authorization' };
  }
  return { allowed: true, reason: 'Exact single-use authorization matches the unchanged payload', authorization: state };
}

export function consume({ statePath = DEFAULT_STATE, payload }) {
  const verdict = check({ statePath, payload });
  if (!verdict.allowed) return verdict;
  const state = { ...verdict.authorization, consumed_at: new Date().toISOString() };
  writeState(statePath, state);
  return { allowed: true, reason: 'Authorization consumed', authorization: state };
}

function usage() {
  console.log(`Usage:
  node submission-authorization.mjs digest <payload.json>
  node submission-authorization.mjs authorize <payload.json> "${REQUIRED_PHRASE}"
  node submission-authorization.mjs check <payload.json>
  node submission-authorization.mjs consume <payload.json>

The payload must include company, role, posting_url, files, answers, attestations, and warnings.`);
}

function loadPayload(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const [command, payloadPath, phrase] = process.argv.slice(2);
  if (!command || !payloadPath || ['-h', '--help'].includes(command)) {
    usage();
  } else {
    try {
      const payload = loadPayload(payloadPath);
      let result;
      if (command === 'digest') result = { payload_digest: payloadDigest(payload) };
      else if (command === 'authorize') result = authorize({ phrase, payload });
      else if (command === 'check') result = check({ payload });
      else if (command === 'consume') result = consume({ payload });
      else throw new Error(`Unknown command: ${command}`);
      console.log(JSON.stringify(result, null, 2));
      if (['check', 'consume'].includes(command) && !result.allowed) process.exitCode = 2;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
