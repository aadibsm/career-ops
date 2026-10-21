#!/usr/bin/env node
/**
 * career-ops-triage-digest.mjs — human-readable digest of triage verdicts.
 * Prints PASS + MARGINAL jobs (newest first) plus totals. Zero tokens.
 * Run: node scripts/career-ops-triage-digest.mjs [--since 2026-10-21]
 */
import { readFileSync, existsSync } from 'fs';

const RESULTS = '/home/hermes/career-ops-jobbot/data/triage-results.tsv';
if (!existsSync(RESULTS)) { console.log('no triage results yet'); process.exit(0); }

const args = process.argv.slice(2);
const sinceIdx = args.indexOf('--since');
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null;

const rows = readFileSync(RESULTS, 'utf8').split('\n').filter(Boolean)
  .map(l => { const [company, url, role, verdict, score, reason, ts] = l.split('\t'); return { company, url, role, verdict, score, reason, ts }; })
  .filter(r => !since || (r.ts || '') >= since);

const passes = rows.filter(r => r.verdict === 'PASS').sort((a, b) => (b.score - a.score) || (b.ts > a.ts ? 1 : -1));
const marginals = rows.filter(r => r.verdict === 'MARGINAL').sort((a, b) => (b.score - a.score));
const fails = rows.filter(r => r.verdict === 'FAIL').length;
const skips = rows.filter(r => r.verdict === 'SKIP').length;

const total = rows.length;
if (!total) { console.log('no triage verdicts in window'); process.exit(0); }

console.log(`career-ops triage digest (${since ? 'since ' + since : 'all'}): ${total} scored — ${passes.length} PASS, ${marginals.length} MARGINAL, ${fails} FAIL, ${skips} SKIP/dead`);
if (passes.length) {
  console.log('');
  console.log('PASS — worth a full evaluation:');
  for (const p of passes) console.log(`  ${p.score}/5 | ${p.company} | ${p.role} | ${p.reason} | ${p.url}`);
}
if (marginals.length) {
  console.log('');
  console.log('MARGINAL — borderline, your call:');
  for (const m of marginals) console.log(`  ${m.score}/5 | ${m.company} | ${m.role} | ${m.reason}`);
}
