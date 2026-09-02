import { graphqlRequest } from "../../config/graphql";

export async function gqlUploadMedia(
  base64: string,
  mimeType: string,
  folder: string,
): Promise<string> {
  const res = await graphqlRequest<{ uploadMedia: string }>(`
    mutation UploadMedia($base64: String!, $mimeType: String!, $folder: String!) {
      uploadMedia(base64: $base64, mimeType: $mimeType, folder: $folder)
    }
  `, { base64, mimeType, folder });
  return res.uploadMedia;
}
