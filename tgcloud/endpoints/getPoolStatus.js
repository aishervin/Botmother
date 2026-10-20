import { db } from 'sdk';
import { eq } from 'sdk/db';
import { deepseekKeys } from '../schema.js';

export default async function (_input, ctx) {
  const ownerId = String(ctx.initData.user.id);
  const row = await db.select().from(deepseekKeys).where(eq(deepseekKeys.ownerId, ownerId)).get();
  if (!row) return { joined: false };
  return {
    joined: true,
    status: row.status,
    requestCount: row.requestCount,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    joinedAt: row.joinedAt,
  };
}
