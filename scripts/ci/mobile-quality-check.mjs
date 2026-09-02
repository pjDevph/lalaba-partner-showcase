#!/usr/bin/env node
// Mobile static quality gate (GAP-P0-012).
//
// Scans hand-written .ts/.tsx files under app/ and src/ and:
//   FAILS (exit 1)  if any file exceeds MAX_LINES (default 600)
//   WARNS (exit 0)  with counts of files >500 lines and `style={{` occurrences
//
// Exclusions: *.styles.ts, *.d.ts, __tests__/, generated/, node_modules/.
//
// Flags:
//   --report-only   never fail; print the full report and exit 0
//   --max-lines N   override the hard limit (default 600)
//
// Ratchet plan: repos with pre-existing violations run this step with
// continue-on-error (see workflow). As files are refactored below 600 lines,
// the step is flipped to blocking; the warn threshold (500) then becomes the
// next hard limit. New repos start blocking from day one.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const reportOnly = args.includes('--report-only');
const maxIdx = args.indexOf('--max-lines');
const MAX_LINES = maxIdx !== -1 ? Number(args[maxIdx + 1]) : 600;
const WARN_LINES = 500;

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'src'].map((d) => join(ROOT, d));
const EXCLUDE_DIRS = new Set(['node_modules', '__tests__', 'generated']);

function collect(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!EXCLUDE_DIRS.has(name)) collect(full, out);
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !name.endsWith('.styles.ts') &&
      !name.endsWith('.d.ts') &&
      !/\.(test|spec)\.(ts|tsx)$/.test(name)
    ) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => collect(d));
const over600 = [];
const over500 = [];
let inlineStyleCount = 0;
let inlineStyleFiles = 0;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n').length;
  const rel = relative(ROOT, file);
  if (lines > MAX_LINES) over600.push({ rel, lines });
  else if (lines > WARN_LINES) over500.push({ rel, lines });
  const styleHits = (text.match(/style=\{\{/g) ?? []).length;
  if (styleHits > 0) {
    inlineStyleCount += styleHits;
    inlineStyleFiles += 1;
  }
}

console.log(`mobile-quality-check: scanned ${files.length} files (app/, src/)`);
console.log('');
console.log(
  `WARN  files ${WARN_LINES}-${MAX_LINES} lines: ${over500.length}` +
    (over500.length
      ? '\n' + over500.map((f) => `        ${f.rel} (${f.lines})`).join('\n')
      : ''),
);
console.log(
  `WARN  inline style={{ }} occurrences: ${inlineStyleCount} across ${inlineStyleFiles} files`,
);
console.log('');

if (over600.length > 0) {
  console.log(`FAIL  files over ${MAX_LINES} lines: ${over600.length}`);
  for (const f of over600.sort((a, b) => b.lines - a.lines)) {
    console.log(`        ${f.rel} (${f.lines})`);
  }
  if (!reportOnly) {
    console.log('');
    console.log(
      `Split these files below ${MAX_LINES} lines (extract components/hooks/styles).`,
    );
    process.exit(1);
  }
  console.log('(report-only mode: not failing)');
} else {
  console.log(`OK    no files over ${MAX_LINES} lines`);
}
