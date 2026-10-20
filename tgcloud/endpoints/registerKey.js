import { EndpointError } from 'sdk';
import { addKey, validateDeepSeekKey } from '../lib/pool.js';

export default async function (input, ctx) {
  const ownerId = String(ctx.initData.user.id);
  const key = typeof input?.key === 'string' ? input.key.trim() : '';

  if (input?.consent !== true) {
    throw new EndpointError('برای عضویت در استخر، ابتدا رضایت خود را تأیید کن.');
  }
  if (key.length < 20 || key.length > 512 || /\s/.test(key)) {
    throw new EndpointError('کلید واردشده کامل نیست. کلید را از صفحهٔ رسمی DeepSeek کپی کن.');
  }

  let valid;
  try {
    valid = await validateDeepSeekKey(key);
  } catch {
    throw new EndpointError('فعلاً امکان بررسی کلید نیست. چند لحظهٔ دیگر دوباره تلاش کن.');
  }
  if (!valid) throw new EndpointError('DeepSeek این کلید را نپذیرفت. کلید دیگری ثبت کن.');

  const result = await addKey(ownerId, key);
  if (result.duplicate) {
    throw new EndpointError('این کلید قبلاً به حساب دیگری در استخر متصل شده است.');
  }
  return { ok: true, message: 'کلید تأیید و به استخر افزوده شد.' };
}
