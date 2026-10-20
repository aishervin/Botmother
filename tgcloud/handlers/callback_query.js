import { InputFile, api } from 'sdk';
import { getOwnerKeyStatus } from '../lib/pool.js';
import {
  CATEGORIES,
  DEEPSEEK_KEY_URL,
  buildKeyboard,
  categoryKeyboard,
  generateBotSource,
  getSession,
  hasActiveMembership,
  poolStatusText,
  saveSession,
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

export default async function (query) {
  if (!query?.from?.id) return;
  await api.answerCallbackQuery({ callback_query_id: query.id });
  const userId = String(query.from.id);
  const chatId = query.message?.chat?.id || query.from.id;
  const messageId = query.message?.message_id;
  const data = query.data || '';

  if (data === 'menu') {
    await api.sendMessage({ chat_id: chatId, text: 'دستهٔ مورد نظرت را انتخاب کن:', reply_markup: categoryKeyboard() });
    return;
  }

  if (data === 'pool:help') {
    const status = await getOwnerKeyStatus(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: `${poolStatusText(status)}\n\nبرای حذف یا جایگزینی کلید از Mini App استفاده کن.`,
      reply_markup: keyButtons(),
    });
    return;
  }

  if (data.startsWith('cat:')) {
    if (!(await hasActiveMembership(userId))) {
      await api.sendMessage({ chat_id: chatId, text: 'برای استفاده، ابتدا کلیدت را در استخر ثبت کن.', reply_markup: keyButtons() });
      return;
    }
    const templateId = data.slice(4);
    const category = CATEGORIES[templateId];
    if (!category) return;
    const state = { templateId, title: category.title, step: 'requirements', history: [], brief: '' };
    await saveSession(userId, state);
    await api.sendMessage({
      chat_id: chatId,
      text: `دستهٔ «${category.title}» انتخاب شد.\n\nرباتت چه کاری انجام بدهد؟ نیازها و ویژگی‌های مهم را در چند جمله بنویس. بعد می‌توانی با دکمهٔ پایین فایل سورس اولیه را بسازی.`,
      reply_markup: buildKeyboard(),
    });
    return;
  }

  if (data === 'build:source') {
    if (!(await hasActiveMembership(userId))) {
      await api.sendMessage({ chat_id: chatId, text: 'برای استفاده، ابتدا کلیدت را در استخر ثبت کن.', reply_markup: keyButtons() });
      return;
    }
    const state = await getSession(userId);
    if (!state.templateId) {
      await api.sendMessage({ chat_id: chatId, text: 'ابتدا یک دسته انتخاب کن.', reply_markup: categoryKeyboard() });
      return;
    }

    await api.sendChatAction({ chat_id: chatId, action: 'typing' });
    let generated;
    try {
      generated = await generateBotSource(userId, state);
    } catch {
      await api.sendMessage({ chat_id: chatId, text: 'فعلاً ساخت سورس انجام نشد. کمی بعد دوباره تلاش کن.' });
      return;
    }
    if (generated.unavailable) {
      await api.sendMessage({ chat_id: chatId, text: 'همهٔ کلیدهای استخر موقتاً مشغول‌اند. کمی بعد دوباره تلاش کن.' });
      return;
    }
    if (generated.error) {
      await api.sendMessage({ chat_id: chatId, text: 'DeepSeek نتوانست سورس را بسازد؛ کمی بعد دوباره تلاش کن.' });
      return;
    }
    state.source = generated;
    await saveSession(userId, state);
    const bytes = new TextEncoder().encode(generated);
    await api.sendDocument({
      chat_id: chatId,
      document: new InputFile(bytes, `botmother-${state.templateId}.js`, { type: 'text/javascript' }),
      caption: 'سورس اولیهٔ Telegram Serverless آماده شد. پیش از انتشار، کد را مرور و با tgcloud run آزمایش کن.',
    });
    if (messageId) {
      await api.sendMessage({
        chat_id: chatId,
        text: 'برای ساخت فایل تازه، ایده‌ات را در همین گفت‌وگو تکمیل کن یا دستهٔ دیگری انتخاب کن.',
        reply_markup: categoryKeyboard(),
      });
    }
    return;
  }
}
