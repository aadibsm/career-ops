#!/usr/bin/env node
/**
 * career-ops-prefilter.mjs — deterministic (zero-token) first pass over
 * data/pipeline.md Pending entries.
 *
 * It NEVER deletes or modifies pipeline.md. It writes:
 *   data/triage-queue.tsv    — rows that survive the hard-DQ screen, newest first
 *   batch/logs/discard.log   — one auditable line per filtered row with a reason
 *
 * Rows already present in data/triage-results.tsv are skipped (idempotent).
 *
 * Run: node scripts/career-ops-prefilter.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const ROOT = '/home/hermes/career-ops-jobbot';
const PIPELINE = join(ROOT, 'data', 'pipeline.md');
const QUEUE = join(ROOT, 'data', 'triage-queue.tsv');
const RESULTS = join(ROOT, 'data', 'triage-results.tsv');
const DISCARD = join(ROOT, 'batch', 'logs', 'discard.log');

const STALE_DAYS = 90; // postings older than this are queued but flagged stale

// Hard DQ screens, straight from modes/_brief.md.
const NON_US = /\b(canada|ontario|toronto|united kingdom|uk|london|berlin|germany|india|ireland|dublin|france|paris|spain|netherlands|amsterdam|australia|sydney|singapore|brazil|mexico|chile|poland|israel|japan|tokyo|china|shanghai|remote - (?!us|united states))\b/i;
const SENIORITY = /\b(staff|principal|director|vp|head of|senior manager|group manager)\b/i;
const CLEARANCE = /\b(clearance|ts\/sci|secret level|doD cleared|cleared\b|dfars|export control|itars)\b/i;
const NON_IT = /\b(aerospace|aeronautical|mechanical|robotics|embedded|firmware|avionics|missile|structural|manufacturing|chemical|civil|electrical engineer|systems engineer, (aero|mech)|test engineer|quality engineer|manufacturing)\b/i;
const IT_SIGNAL = /\b(it|support|help desk|service desk|system admin|systems admin|network|security|soc|cyber|endpoint|infrastructure|cloud|m365|microsoft|administrator|engineer|analyst|operations)\b/i;

const lines = readFileSync(PIPELINE, 'utf8').split('\n');
const done = new Set();
if (existsSync(RESULTS)) {
  for (const l of readFileSync(RESULTS, 'utf8').split('\n')) {
    const m = l.split('\t')[1];
    if (m) done.add(m);
  }
}

const now = Date.now();
const queue = [];
const discarded = [];
let inPending = false;

for (const line of lines) {
  if (/^##\s+Pending/i.test(line)) { inPending = true; continue; }
  if (/^##\s+Processed/i.test(line)) { inPending = false; continue; }
  if (!inPending || !/^- \[ \] /.test(line)) continue;

  const body = line.replace(/^- \[ \] /, '');
  const parts = body.split('|').map(s => s.trim());
  const url = parts[0];
  if (!url || !/^https?:/.test(url) || done.has(url)) continue;

  const company = parts[1] || '';
  const role = parts[2] || '';
  const location = parts[3] || '';
  const postedMatch = body.match(/posted: (\d{4}-\d{2}-\d{2})/);
  const posted = postedMatch ? postedMatch[1] : '';
  const ageDays = posted ? Math.floor((now - Date.parse(posted)) / 86400000) : null;

  let reason = null;
  if (NON_US.test(location)) reason = 'location: non-US';
  else if (SENIORITY.test(role)) reason = 'seniority: Staff/Principal/Director+ band';
  else if (CLEARANCE.test(role + ' ' + body)) reason = 'security clearance required';
  else if (NON_IT.test(role) && !IT_SIGNAL.test(role)) reason = 'domain: non-IT engineering collision';
  else if (!IT_SIGNAL.test(role)) reason = 'domain: no IT/security signal in title';

  if (reason) {
    discarded.push(`${new Date().toISOString()}\t${url}\t${company}\t${role}\t${reason}`);
  } else {
    queue.push({ url, company, role, location, posted, stale: ageDays != null && ageDays > STALE_DAYS });
  }
}

queue.sort((a, b) => (b.posted || '').localeCompare(a.posted || ''));

if (!process.argv.includes('--dry-run')) {
  mkdirSync(join(ROOT, 'batch', 'logs'), { recursive: true });
  writeFileSync(QUEUE, queue.map(r =>
    `${r.company}\t${r.url}\t${r.role}\t${r.location}\t${r.posted}\t${r.stale ? 'stale' : 'fresh'}`
  ).join('\n') + '\n');
  if (discarded.length) appendFileSync(DISCARD, discarded.join('\n') + '\n');
}

console.log(`prefilter: ${queue.length} queued | ${discarded.length} filtered (logged, not deleted)`);
console.log(`  fresh (<=90d): ${queue.filter(r => !r.stale).length}`);
console.log(`  stale (>90d): ${queue.filter(r => r.stale).length}`);
const byReason = {};
for (const d of discarded) { const r = d.split('\t')[4]; byReason[r] = (byReason[r] || 0) + 1; }
for (const [r, n] of Object.entries(byReason)) console.log(`  filtered ${n}: ${r}`);
