import { api } from 'sdk';
import { getOwnerKeyStatus } from '../lib/pool.js';
import {
  DEEPSEEK_KEY_URL,
  askAgent,
  buildKeyboard,
  categoryKeyboard,
  clearSession,
  getSession,
  hasActiveMembership,
  poolStatusText,
  saveSession,
  welcomeText,
} from '../lib/botmother.js';
import { WEBAPP_URL } from '../lib/config.js';

function keyButtons() {
  return {
    inline_keyboard: [
      ...(WEBAPP_URL ? [[{ text: '🔐 عضویت / مدیریت کلید استخر', web_app: { url: WEBAPP_URL } }]] : []),
      [{ text: 'ساخت کلید رسمی DeepSeek', url: DEEPSEEK_KEY_URL }],
    ],
  };
}

export default async function (message) {
  if (!message?.from?.id || !message?.chat?.id) return;
  const userId = String(message.from.id);
  const chatId = message.chat.id;
  const text = (message.text || '').trim();

  if (text === '/start') {
    const member = await hasActiveMembership(userId);
    await clearSession(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: welcomeText(message.from.first_name, member),
      reply_markup: member ? categoryKeyboard() : keyButtons(),
    });
    return;
  }

  if (text === '/help') {
    await api.sendMessage({
      chat_id: chatId,
      text: `دستورها:\n/start شروع یا بازگشت به منو\n/new شروع ایدهٔ تازه\n/pool نمایش وضعیت کلید مشارکتی\n\nکلید را فقط از Mini App ثبت کن؛ در پیام چت نفرست.\nDeepSeek: ${DEEPSEEK_KEY_URL}`,
    });
    return;
  }

  if (text === '/new') {
    await clearSession(userId);
    await api.sendMessage({ chat_id: chatId, text: 'یک دسته انتخاب کن یا /start را بزن.', reply_markup: categoryKeyboard() });
    return;
  }

  if (text === '/pool') {
    const status = await getOwnerKeyStatus(userId);
    await api.sendMessage({ chat_id: chatId, text: poolStatusText(status) });
    return;
  }

  if (!text || text.startsWith('/')) return;
  if (!(await hasActiveMembership(userId))) {
    await api.sendMessage({
      chat_id: chatId,
      text: 'برای فعال شدن خدمات، ابتدا کلید مشارکتی‌ات را در Mini App ثبت کن.',
      reply_markup: keyButtons(),
    });
    return;
  }

  const state = await getSession(userId);
  if (!state.templateId) {
    await api.sendMessage({ chat_id: chatId, text: 'برای شروع، یک دسته انتخاب کن.', reply_markup: categoryKeyboard() });
    return;
  }

  let result;
  try {
    result = await askAgent(userId, state, text);
  } catch {
    await api.sendMessage({ chat_id: chatId, text: 'فعلاً پاسخ آماده نشد. کمی بعد دوباره تلاش کن.' });
    return;
  }
  if (result.unavailable) {
    await api.sendMessage({
      chat_id: chatId,
      text: 'همهٔ کلیدهای استخر موقتاً در حال استفاده یا استراحت هستند. کمی بعد دوباره پیام بده.',
    });
    return;
  }
  if (result.error) {
    await api.sendMessage({ chat_id: chatId, text: 'پاسخ DeepSeek آماده نشد؛ متن را کوتاه‌تر کن یا دوباره تلاش کن.' });
    return;
  }
  state.history = result.history;
  state.brief = [...(state.brief || []), text].slice(-8).join('\n');
  await saveSession(userId, state);
  await api.sendMessage({ chat_id: chatId, text: result.text, reply_markup: buildKeyboard() });
}
