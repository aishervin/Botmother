import { InputFile, api } from 'sdk';
import { getOwnerKeyStatus } from '../lib/pool.js';
import {
  CATEGORIES,
  DEEPSEEK_KEY_URL,
  buildKeyboard,
  categoryKeyboard,
  generateBotSource,
  getSession,
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
  try {
    await api.answerCallbackQuery({ callback_query_id: query.id });
  } catch {
    // Ignore callback query answer errors (e.g. expired or synthetic queries)
  }

  const userId = String(query.from.id);
  const chatId = query.message?.chat?.id || query.from.id;
  const messageId = query.message?.message_id;
  const data = query.data || '';

  if (data === 'menu') {
    await api.sendMessage({
      chat_id: chatId,
      text: 'دسته‌بندی‌های ربات‌ساز Botmother:\nیکی را انتخاب کنید یا ایده‌تان را در پیام بنویسید:',
      reply_markup: categoryKeyboard(WEBAPP_URL),
    });
    return;
  }

  if (data === 'menu:help') {
    await api.sendMessage({
      chat_id: chatId,
      text: `🤖 **راهنمای Botmother**:\n\n` +
        `• برای شروع ساخت ربات، کافیست یک دسته را انتخاب کنید یا به زبان ساده نیازتان را بنویسید.\n` +
        `• برای دریافت سورس آماده، دکمه «🧩 ساخت فایل سورس» را بزنید.\n` +
        `• برای استفاده از استخر اشتراکی هوش مصنوعی DeepSeek، کلید خود را از Mini App ثبت کنید.`,
      reply_markup: categoryKeyboard(WEBAPP_URL),
    });
    return;
  }

  if (data === 'pool:help') {
    const status = await getOwnerKeyStatus(userId);
    await api.sendMessage({
      chat_id: chatId,
      text: `${poolStatusText(status)}\n\nجهت ثبت، جایگزینی یا حذف کلید، از صفحهٔ Mini App استفاده فرمایید.`,
      reply_markup: keyButtons(),
    });
    return;
  }

  if (data.startsWith('cat:')) {
    const templateId = data.slice(4);
    const category = CATEGORIES[templateId] || CATEGORIES.custom;

    const state = {
      templateId,
      title: category.title,
      step: 'requirements',
      history: [],
      brief: '',
    };
    await saveSession(userId, state);

    await api.sendMessage({
      chat_id: chatId,
      text: `دستهٔ «${category.title}» انتخاب شد. ${category.icon || ''}\n\n` +
        `ربات شما قرار است چه کاری انجام دهد؟ نیازها، پیام خوش‌آمدگویی یا ویژگی‌های مهم را در چند جمله ارسال کنید.\n` +
        `همچنین می‌توانید فوراً با دکمهٔ زیر، فایل سورس پایه را دریافت نمایید:`,
      reply_markup: buildKeyboard(WEBAPP_URL),
    });
    return;
  }

  if (data === 'build:source') {
    const state = await getSession(userId);
    if (!state.templateId) {
      state.templateId = 'custom';
      state.title = CATEGORIES.custom.title;
    }

    await api.sendChatAction({ chat_id: chatId, action: 'typing' });

    let generated;
    try {
      generated = await generateBotSource(userId, state);
    } catch (err) {
      console.error('generateBotSource callback error:', err);
      generated = '';
    }

    if (!generated) {
      await api.sendMessage({
        chat_id: chatId,
        text: 'متأسفانه ایجاد سورس با خطا مواجه شد. لطفاً دسته را دوباره انتخاب کنید.',
        reply_markup: categoryKeyboard(WEBAPP_URL),
      });
      return;
    }

    state.source = generated;
    await saveSession(userId, state);

    const bytes = new TextEncoder().encode(generated);
    const fileName = `botmother-${state.templateId || 'bot'}.js`;

    await api.sendDocument({
      chat_id: chatId,
      document: new InputFile(bytes, fileName, { type: 'text/javascript' }),
      caption: `✅ سورس اختصاصی Telegram Serverless شما آماده شد!\n\n` +
        `📁 نام فایل: ${fileName}\n` +
        `💡 دسته: ${CATEGORIES[state.templateId]?.title || 'سفارشی'}\n\n` +
        `پیش از استقرار، می‌توانید کد را مرور کرده و با دستور \`tgcloud run\` در محیط سرورلس آزمایش نمایید.`,
    });

    if (messageId) {
      await api.sendMessage({
        chat_id: chatId,
        text: 'برای ساخت یک ربات جدید یا ویرایش ایده‌تان، می‌توانید دستهٔ دیگری برگزینید یا پیامی بفرستید:',
        reply_markup: categoryKeyboard(WEBAPP_URL),
      });
    }
    return;
  }
}
