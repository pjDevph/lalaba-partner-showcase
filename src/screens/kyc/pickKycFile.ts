// src/screens/kyc/pickKycFile.ts
// File picking for KYC evidence. The BE allowlist (src/kyc/kyc.service.ts,
// KYC_MIME_EXTENSIONS) accepts images (JPEG/JPG/PNG/WebP/HEIC), PDF and DOCX,
// with a ~5 MB decoded cap (MAX_BASE64_LENGTH = 7 MB of base64 characters).
// Images come from the photo library; PDF/DOCX from the document picker.

import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
// `/legacy`: SDK 54 moved the function API here. The root export still has a
// `readAsStringAsync`, but it is a deprecation stub that throws at runtime.
import * as FileSystem from "expo-file-system/legacy";

/** MIME types the backend accepts for KYC evidence — keep in step with the BE map. */
export const KYC_ALLOWED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Decoded-size cap; mirrors the BE's 5 MB limit. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface PickedKycFile {
  base64: string;
  mimeType: string;
  /** Display name for the picked file, when the picker supplied one. */
  fileName: string | null;
}

export type PickFailure =
  | { kind: "cancelled" }
  | { kind: "permission" }
  | { kind: "too-large" }
  | { kind: "unsupported"; mimeType: string }
  | { kind: "unreadable" };

export type PickResult = { ok: true; file: PickedKycFile } | { ok: false; reason: PickFailure };

/** base64 expands ~4/3 over raw bytes — decode the length rather than the string. */
export function decodedByteLength(base64: string): number {
  const clean = base64.replace(/=+$/, "");
  return Math.floor((clean.length * 3) / 4);
}

/** Derive an accepted MIME type from a picker-reported type and/or filename. */
export function resolveMimeType(reported: string | null | undefined, nameOrUri: string): string | null {
  const lower = (reported ?? "").toLowerCase().split(";")[0].trim();
  if ((KYC_ALLOWED_MIME as readonly string[]).includes(lower)) return lower;

  const ext = (nameOrUri.split("?")[0].split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png":  return "image/png";
    case "webp": return "image/webp";
    case "heic": return "image/heic";
    case "pdf":  return "application/pdf";
    case "docx": return DOCX_MIME;
    default:     return null;
  }
}

function validate(base64: string, mimeType: string | null, fileName: string | null): PickResult {
  if (!mimeType) {
    return { ok: false, reason: { kind: "unsupported", mimeType: fileName ?? "unknown" } };
  }
  if (decodedByteLength(base64) > MAX_FILE_BYTES) {
    return { ok: false, reason: { kind: "too-large" } };
  }
  return { ok: true, file: { base64, mimeType, fileName } };
}

/** Pick a photo from the library. */
export async function pickKycImage(): Promise<PickResult> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") return { ok: false, reason: { kind: "permission" } };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return { ok: false, reason: { kind: "cancelled" } };

  const asset = result.assets[0];
  if (!asset.base64) return { ok: false, reason: { kind: "unreadable" } };
  const name = asset.fileName ?? null;
  return validate(asset.base64, resolveMimeType(asset.mimeType, name ?? asset.uri), name);
}

/** Pick a PDF or Word document. */
export async function pickKycDocument(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", DOCX_MIME],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return { ok: false, reason: { kind: "cancelled" } };

  const asset = result.assets[0];
  const name = asset.name ?? null;
  const mimeType = resolveMimeType(asset.mimeType, name ?? asset.uri);
  if (!mimeType) {
    return { ok: false, reason: { kind: "unsupported", mimeType: asset.mimeType ?? name ?? "unknown" } };
  }
  // Cheap pre-check on the reported size before reading the whole file in.
  if (typeof asset.size === "number" && asset.size > MAX_FILE_BYTES) {
    return { ok: false, reason: { kind: "too-large" } };
  }

  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" });
  } catch {
    return { ok: false, reason: { kind: "unreadable" } };
  }
  return validate(base64, mimeType, name);
}

/** User-facing copy for a failed pick (never a raw picker error). */
export function pickFailureMessage(reason: PickFailure): { title: string; message: string } | null {
  switch (reason.kind) {
    case "cancelled":
      return null; // user backed out — say nothing
    case "permission":
      return { title: "Permission required", message: "Please allow photo access to upload your document." };
    case "too-large":
      return { title: "File too large", message: "Please pick a file under 5 MB." };
    case "unsupported":
      return { title: "File type not supported", message: "Upload an image (JPG, PNG, WebP, HEIC), a PDF, or a Word document (.docx)." };
    case "unreadable":
      return { title: "Couldn't read that file", message: "Please try again or pick a different file." };
  }
}
