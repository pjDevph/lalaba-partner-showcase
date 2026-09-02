// src/components/chat/pickChatImage.ts
// Picking a photo to send in a chat thread — shared by the provider
// (washer/merchant) thread and the courier-leg thread, the two places a chat
// composer offers an attach button.
//
// Mirrors the permission/picker mechanics already established in
// src/features/verification/pickDocument.ts and app/(washer)/store.tsx
// (permission → launch picker → FileSystem base64), but is its own small
// module: chat images go through uploadChatImage/sendMessage, not
// gqlSubmitKycDocument or gqlUploadMedia, and the caller here needs a Camera
// vs Photo Library CHOICE up front rather than a single fixed source.

import * as ImagePicker from "expo-image-picker";
// `/legacy`: SDK 54 moved the function API here. The root export still has a
// `readAsStringAsync`, but it is a deprecation stub that throws at runtime.
import * as FileSystem from "expo-file-system/legacy";
import { showAlert, showChoice } from "../../lib/dialog";

// Matches the BE's uploadChatImage mimeType allowlist.
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function mimeFromUri(uri: string): string {
  const ext = uri.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

async function fromCamera(): Promise<ImagePicker.ImagePickerAsset | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    showAlert("Camera access needed", "Allow camera access to take a photo.");
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
}

async function fromLibrary(): Promise<ImagePicker.ImagePickerAsset | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    showAlert("Photo access needed", "Allow photo library access to send a photo.");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
}

/**
 * Prompts Camera vs Photo Library through the app's own dialog, then reads the
 * picked image into base64. Resolves null if the user cancels at any step;
 * never throws for a cancel.
 *
 * This was a native Alert action sheet. It could not be styled to match the
 * app, could not be driven in a test, and was the one place a modal appeared
 * that looked like nothing else in the product — so the dialog store grew a
 * `choice` variant rather than this keeping its own.
 */
export function pickChatImage(): Promise<{ base64: string; mimeType: string } | null> {
  return new Promise((resolve) => {
    showChoice(
      "Send a photo",
      [
        {
          label: "Camera",
          onPress: () => { void fromCamera().then(readAsset).then(resolve); },
        },
        {
          label: "Photo Library",
          onPress: () => { void fromLibrary().then(readAsset).then(resolve); },
        },
      ],
      // Cancel, the backdrop and the back button all land here, so the caller
      // is never left awaiting a promise that cannot settle.
      { onCancel: () => resolve(null) },
    );
  });
}

async function readAsset(
  asset: ImagePicker.ImagePickerAsset | null,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!asset) return null;
  const mimeType = asset.mimeType && ALLOWED_MIME_TYPES.includes(asset.mimeType)
    ? asset.mimeType
    : mimeFromUri(asset.uri);
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" });
  return { base64, mimeType };
}
