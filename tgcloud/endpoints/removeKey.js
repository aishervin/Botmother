import { EndpointError } from 'sdk';
import { removeKey } from '../lib/pool.js';

export default async function (_input, ctx) {
  const ownerId = String(ctx.initData.user.id);
  try {
    await removeKey(ownerId);
  } catch {
    throw new EndpointError('حذف کلید انجام نشد. دوباره تلاش کن.');
  }
  return { ok: true, message: 'کلید از استخر حذف شد.' };
}
