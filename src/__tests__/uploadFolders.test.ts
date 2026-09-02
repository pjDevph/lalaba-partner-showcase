// Every upload destination in this app must be one the backend will accept.
//
// media.service.ts allowlists the FIRST path segment of the caller-supplied
// folder (RISK-P0-002 — it keeps caller-chosen paths away from kyc/evidence
// roots). A folder whose root is not on that list fails with "Invalid upload
// destination.", and the failure only shows up when someone actually picks an
// image on a real device.
//
// That has now happened twice: "washer-store-header"/"washer-store-featured"
// on the washer store screen, then "branch-logo"/"branch-cover" on the branch
// branding editor. Both were plausible-looking names that no test covered.
// This walks the source instead of trusting review.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Mirrors PUBLIC_MEDIA_FOLDER_ALLOWLIST in LALABA_BE_DEV/src/media/media.service.ts.
// If the backend list changes, this must change with it — that is the point:
// the two are a contract, and a silent drift between them is the bug.
const ALLOWED_ROOTS = [
  "branding",
  "branches",
  "washers",
  "products",
  "profiles",
  "uploads",
];

const ROOT = path.resolve(__dirname, "../..");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Folder literals handed to an upload call, or held in a *_FOLDER constant. */
function uploadFolderLiterals(src: string): string[] {
  const found: string[] = [];
  const patterns = [
    /(?:gqlUploadMedia|uploadIfLocal)\s*\([^)]*?["'`]([a-zA-Z0-9_\-/]+)["'`]\s*\)/g,
    /[A-Z_]*FOLDER[A-Z_]*\s*=\s*["'`]([a-zA-Z0-9_\-/]+)["'`]/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) found.push(m[1]);
  }
  return found;
}

describe("upload destinations", () => {
  const files = sourceFiles(path.join(ROOT, "src")).concat(
    sourceFiles(path.join(ROOT, "app")),
  );

  const destinations = files.flatMap((f) =>
    uploadFolderLiterals(readFileSync(f, "utf8")).map((folder) => ({
      folder,
      file: path.relative(ROOT, f),
    })),
  );

  it("finds the upload destinations to check", () => {
    // A guard on the scan itself: if a refactor renames the helpers, this test
    // would silently pass by checking nothing at all.
    expect(destinations.length).toBeGreaterThan(0);
  });

  it.each(destinations.length ? destinations : [{ folder: "branches/logo", file: "(none found)" }])(
    'accepts "$folder" ($file)',
    ({ folder }) => {
      expect(ALLOWED_ROOTS).toContain(folder.split("/")[0]);
    },
  );

  it("rejects the two spellings that actually shipped broken", () => {
    for (const bad of ["branch-logo", "branch-cover", "washer-store-header"]) {
      expect(ALLOWED_ROOTS).not.toContain(bad.split("/")[0]);
    }
  });
});
