// src/features/verification/pickDocument.ts
// Picking a verification document and getting it to the backend.
//
// Adapted from the working pattern in app/(washer)/store.tsx (permission →
// launch picker → FileSystem.readAsStringAsync base64), with two deliberate
// differences:
//
//  1. Uploads go through gqlSubmitKycDocument, NEVER gqlUploadMedia. uploadMedia
//     writes to the PUBLIC branding bucket; identity documents belong in the
//     private evidence store with a server-derived key.
//  2. The MIME type comes from the picker asset rather than a png/jpeg guess off
//     the extension — the backend allowlist checks it, and HEIC photos from
//     iPhones would otherwise be mislabelled and rejected.

import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
// `/legacy`: SDK 54 moved the function API here. The root export still has a
// `readAsStringAsync`, but it is a deprecation stub that throws at runtime.
import * as FileSystem from "expo-file-system/legacy";
import { showAlert } from "../../lib/dialog";

// Matches the backend's KYC_MIME_EXTENSIONS allowlist.
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// The backend caps the base64 payload at 7 MiB (~5 MB of file). Checking here
// avoids pushing a doomed multi-megabyte body over a mobile connection just to
// have it rejected.
const MAX_BASE64_LENGTH = 7 * 1024 * 1024;

export interface PickedDocument {
  uri: string;
  mimeType: string;
  /** Present for files chosen with the document picker. */
  name?: string;
}

function mimeFromUri(uri: string): string {
  const ext = uri.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "image/jpeg";
  }
}

// There is deliberately no library picker here. "Choose photo" duplicated
// "Upload file" — the document picker already reaches the photo library and
// also accepts PDFs and Word files — so the verification cards offer just
// "Take photo" and "Upload file".

/** Take a new photo. Used where a stored image would defeat the point. */
export async function pickFromCamera(): Promise<PickedDocument | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    showAlert(
      "Camera access needed",
      "Allow camera access so you can take this photo.",
    );
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? mimeFromUri(asset.uri),
  };
}

/** Choose a PDF or Word file — how DTI and BIR certificates usually arrive. */
export async function pickFile(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ALLOWED_MIME_TYPES,
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? mimeFromUri(asset.uri),
    name: asset.name,
  };
}

export class DocumentTooLargeError extends Error {
  constructor() {
    super("That file is larger than 5 MB. Try a smaller photo or scan.");
    this.name = "DocumentTooLargeError";
  }
}

export class UnsupportedDocumentTypeError extends Error {
  constructor() {
    super(
      "That file type isn't supported. Upload an image (JPG, PNG or HEIC), a PDF, or a Word document.",
    );
    this.name = "UnsupportedDocumentTypeError";
  }
}

/**
 * Reads a picked document into base64, rejecting anything the backend would
 * refuse anyway. Throws DocumentTooLargeError / UnsupportedDocumentTypeError so
 * callers can surface the message directly.
 */
export async function readForUpload(
  picked: PickedDocument,
): Promise<{ base64: string; mimeType: string }> {
  if (!ALLOWED_MIME_TYPES.includes(picked.mimeType)) {
    throw new UnsupportedDocumentTypeError();
  }
  const base64 = await FileSystem.readAsStringAsync(picked.uri, {
    encoding: "base64",
  });
  if (base64.length > MAX_BASE64_LENGTH) {
    throw new DocumentTooLargeError();
  }
  return { base64, mimeType: picked.mimeType };
}
