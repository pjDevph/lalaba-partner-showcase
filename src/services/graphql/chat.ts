// src/services/graphql/chat.ts
// Partner-side chat with customers, against the shared BE `chat` module. Serves
// two roles off the same operations (myConversations returns whichever threads
// the caller participates in — the non-customer side is always `providerUid`):
//   • Washer / merchant → PROVIDER threads (one per customer, spanning orders).
//   • Courier → COURIER threads (one per customer+order+leg — the rider assigned
//     to that leg). `kind`/`legType` distinguish them.

import { graphqlRequest } from "../../config/graphql";

export type ConversationKind = "PROVIDER" | "COURIER";
export type ChatLegType = "PICKUP" | "RETURN";

export interface Conversation {
  _id: string;
  customerUid: string;
  customerName: string;
  providerUid: string;
  branchId: string;
  providerType: string;
  providerName: string;
  kind: ConversationKind;
  legType: ChatLegType | null;
  /** Closed to new replies for the viewer. Resolved per-viewer: a courier
   *  thread ends for the rider at handover, never for the customer. */
  ended: boolean;
  /** Whether the thread's provider currently holds the Verified badge.
   *  Resolved live off the provider, so it always agrees with their profile.
   *  Always false on courier threads — riders have no verification. */
  providerVerified: boolean;
  orderId: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  customerUnread: number;
  providerUnread: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Message {
  _id: string;
  conversationId: string;
  senderUid: string;
  senderRole: string; // CUSTOMER | WASHER | MERCHANT | COURIER | SYSTEM | SUPPORT
  text: string;
  /** Signed, short-lived read URL for an image message. Null if no image, or
   *  if the viewer isn't a participant. Resolved per-viewer by the BE. */
  imageUrl: string | null;
  createdAt: string | null;
}

const CONVERSATION_FIELDS = `
  _id customerUid customerName providerUid branchId providerType providerName
  kind legType ended providerVerified
  orderId lastMessageText lastMessageAt customerUnread providerUnread createdAt updatedAt
`;
const MESSAGE_FIELDS = `_id conversationId senderUid senderRole text imageUrl createdAt`;

export async function gqlMyConversations(): Promise<Conversation[]> {
  const data = await graphqlRequest<{ myConversations: Conversation[] }>(
    `query MyConversations { myConversations { ${CONVERSATION_FIELDS} } }`,
  );
  return data.myConversations;
}

export async function gqlConversationMessages(conversationId: string): Promise<Message[]> {
  const data = await graphqlRequest<{ conversationMessages: Message[] }>(
    `query ConversationMessages($conversationId: ID!) {
       conversationMessages(conversationId: $conversationId) { ${MESSAGE_FIELDS} }
     }`,
    { conversationId },
  );
  return data.conversationMessages;
}

/**
 * Send a message. At least one of `text`/`imageKey` must be present — the BE
 * rejects an empty pair. `imageKey` comes from `gqlUploadChatImage`, called
 * first since the mutation only accepts the opaque storage key, not the file
 * itself.
 */
export async function gqlSendMessage(
  conversationId: string,
  body: { text?: string; imageKey?: string },
): Promise<Message> {
  const data = await graphqlRequest<{ sendMessage: Message }>(
    `mutation SendMessage($input: SendMessageInput!) {
       sendMessage(input: $input) { ${MESSAGE_FIELDS} }
     }`,
    { input: { conversationId, text: body.text, imageKey: body.imageKey } },
  );
  return data.sendMessage;
}

/**
 * Uploads an image for a chat message and returns its opaque storage key.
 * Upload first, then pass the key into `gqlSendMessage({ imageKey })` — the
 * mutation itself never accepts raw image bytes. Restricted server-side to
 * image/jpeg|png|webp, 8MB max; caller must be a conversation participant and
 * the thread must not be ended.
 */
export async function gqlUploadChatImage(
  conversationId: string,
  base64: string,
  mimeType: string,
): Promise<string> {
  const data = await graphqlRequest<{ uploadChatImage: string }>(
    `mutation UploadChatImage($conversationId: ID!, $base64: String!, $mimeType: String!) {
       uploadChatImage(conversationId: $conversationId, base64: $base64, mimeType: $mimeType)
     }`,
    { conversationId, base64, mimeType },
  );
  return data.uploadChatImage;
}

/**
 * Find-or-create the customer↔rider thread for one leg of an order.
 *
 * The BE lets the assigned rider call this only while they're actually working
 * the leg (from "Start navigation" until handover) — before or after that it
 * throws, which is why callers gate the button on the same condition rather
 * than relying on the error. Idempotent: a thread the customer already opened
 * is returned as-is, not duplicated.
 */
export async function gqlStartCourierConversation(
  orderId: string,
  leg: "PICKUP" | "RETURN",
): Promise<Conversation> {
  const data = await graphqlRequest<{ startCourierConversation: Conversation }>(
    `mutation StartCourierConversation($input: StartCourierConversationInput!) {
       startCourierConversation(input: $input) { ${CONVERSATION_FIELDS} }
     }`,
    { input: { orderId, leg } },
  );
  return data.startCourierConversation;
}
