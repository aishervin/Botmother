import { InputFile, api } from 'sdk';
import { getOwnerKeyStatus } from '../lib/pool.js';
import {
  CATEGORIES,
  DEEPSEEK_KEY_URL,
  askAgent,
  buildKeyboard,
  categoryKeyboard,
  clearSession,
  generateBotSource,
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

  // Command: /start
  if (text === '/start') {
    const member = await hasActiveMembership(userId);
    await clearSession(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: welcomeText(message.from.first_name, member),
      reply_markup: categoryKeyboard(WEBAPP_URL),
    });
    return;
  }

  // Command: /help
  if (text === '/help') {
    await api.sendMessage({
      chat_id: chatId,
      text: `🤖 **راهنمای Botmother Studio**:\n\n` +
        `• /start — شروع مجدد و مشاهده دسته‌ها\n` +
        `• /new — شروع ایدهٔ تازه\n` +
        `• /build — ساخت و دریافت فوری فایل سورس ربات\n` +
        `• /pool — مشاهده وضعیت کلید مشارکتی DeepSeek\n\n` +
        `💡 می‌توانید در چت بنویسید چه رباتی می‌خواهید، یا دسته‌ای انتخاب کنید. سپس برای دریافت فایل سورس، «/build» یا دکمه ساخت سورس را بزنید.`,
      reply_markup: categoryKeyboard(WEBAPP_URL),
    });
    return;
  }

  // Command: /new
  if (text === '/new') {
    await clearSession(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: '✨ یک دسته را انتخاب کنید یا توضیحات ربات مدنظرتان را ارسال نمایید:',
      reply_markup: categoryKeyboard(WEBAPP_URL),
    });
    return;
  }

  // Command: /pool
  if (text === '/pool') {
    const status = await getOwnerKeyStatus(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: poolStatusText(status),
      reply_markup: keyButtons(),
    });
    return;
  }

  // Command: /build or trigger build by text
  const isBuildRequest = text === '/build' || /^(بساز|سورس|کد|build|فایل)/i.test(text);
  if (isBuildRequest) {
    const state = await getSession(userId);
    if (!state.templateId) {
      state.templateId = 'custom';
      state.title = CATEGORIES.custom.title;
    }
    await api.sendChatAction({ chat_id: chatId, action: 'typing' });
    let sourceCode;
    try {
      sourceCode = await generateBotSource(userId, state);
    } catch (err) {
      console.error('generateBotSource error:', err);
      sourceCode = '';
    }

    if (!sourceCode) {
      await api.sendMessage({
        chat_id: chatId,
        text: 'خطا در ایجاد سورس. لطفاً دسته یا مشخصات را دوباره ارسال کنید.',
        reply_markup: categoryKeyboard(WEBAPP_URL),
      });
      return;
    }

    state.source = sourceCode;
    await saveSession(userId, state);

    const bytes = new TextEncoder().encode(sourceCode);
    const fileName = `botmother-${state.templateId || 'bot'}.js`;

    await api.sendDocument({
      chat_id: chatId,
      document: new InputFile(bytes, fileName, { type: 'text/javascript' }),
      caption: `✅ سورس اختصاصی شما آماده شد!\n\n` +
        `📁 فایل: ${fileName}\n` +
        `⚙️ پلتفرم: Telegram Serverless\n\n` +
        `برای تغییر یا ساخت ربات جدید، پیام بفرستید یا دسته دیگری برگزینید.`,
    });

    await api.sendMessage({
      chat_id: chatId,
      text: 'آیا می‌خواهید ربات دیگری بسازید یا تنظیمات را تغییر دهید؟',
      reply_markup: categoryKeyboard(WEBAPP_URL),
    });
    return;
  }

  // Ignore any other slash commands
  if (text.startsWith('/')) return;

  // Conversational agent processing
  const state = await getSession(userId);
  await api.sendChatAction({ chat_id: chatId, action: 'typing' });

  let result;
  try {
    result = await askAgent(userId, state, text);
  } catch (err) {
    console.error('askAgent error:', err);
    result = {
      text: `ایدهٔ شما ثبت گردید: «${text}».\nبرای دریافت سورس کامل کد، دکمهٔ «🧩 ساخت فایل سورس ربات» زیر را لمس نمایید.`,
      history: state.history || [],
    };
  }

  state.history = result.history;
  state.brief = [...(state.brief ? state.brief.split('\n') : []), text].slice(-8).join('\n');
  await saveSession(userId, state);

  await api.sendMessage({
    chat_id: chatId,
    text: result.text,
    reply_markup: buildKeyboard(WEBAPP_URL),
  });
}
