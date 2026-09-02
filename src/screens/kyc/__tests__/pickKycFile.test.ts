// src/screens/kyc/__tests__/pickKycFile.test.ts
// MIME derivation + size accounting for KYC evidence must match the BE
// allowlist (src/kyc/kyc.service.ts KYC_MIME_EXTENSIONS) and its ~5 MB decoded
// cap — a wrong MIME is a hard BadRequest at submit time.

jest.mock("expo-image-picker", () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(), MediaTypeOptions: { Images: "Images" } }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({ readAsStringAsync: jest.fn() }));

import {
  resolveMimeType,
  decodedByteLength,
  pickFailureMessage,
  KYC_ALLOWED_MIME,
  MAX_FILE_BYTES,
} from "../pickKycFile";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("KYC_ALLOWED_MIME", () => {
  it("matches the BE allowlist exactly", () => {
    expect([...KYC_ALLOWED_MIME].sort()).toEqual([
      DOCX,
      "application/pdf",
      "image/heic",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ].sort());
  });
});

describe("resolveMimeType", () => {
  it("passes through allowlisted types reported by the picker", () => {
    expect(resolveMimeType("image/png", "x.png")).toBe("image/png");
    expect(resolveMimeType("application/pdf", "permit.pdf")).toBe("application/pdf");
    expect(resolveMimeType(DOCX, "permit.docx")).toBe(DOCX);
  });

  it("normalizes case and strips charset parameters", () => {
    expect(resolveMimeType("IMAGE/PNG", "x.png")).toBe("image/png");
    expect(resolveMimeType("application/pdf; charset=binary", "x.pdf")).toBe("application/pdf");
  });

  it("falls back to the filename extension when the picker reports nothing useful", () => {
    expect(resolveMimeType(null, "scan.pdf")).toBe("application/pdf");
    expect(resolveMimeType(undefined, "id.JPG")).toBe("image/jpeg");
    expect(resolveMimeType("application/octet-stream", "clearance.docx")).toBe(DOCX);
    expect(resolveMimeType(null, "file:///tmp/a/photo.heic?x=1")).toBe("image/heic");
  });

  it("returns null for types the backend would reject", () => {
    expect(resolveMimeType("application/zip", "a.zip")).toBeNull();
    expect(resolveMimeType("text/plain", "notes.txt")).toBeNull();
    expect(resolveMimeType(null, "noextension")).toBeNull();
    expect(resolveMimeType("application/msword", "old.doc")).toBeNull();
  });
});

describe("decodedByteLength", () => {
  it("computes decoded bytes, ignoring padding", () => {
    // "hello" → aGVsbG8= : 5 bytes
    expect(decodedByteLength("aGVsbG8=")).toBe(5);
  });

  it("puts the 5 MB cap in the right place", () => {
    const underCap = "A".repeat(Math.floor((MAX_FILE_BYTES * 4) / 3) - 8);
    const overCap = "A".repeat(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8);
    expect(decodedByteLength(underCap)).toBeLessThanOrEqual(MAX_FILE_BYTES);
    expect(decodedByteLength(overCap)).toBeGreaterThan(MAX_FILE_BYTES);
  });
});

describe("pickFailureMessage", () => {
  it("says nothing when the user cancels", () => {
    expect(pickFailureMessage({ kind: "cancelled" })).toBeNull();
  });

  it("gives actionable copy for real failures, never a raw type string", () => {
    expect(pickFailureMessage({ kind: "too-large" })?.message).toMatch(/5 MB/);
    const unsupported = pickFailureMessage({ kind: "unsupported", mimeType: "application/zip" });
    expect(unsupported?.message).toMatch(/PDF/);
    expect(unsupported?.message).not.toMatch(/application\/zip/);
    expect(pickFailureMessage({ kind: "permission" })?.title).toMatch(/permission/i);
    expect(pickFailureMessage({ kind: "unreadable" })?.title).toMatch(/couldn/i);
  });
});
