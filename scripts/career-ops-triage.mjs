#!/usr/bin/env node
/**
 * career-ops-triage.mjs — first-pass scoring of prefiltered pipeline jobs.
 *
 * Reads data/triage-queue.tsv (from career-ops-prefilter.mjs), fetches each
 * JD via the ATS's public API (zero-token; a 404 here is also a liveness
 * check), scores it with a batched headless `hermes -z` call against
 * modes/_brief.md, and appends verdicts to data/triage-results.tsv.
 *
 * pipeline.md is NEVER modified. Every scored row gets a verdict line;
 * nothing is deleted.
 *
 * Run: node scripts/career-ops-triage.mjs [--limit 40] [--batch 5] [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { spawnSync } from 'child_process';

const ROOT = '/home/hermes/career-ops-jobbot';
const QUEUE = join2(ROOT, 'data', 'triage-queue.tsv');
const RESULTS = join2(ROOT, 'data', 'triage-results.tsv');
const BRIEF = join2(ROOT, 'modes', '_brief.md');

function join2(...p) { return p.join('/'); }

const args = process.argv.slice(2);
const LIMIT = Number(argVal('--limit') || 40);
const BATCH = Number(argVal('--batch') || 5);
const DRY = args.includes('--dry-run');
const CALL_TIMEOUT_MS = Number(process.env.CAREER_OPS_TRIAGE_TIMEOUT_MS || 240_000);

function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

// ---- ATS-specific JD fetch (zero tokens). 404/empty = dead posting. ----
async function fetchJd(url) {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  const strip = (html) => html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  const tryFetch = async (u, headers = {}) => {
    const res = await fetch(u, {
      headers: { 'User-Agent': ua, Accept: 'application/json, text/html', ...headers },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.text();
  };

  // Greenhouse
  let m = url.match(/(?:job-boards\.greenhouse\.io|boards\.greenhouse\.io)\/([a-z0-9-]+)\/jobs\/(\d+)/i);
  if (m) {
    const j = await tryFetch(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}`, { Accept: 'application/json' });
    if (j) {
      try {
        const o = JSON.parse(j);
        return { title: o.title, body: strip(o.description || ''), location: o.location?.name || '' };
      } catch { /* fall through */ }
    }
  }

  // Workday
  m = url.match(/(https:\/\/[a-z0-9-]+\.(?:wd\d|myworkday)\.com)\/([^/]+)\/job\/([^/]+)/i);
  if (m) {
    const j = await tryFetch(`${m[1]}/wday/cxs/${m[1].split('.')[0]}/${m[2]}/job/${m[3]}`, { Accept: 'application/json' });
    if (j) {
      try {
        const o = JSON.parse(j);
        const info = o.jobPostingInfo || o;
        if (info.title || info.jobDescription) {
          return { title: info.title, body: strip(info.jobDescription || ''), location: info.location || '' };
        }
      } catch { /* fall through */ }
    }
  }

  // Lever
  m = url.match(/jobs\.lever\.co\/([a-z0-9-]+)\/([a-z0-9-]+)/i);
  if (m) {
    const j = await tryFetch(`https://api.lever.co/v0/postings/${m[1]}/${m[2]}?mode=json`, { Accept: 'application/json' });
    if (j) {
      try {
        const o = JSON.parse(j);
        const text = Array.isArray(o.description) ? o.description.map(b => b.text).join(' ') : (o.description || '');
        return { title: o.title, body: strip(text), location: o.categories?.location || '' };
      } catch { /* fall through */ }
    }
  }

  // Ashby (public posting API — full plain-text JD)
  m = url.match(/jobs\.ashbyhq\.com\/([a-z0-9-]+)\/([a-z0-9-]+)/i);
  if (m) {
    const j = await tryFetch(`https://api.ashbyhq.com/posting-api/job-board/${m[1]}?includeDescription=true`, { Accept: 'application/json' });
    if (j) {
      try {
        const o = JSON.parse(j);
        const job = (o.jobs || []).find(x => x.id === m[2] || x.jobUrl === url);
        if (job) return { title: job.title, body: strip(job.descriptionPlain || job.descriptionHtml || ''), location: job.location || '' };
      } catch { /* fall through */ }
    }
  }

  // Generic: og:description meta tag (ICIMS, most SPA pages)
  const html = await tryFetch(url);
  if (html) {
    const og = html.match(/property="og:description" content="([^"]{0,1200})/i);
    if (og) return { title: '', body: strip(og[1]), location: '' };
    const body = strip(html).slice(0, 1200);
    if (body.length > 200) return { title: '', body, location: '' };
  }
  return null;
}

