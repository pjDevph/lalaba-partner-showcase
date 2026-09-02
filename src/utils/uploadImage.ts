import { gqlUploadMedia } from "../services/graphql/media";

function mimeFromUri(uri: string): string {
  const ext = uri.split(".").pop()?.toLowerCase();
  if (ext === "png")  return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export async function uploadImageToStorage(
  localUri: string,
  storagePath: string,
): Promise<string> {
  const response    = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  const base64      = Buffer.from(arrayBuffer).toString("base64");
  const mimeType    = mimeFromUri(localUri);

  const folder = storagePath.includes("/")
    ? storagePath.substring(0, storagePath.lastIndexOf("/"))
    : "uploads";

  return gqlUploadMedia(base64, mimeType, folder);
}
