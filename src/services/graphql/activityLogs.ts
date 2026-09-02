// src/services/graphql/activityLogs.ts
// GraphQL operations for the activity-logs domain.

import { graphqlRequest } from "../../config/graphql";

// ─── BE shapes ────────────────────────────────────────────────────────────────

export interface GqlActivityLog {
  _id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorType: string;
  merchantId: string;
  action: string;
  module: string;
  targetId?: string;
  targetName?: string;
  metadata?: string;
  status: string;
  errorMessage?: string;
  createdAt?: string;
}

// ─── Fields ───────────────────────────────────────────────────────────────────

const LOG_FIELDS = `
  _id actorId actorName actorEmail actorType merchantId
  action module targetId targetName metadata status errorMessage createdAt
`;

// ─── Queries ──────────────────────────────────────────────────────────────────

export interface GqlActivityLogsPage {
  data: GqlActivityLog[];
  total: number;
}

export async function gqlMyActivityLogs(filter?: {
  actorId?: string;
  module?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<GqlActivityLogsPage> {
  const res = await graphqlRequest<{ myActivityLogs: GqlActivityLogsPage }>(`
    query MyActivityLogs($filter: ActivityLogFilterInput) {
      myActivityLogs(filter: $filter) {
        data { ${LOG_FIELDS} }
        total
      }
    }
  `, { filter: { limit: 10, offset: 0, ...filter } });
  return res.myActivityLogs;
}
