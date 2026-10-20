import { integer, table, text } from 'sdk/db';

export const sessions = table('user_sessions', {
  userId: text('user_id').primaryKey(),
  state: text('state').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const deepseekKeys = table('deepseek_keys', {
  ownerId: text('owner_id').primaryKey(),
  encryptedKey: text('encrypted_key').notNull(),
  fingerprint: text('fingerprint').notNull(),
  status: text('status').notNull().default('active'),
  joinedAt: integer('joined_at').notNull(),
  consentedAt: integer('consented_at').notNull(),
  lastUsedAt: integer('last_used_at').notNull().default(0),
  cooldownUntil: integer('cooldown_until').notNull().default(0),
  leasedUntil: integer('leased_until').notNull().default(0),
  requestCount: integer('request_count').notNull().default(0),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
});
