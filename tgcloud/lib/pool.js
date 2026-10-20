import { db, fetch } from 'sdk';
import { eq } from 'sdk/db';
import { deepseekKeys } from '../schema.js';
import { POOL_ENCRYPTION_KEY } from './config.js';

const DEEPSEEK_MODELS_URL = 'https://api.deepseek.com/models';
const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-flash';
const LEASE_MS = 90_000;
const DEFAULT_COOLDOWN_MS = 60_000;

function fromHex(value) {
  if (!/^(?:[a-f\d]{2})+$/i.test(value)) throw new Error('Invalid pool encryption key');
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function encryptionKey() {
  if (!/^[a-f\d]{64}$/i.test(POOL_ENCRYPTION_KEY || '')) {
    throw new Error('Pool encryption is not configured');
  }
  return crypto.subtle.importKey('raw', fromHex(POOL_ENCRYPTION_KEY), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function fingerprint(value) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}

export async function encryptKey(value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return `${toHex(iv)}.${toHex(new Uint8Array(ciphertext))}`;
}

async function decryptKey(value) {
  const [ivHex, ciphertextHex] = value.split('.');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromHex(ivHex) },
    await encryptionKey(),
    fromHex(ciphertextHex),
  );
  return new TextDecoder().decode(plaintext);
}

export async function validateDeepSeekKey(value) {
  const response = await fetch(DEEPSEEK_MODELS_URL, {
    headers: { Authorization: `Bearer ${value}` },
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) throw new Error(`DeepSeek key check failed (${response.status})`);
  return true;
}

export async function addKey(ownerId, value) {
  const keyFingerprint = await fingerprint(value);
  const existing = await db.get(
    'SELECT owner_id FROM deepseek_keys WHERE fingerprint = :fingerprint',
    { ':fingerprint': keyFingerprint },
  );
  if (existing && existing.owner_id !== ownerId) return { duplicate: true };

  const current = await db.select().from(deepseekKeys).where(eq(deepseekKeys.ownerId, ownerId)).get();
  const encryptedKey = await encryptKey(value);
  const replacement = current && current.fingerprint !== keyFingerprint;
  const consentedAt = Date.now();

  if (current) {
    await db.run(
      `UPDATE deepseek_keys
       SET encrypted_key = :encrypted_key, fingerprint = :fingerprint, status = :status,
           consented_at = :consented_at,
           cooldown_until = 0, leased_until = 0,
           joined_at = CASE WHEN :replacement = 1 THEN :now ELSE joined_at END,
           last_used_at = CASE WHEN :replacement = 1 THEN 0 ELSE last_used_at END,
           request_count = CASE WHEN :replacement = 1 THEN 0 ELSE request_count END,
           prompt_tokens = CASE WHEN :replacement = 1 THEN 0 ELSE prompt_tokens END,
           completion_tokens = CASE WHEN :replacement = 1 THEN 0 ELSE completion_tokens END,
           failure_count = CASE WHEN :replacement = 1 THEN 0 ELSE failure_count END
       WHERE owner_id = :owner_id`,
      {
        ':encrypted_key': encryptedKey,
        ':fingerprint': keyFingerprint,
        ':status': 'active',
        ':consented_at': consentedAt,
        ':replacement': replacement ? 1 : 0,
        ':now': Date.now(),
        ':owner_id': ownerId,
      },
    );
  } else {
    await db.run(
      `INSERT INTO deepseek_keys
       (owner_id, encrypted_key, fingerprint, status, joined_at, last_used_at,
        consented_at, cooldown_until, leased_until, request_count, prompt_tokens, completion_tokens, failure_count)
       VALUES (:owner_id, :encrypted_key, :fingerprint, :status, :joined_at, 0, :consented_at, 0, 0, 0, 0, 0, 0)`,
      {
        ':owner_id': ownerId,
        ':encrypted_key': encryptedKey,
        ':fingerprint': keyFingerprint,
        ':status': 'active',
        ':joined_at': Date.now(),
        ':consented_at': consentedAt,
      },
    );
  }
  return { duplicate: false };
}

export async function getOwnerKeyStatus(ownerId) {
  return db.select().from(deepseekKeys).where(eq(deepseekKeys.ownerId, ownerId)).get();
}

export async function removeKey(ownerId) {
  await db.delete(deepseekKeys).where(eq(deepseekKeys.ownerId, ownerId)).run();
}

async function leaseKey() {
  const now = Date.now();
  const result = await db.run(
    `UPDATE deepseek_keys
     SET leased_until = :lease_until, last_used_at = :now
     WHERE owner_id = (
       SELECT owner_id FROM deepseek_keys
       WHERE status = 'active' AND cooldown_until <= :now AND leased_until <= :now
       ORDER BY last_used_at ASC, joined_at ASC
       LIMIT 1
     )
     RETURNING owner_id, encrypted_key`,
    { ':lease_until': now + LEASE_MS, ':now': now },
  );
  return result.rows?.[0] ?? null;
}

async function updateAfterUse(ownerId, { status = 'active', cooldownUntil = 0, usage = null, failed = false } = {}) {
  await db.run(
    `UPDATE deepseek_keys
     SET status = :status, cooldown_until = :cooldown_until, leased_until = 0,
         request_count = request_count + :request_count,
         prompt_tokens = prompt_tokens + :prompt_tokens,
         completion_tokens = completion_tokens + :completion_tokens,
         failure_count = failure_count + :failure_count
     WHERE owner_id = :owner_id`,
    {
      ':status': status,
      ':cooldown_until': cooldownUntil,
      ':request_count': usage ? 1 : 0,
      ':prompt_tokens': usage?.prompt_tokens ?? 0,
      ':completion_tokens': usage?.completion_tokens ?? 0,
      ':failure_count': failed ? 1 : 0,
      ':owner_id': ownerId,
    },
  );
}

async function privateUserId(telegramUserId) {
  return fingerprint(`${POOL_ENCRYPTION_KEY}:${telegramUserId}`);
}

export async function completeWithPool(telegramUserId, messages, maxTokens = 900) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const keyRecord = await leaseKey();
    if (!keyRecord) return { unavailable: true };

    try {
      const key = await decryptKey(keyRecord.encrypted_key);
      const response = await fetch(DEEPSEEK_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          max_tokens: maxTokens,
          stream: false,
          user_id: await privateUserId(telegramUserId),
        }),
      });

      if (!response.ok) {
        const status = response.status === 401 || response.status === 403 ? 'invalid' : 'active';
        if (response.status !== 429 && response.status < 500 && status !== 'invalid') {
          await updateAfterUse(keyRecord.owner_id, { failed: true });
          return { error: true };
        }
        const retryHeader = Number(response.headers.get('Retry-After')) || 0;
        const retrySeconds = response.status === 429
          ? Math.min(Math.max(retryHeader || DEFAULT_COOLDOWN_MS / 1000, 1), 900)
          : 60;
        await updateAfterUse(keyRecord.owner_id, {
          status,
          cooldownUntil: Date.now() + retrySeconds * 1000,
          failed: true,
        });
        continue;
      }

      const result = await response.json();
      const text = result.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('DeepSeek returned an empty response');

      try {
        await updateAfterUse(keyRecord.owner_id, { usage: result.usage });
      } catch {
        // Keep the generated answer even if a usage counter write fails.
      }
      return { text };
    } catch {
      await updateAfterUse(keyRecord.owner_id, {
        cooldownUntil: Date.now() + DEFAULT_COOLDOWN_MS,
        failed: true,
      });
    }
  }
  return { unavailable: true };
}
