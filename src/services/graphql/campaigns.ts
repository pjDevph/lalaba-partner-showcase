// src/services/graphql/campaigns.ts
// Popup campaigns — the advertisement the backend decides to show.
//
// The app sends no role and no audience: the backend derives both from the
// authenticated identity, so a campaign meant for merchants can never be
// pulled by asking nicely. It also decides FREQUENCY — this app does not
// remember what it has already shown, because a local flag would reset on
// reinstall and a "once only" popup would come back.

import { graphqlRequest } from "../../config/graphql";

export type CampaignActionType = "NONE" | "PROMO" | "DEEP_LINK";

export interface CampaignPopup {
  _id: string;
  name: string;
  imageUrl: string;
  altText: string | null;
  actionType: CampaignActionType;
  promoId: string | null;
  deepLink: string | null;
}

const FIELDS = `_id name imageUrl altText actionType promoId deepLink`;

/**
 * The one campaign due right now, or null — which is the normal answer.
 *
 * `sessionId` identifies this sign-in for "every login" campaigns. It is
 * generated client-side and is not a credential: the worst a forged one buys
 * is seeing an advertisement again.
 */
export async function gqlNextCampaign(
  sessionId: string | null,
): Promise<CampaignPopup | null> {
  const data = await graphqlRequest<{ nextCampaign: CampaignPopup | null }>(
    `query NextCampaign($sessionId: String) {
       nextCampaign(sessionId: $sessionId) { ${FIELDS} }
     }`,
    { sessionId },
  );
  return data.nextCampaign ?? null;
}

export async function gqlMarkCampaignClicked(campaignId: string): Promise<void> {
  await graphqlRequest(
    `mutation MarkCampaignClicked($campaignId: ID!) {
       markCampaignClicked(campaignId: $campaignId)
     }`,
    { campaignId },
  );
}

export async function gqlMarkCampaignDismissed(campaignId: string): Promise<void> {
  await graphqlRequest(
    `mutation MarkCampaignDismissed($campaignId: ID!) {
       markCampaignDismissed(campaignId: $campaignId)
     }`,
    { campaignId },
  );
}