// ---- Headless triage call ----
function triageBatch(jobs, brief) {
  const jobBlock = jobs.map((j, i) =>
    `${i + 1}. ${j.company} | ${j.role} | ${j.location || 'location unknown'}\n   JD: ${j.jd.slice(0, 1500)}`
  ).join('\n\n');
  const prompt = `You are a job-triage engine. Score each job against the brief. Return EXACTLY one line per job, nothing else:
TRIAGE: PASS|MARGINAL|FAIL|SKIP | Company | Role | X.X/5 | reason (<=25 words)
PASS >= 3.5, MARGINAL 3.0-3.4, FAIL < 3.0, SKIP = inaccessible JD.

BRIEF:
${brief}

JOBS:
${jobBlock}`;

  const r = spawnSync('hermes', ['-z', prompt], {
    timeout: CALL_TIMEOUT_MS,
    encoding: 'utf8',
  });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.split('\n').map(l => l.trim()).filter(l => /TRIAGE:|PASS|MARGINAL|FAIL|SKIP/.test(l) && l.includes('|'));
}

// One retry on a failed batch call — transient gateway/model hiccups are common.
function triageBatchWithRetry(jobs, brief) {
  let v = triageBatch(jobs, brief);
  if (!v) v = triageBatch(jobs, brief);
  return v;
}

// Robust parse: verdict keyword anywhere in the first cells, score anywhere.
function parseVerdict(line) {
  const parts = line.split('|').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  let verdict = null, score = '0.0';
  for (const p of parts.slice(0, 2)) {
    const m = p.match(/\b(PASS|MARGINAL|FAIL|SKIP)\b/i);
    if (m) { verdict = m[1].toUpperCase(); break; }
  }
  for (const p of parts) {
    const m = p.match(/(\d\.\d)\/5/);
    if (m) { score = m[1]; break; }
  }
  if (!verdict) return null;
  const reason = parts.slice(4).join(' | ') || parts.slice(3).join(' | ') || 'no reason given';
  return { verdict, score, reason };
}

// ---- Main ----
if (!existsSync(QUEUE)) { console.error('no triage-queue.tsv — run prefilter first'); process.exit(1); }
const brief = readFileSync(BRIEF, 'utf8');
const done = new Set();
if (existsSync(RESULTS)) {
  for (const l of readFileSync(RESULTS, 'utf8').split('\n')) {
    const u = l.split('\t')[1];
    if (u) done.add(u);
  }
}

const rows = readFileSync(QUEUE, 'utf8').split('\n').filter(Boolean)
  .map(l => { const [company, url, role, location, posted, freshness] = l.split('\t'); return { company, url, role, location, posted, freshness }; })
  .filter(r => !done.has(r.url))
  .slice(0, LIMIT);

if (!rows.length) { console.log('triage: queue empty (all scored)'); process.exit(0); }

console.log(`triage: ${rows.length} jobs to score in ${Math.ceil(rows.length / BATCH)} batch(es)`);
let scored = 0, pass = 0, marginal = 0, fail = 0, skip = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  // fetch JDs (also serves as liveness check)
  for (const j of batch) {
    try {
      const jd = await fetchJd(j.url);
      j.jd = jd ? jd.body : '';
      if (!jd) j.jd = ''; // SKIP verdict below
    } catch { j.jd = ''; }
  }
  const verdicts = triageBatchWithRetry(batch, brief);
  const ts = new Date().toISOString();
  for (let k = 0; k < batch.length; k++) {
    const j = batch[k];
    let verdict, score, reason;
    if (!j.jd) {
      verdict = 'SKIP'; score = '0.0'; reason = 'JD inaccessible — posting likely expired';
    } else if (!verdicts) {
      // Transient failure: do NOT record — the row stays in the queue for the next run.
      console.log(`RETRY | ${j.company} | ${j.role} | triage call failed, will retry next run`);
      continue;
    } else {
      const line = verdicts[k] || '';
      const parsed = parseVerdict(line);
      if (parsed) {
        verdict = parsed.verdict; score = parsed.score; reason = parsed.reason;
      } else {
        // Model omitted the keyword — infer verdict from the score.
        const sm = line.match(/(\d\.\d)\/5/);
        score = sm ? sm[1] : '0.0';
        verdict = score >= '3.5' ? 'PASS' : score >= '3.0' ? 'MARGINAL' : 'FAIL';
        reason = line.split('|').slice(3).join(' | ') || 'no reason given';
      }
    }
    if (verdict === 'PASS') pass++; else if (verdict === 'MARGINAL') marginal++; else if (verdict === 'FAIL') fail++; else skip++;
    scored++;
    if (!DRY) appendFileSync(RESULTS, `${j.company}\t${j.url}\t${j.role}\t${verdict}\t${score}\t${reason}\t${ts}\n`);
    console.log(`${verdict} ${score} | ${j.company} | ${j.role} | ${reason}`);
  }
}
console.log(`done: ${scored} scored — PASS ${pass}, MARGINAL ${marginal}, FAIL ${fail}, SKIP ${skip}`);
