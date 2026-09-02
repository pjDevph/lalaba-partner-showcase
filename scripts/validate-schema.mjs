/**
 * validate-schema.mjs
 *
 * Validates all GraphQL operations in src/services/graphql/*.ts against the
 * backend schema at ../LALABA_BE_DEV/src/schema.gql.
 *
 * The FE uses plain template literals (not gql tags), so GraphQL Inspector
 * cannot parse them directly. This script:
 *   1. Reads each .ts file and extracts uppercase const strings (e.g. ORDER_FIELDS).
 *   2. Finds all template literals that start with query/mutation/fragment/subscription.
 *   3. Resolves ${CONST_NAME} interpolations from the same file.
 *   4. Parses + validates each operation against the BE schema using the graphql library.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildSchema, parse, validate } from "graphql";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir   = join(__dirname, "..");
const beDir     = join(rootDir, "..", "LALABA_BE_DEV");
const schemaPath = join(beDir, "src", "schema.gql");
const gqlDir     = join(rootDir, "src", "services", "graphql");

// ── 1. Load BE schema ─────────────────────────────────────────────────────────

let schema;
try {
  const sdl = readFileSync(schemaPath, "utf8");
  schema = buildSchema(sdl);
  console.log(`Schema loaded: ${schemaPath}\n`);
} catch (e) {
  console.error(`Cannot read schema: ${schemaPath}\n${e.message}`);
  console.error("\nRun the BE at least once to generate schema.gql, then retry.");
  process.exit(1);
}

// ── 2. Scan each service file ─────────────────────────────────────────────────

const files = readdirSync(gqlDir).filter((f) => f.endsWith(".ts")).sort();

let totalOps    = 0;
let totalErrors = 0;
let skipped     = 0;

for (const file of files) {
  const content = readFileSync(join(gqlDir, file), "utf8");

  // Extract uppercase const string variables from this file  e.g.
  //   const ORDER_FIELDS = `_id uid branchId ...`;
  const constMap = {};
  const constRe = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*`([\s\S]*?)`\s*;/g;
  let cm;
  while ((cm = constRe.exec(content)) !== null) {
    constMap[cm[1]] = cm[2];
  }

  // Extract all template literals
  // Note: backtick is a literal character inside a JS regex — no escaping needed.
  const backtickRe = /`([\s\S]*?)`/g;
  let match;
  const ops   = [];
  const errs  = [];

  while ((match = backtickRe.exec(content)) !== null) {
    let op = match[1];

    // Only process operations that start with a GQL keyword
    if (!/^\s*(query|mutation|fragment|subscription)\s/.test(op)) continue;

    // Resolve ${CONST_NAME} → actual string (uppercase identifiers only)
    op = op.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, name) => constMap[name] ?? "");

    // Skip if any runtime interpolations remain (e.g. ${someVariable})
    if (/\$\{/.test(op)) {
      skipped++;
      continue;
    }

    ops.push(op.trim());
  }

  if (ops.length === 0) continue;

  let fileErrors = 0;
  process.stdout.write(`${file.padEnd(30)}`);

  for (const op of ops) {
    totalOps++;
    try {
      const doc       = parse(op);
      const docErrors = validate(schema, doc);

      if (docErrors.length > 0) {
        if (fileErrors === 0) console.log(""); // newline before first error
        for (const e of docErrors) {
          console.error(`  ❌ ${e.message}`);
          totalErrors++;
          fileErrors++;
        }
      }
    } catch (e) {
      if (fileErrors === 0) console.log("");
      console.error(`  ❌ Parse error: ${e.message}`);
      totalErrors++;
      fileErrors++;
    }
  }

  if (fileErrors === 0) {
    console.log(`✅  ${ops.length} op(s)`);
  }
}

// ── 3. Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(55)}`);
console.log(`Checked : ${totalOps} operations across ${files.length} files`);
if (skipped > 0) console.log(`Skipped : ${skipped} (runtime interpolations)`);

if (totalErrors === 0) {
  console.log(`\n✅  All operations are valid against the schema\n`);
} else {
  console.error(`\n❌  ${totalErrors} error(s) found — fix before shipping\n`);
  process.exit(1);
}
