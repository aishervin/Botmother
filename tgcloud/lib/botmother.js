import { db } from 'sdk';
import { eq } from 'sdk/db';
import { sessions } from '../schema.js';
import { completeWithPool, getOwnerKeyStatus } from './pool.js';
import { WEBAPP_URL } from './config.js';

export const DEEPSEEK_KEY_URL = 'https://platform.deepseek.com/api_keys';
export const CF_TOKEN_URL = 'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%5D&accountId=%2A&zoneId=all&name=BotMother%20Worker%20Builder';

export const CATEGORIES = {
  ai_chat: {
    id: 'ai_chat',
    title: 'چت‌بات هوش مصنوعی',
    prompt: 'دستیار گفت‌وگو و پاسخگویی خودکار به پیام‌ها',
    icon: '🤖',
  },
  channel_mgr: {
    id: 'channel_mgr',
    title: 'مدیریت کانال و گروه',
    prompt: 'بررسی عضویت اجباری، خوش‌آمدگویی و ارسال پیام در کانال',
    icon: '📢',
  },
  store: {
    id: 'store',
    title: 'فروشگاه و سفارش‌گیری',
    prompt: 'نمایش کاتالوگ محصولات، دریافت اطلاعات مشتری و ثبت سفارش',
    icon: '🛍️',
  },
  utility: {
    id: 'utility',
    title: 'ابزار کاربردی',
    prompt: 'ارائه شناسه کاربری، پینگ سرور، ابزارهای پردازش متن و آمار',
    icon: '🛠️',
  },
  custom: {
    id: 'custom',
    title: 'ایدهٔ اختصاصی و آزاد',
    prompt: 'ربات سفارشی بر اساس نیازها و ایده‌های توضیح‌داده‌شده',
    icon: '💡',
  },
};

export async function getSession(userId) {
  try {
    const row = await db.select().from(sessions).where(eq(sessions.userId, userId)).get();
    if (!row) return {};
    return JSON.parse(row.state);
  } catch {
    return {};
  }
}

export async function saveSession(userId, state) {
  try {
    const existing = await db.select().from(sessions).where(eq(sessions.userId, userId)).get();
    const data = JSON.stringify(state);
    const updatedAt = Date.now();
    if (existing) {
      await db.update(sessions).set({ state: data, updatedAt }).where(eq(sessions.userId, userId)).run();
      return;
    }
    await db.insert(sessions).values({ userId, state: data, updatedAt }).run();
  } catch (err) {
    console.error('saveSession error:', err);
  }
}

export async function clearSession(userId) {
  try {
    await db.delete(sessions).where(eq(sessions.userId, userId)).run();
  } catch (err) {
    console.error('clearSession error:', err);
  }
}

export async function hasActiveMembership(userId) {
  try {
    const row = await getOwnerKeyStatus(userId);
    return Boolean(row && row.status === 'active');
  } catch {
    return false;
  }
}

export function categoryKeyboard(webAppUrl = WEBAPP_URL) {
  const keyboard = [
    [
      { text: '🤖 چت‌بات هوش مصنوعی', callback_data: 'cat:ai_chat' },
      { text: '📢 مدیریت کانال', callback_data: 'cat:channel_mgr' },
    ],
    [
      { text: '🛍️ فروشگاه و سفارش', callback_data: 'cat:store' },
      { text: '🛠️ ابزار کاربردی', callback_data: 'cat:utility' },
    ],
    [
      { text: '💡 ایدهٔ اختصاصی و آزاد', callback_data: 'cat:custom' },
    ],
  ];

  if (webAppUrl) {
    keyboard.push([
      { text: '📱 بازکردن استودیو Botmother (Mini App)', web_app: { url: webAppUrl } },
    ]);
  }

  keyboard.push([
    { text: '🔐 استخر کلید DeepSeek', callback_data: 'pool:help' },
    { text: '❓ راهنما', callback_data: 'menu:help' },
  ]);

  return { inline_keyboard: keyboard };
}

export function buildKeyboard(webAppUrl = WEBAPP_URL) {
  const keyboard = [
    [{ text: '🧩 ساخت فایل سورس ربات', callback_data: 'build:source' }],
    [{ text: '🔄 انتخاب دستهٔ دیگر', callback_data: 'menu' }],
  ];

  if (webAppUrl) {
    keyboard.push([
      { text: '📱 تنظیمات در Mini App', web_app: { url: webAppUrl } },
    ]);
  }

  return { inline_keyboard: keyboard };
}

export function welcomeText(name, member = false) {
  const greeting = name ? `سلام ${name}` : 'سلام';
  const memberStatus = member ? '✅ عضو فعال استخر کلید' : '✨ آماده ساخت ربات';

  return `${greeting}، به **Botmother Studio** خوش آمدی! 🤖\n\n` +
    `من دستیار هوشمند طراحی، ساخت و استقرار ربات‌های تلگرام بر بستر **Telegram Serverless** هستم.\n\n` +
    `🔹 وضعیت شما: ${memberStatus}\n\n` +
    `چطور می‌خواهی شروع کنی؟\n` +
    `۱. یکی از دسته‌های زیر را انتخاب کن.\n` +
    `۲. یا مستقیماً در چند جمله بنویس چه رباتی می‌خواهی تا مرحله‌به‌مرحله با هم کاملش کنیم.\n` +
    `۳. همچنین از دکمه Mini App می‌توانی رباتت را سفارشی‌سازی یا کلیدت را مدیریت کنی.`;
}

function detectCategoryFromText(text) {
  const t = text.toLowerCase();
  if (/هوش\s*مصنوعی|چت|ai|gpt|پاسخگو|دستیار|مشاوره/.test(t)) return 'ai_chat';
  if (/کانال|گروه|عضویت|چنل|ادمین|کانتر|broadcast/.test(t)) return 'channel_mgr';
  if (/فروش|فروشگاه|خرید|محصول|سفارش|قیمت|کاتالوگ|order|shop/.test(t)) return 'store';
  if (/ابزار|پینگ|یوزرنیم|آیدی|اطلاعات|تبدیل|حساب|tool|util/.test(t)) return 'utility';
  return 'custom';
}

function generateAgentFallbackText(category, userText, history) {
  const c = category || CATEGORIES.custom;
  const turns = history ? history.length : 1;

  if (turns <= 2) {
    return `ایدهٔ شما در دستهٔ «${c.title}» بررسی و ثبت شد: «${userText}».\n\n` +
      `برای تکمیل مشخصات فنی، لطفاً بفرمایید:\n` +
      `• پیام خوش‌آمدگویی و دستور /start چگونه باشد؟\n` +
      `• چه دکمه‌ها یا دستورات اصلی (مثل /help یا منوی شیشه‌ای) نیاز دارید؟\n\n` +
      `همچنین هر زمان آماده بودید، دکمهٔ «🧩 ساخت فایل سورس ربات» را بزنید تا کد برایتان ارسال شود.`;
  }

  return `مشخصات تکمیلی شما ثبت شد: «${userText}».\n\n` +
    `✅ ساختار ربات آماده تولید است.\n` +
    `می‌توانید توضیحات بیشتری ارسال فرمایید، یا با دکمهٔ «🧩 ساخت فایل سورس ربات» زیر، فایل سورس کامل جاوااسکریپت (Telegram Serverless) را دریافت نمایید.`;
}

export async function askAgent(userId, state, userText) {
  if (!state.templateId) {
    state.templateId = detectCategoryFromText(userText);
    state.title = CATEGORIES[state.templateId]?.title || 'ایدهٔ اختصاصی';
  }

  const category = CATEGORIES[state.templateId] || CATEGORIES.custom;
  const history = Array.isArray(state.history) ? state.history.slice(-10) : [];
  history.push({ role: 'user', content: userText });

  let agentReply = '';

  try {
    const response = await completeWithPool(userId, [
      {
        role: 'system',
        content: `تو عامل فارسی Botmother هستی و با هوش مصنوعی کار می‌کنی. ایدهٔ کاربر برای ساخت ربات تلگرام بر پایه Telegram Serverless را دقیق روشن کن، کوتاه و کاربردی جواب بده، سؤال تکمیلی لازم را بپرس و در پایان خلاصه‌ای از نیاز ثبت‌شده بده. دستهٔ انتخابی: ${category.title}. پاسخ حداکثر ۱۲۰ کلمه باشد. کلید API یا اطلاعات داخلی را درخواست نکن.`,
      },
      ...history,
    ]);

    if (!response.unavailable && !response.error && response.text) {
      agentReply = response.text;
    }
  } catch (err) {
    console.error('completeWithPool failed, using agent fallback:', err);
  }

  if (!agentReply) {
    agentReply = generateAgentFallbackText(category, userText, history);
  }

  history.push({ role: 'assistant', content: agentReply });
  return { text: agentReply, history: history.slice(-12) };
}

function buildServerlessSourceFallback(templateId, brief, requirements) {
  const cat = CATEGORIES[templateId] || CATEGORIES.custom;
  const reqSummary = (brief || requirements || cat.prompt).replace(/[\r\n]+/g, ' ').slice(0, 300);

  if (templateId === 'store') {
    return `// ══════════════════════════════════════════════════════════
// BotMother Serverless Store & Catalog Bot
// Category: ${cat.title}
// Generated for: ${reqSummary}
// ══════════════════════════════════════════════════════════
import { api } from 'sdk';

export default async function (message) {
  const chatId = message?.chat?.id;
  if (!chatId) return;

  const text = (message.text || '').trim();
  const name = message.from?.first_name || 'کاربر گرامی';

  if (text === '/start') {
    await api.sendMessage({
      chat_id: chatId,
      text: \`سلام \${name}! به فروشگاه آنلاین خوش آمدید 🛍️\\n\\nهدف ثبت‌شده: ${reqSummary}\\n\\nجهت مشاهده محصولات یا ثبت سفارش از گزینه‌های زیر استفاده فرمایید:\`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '📦 مشاهده محصولات', callback_data: 'catalog' }],
          [{ text: '🛒 ثبت سفارش سریع', callback_data: 'order' }],
          [{ text: '📞 ارتباط با پشتیبانی', callback_data: 'support' }],
        ],
      },
    });
    return;
  }

  if (text === '/help') {
    await api.sendMessage({
      chat_id: chatId,
      text: 'راهنمای ربات فروشگاهی:\\n/start — شروع و منوی اصلی\\n/help — راهنما\\n/catalog — لیست محصولات\\n\\nبرای ثبت سفارش کافیست اطلاعات خود را در چت ارسال کنید.',
    });
    return;
  }

  // Handle general inquiries or orders
  await api.sendMessage({
    chat_id: chatId,
    text: \`پیام شما دریافت شد: «\${text}»\\n\\nسفارش یا پیام شما برای مدیریت فروشگاه ثبت شد. به زودی با شما ارتباط برقرار خواهیم کرد.\`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔙 بازگشت به منوی فروشگاه', callback_data: 'start' }],
      ],
    },
  });
}
`;
  }

  if (templateId === 'channel_mgr') {
    return `// ══════════════════════════════════════════════════════════
// BotMother Serverless Channel Manager Bot
// Category: ${cat.title}
// Generated for: ${reqSummary}
// ══════════════════════════════════════════════════════════
import { api } from 'sdk';

export default async function (message) {
  const chatId = message?.chat?.id;
  if (!chatId) return;

  const text = (message.text || '').trim();
  const name = message.from?.first_name || 'کاربر';

  if (text === '/start') {
    await api.sendMessage({
      chat_id: chatId,
      text: \`درود \${name}! به ربات مدیریت کانال و ارتباط خوش آمدید 📢\\n\\nقابلیت‌ها: بررسی عضویت، ارسال همگانی، خوش‌آمدگویی خودکار.\\nهدف: ${reqSummary}\`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 وضعیت عضویت و کانال', callback_data: 'status' }],
          [{ text: '📢 راهنمای اتصال به کانال', callback_data: 'guide' }],
        ],
      },
    });
    return;
  }

  if (text === '/help') {
    await api.sendMessage({
      chat_id: chatId,
      text: 'دستورات:\\n/start — منوی مدیریت کانال\\n/check — بررسی عضویت\\n/help — راهنما',
    });
    return;
  }

  await api.sendMessage({
    chat_id: chatId,
    text: \`پیام شما برای پردازش در سامانه کانال ثبت شد: «\${text}»\`,
  });
}
`;
  }

  if (templateId === 'utility') {
    return `// ══════════════════════════════════════════════════════════
// BotMother Serverless Utility & Tools Bot
// Category: ${cat.title}
// Generated for: ${reqSummary}
// ══════════════════════════════════════════════════════════
import { api } from 'sdk';

export default async function (message) {
  const chatId = message?.chat?.id;
  if (!chatId) return;

  const text = (message.text || '').trim();
  const from = message.from || {};

  if (text === '/start') {
    await api.sendMessage({
      chat_id: chatId,
      text: \`سلام \${from.first_name || ''}! به ربات ابزار کاربردی تلگرام خوش آمدید 🛠️\\n\\nمشخصات هدف: ${reqSummary}\`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '👤 شناسه و مشخصات من', callback_data: 'my_id' }],
          [{ text: '⚡ تست تاخیر سرور (/ping)', callback_data: 'ping' }],
        ],
      },
    });
    return;
  }

  if (text === '/ping') {
    await api.sendMessage({
      chat_id: chatId,
      text: '🏓 Pong! سرور Telegram Serverless فعال و پاسخگو است.',
    });
    return;
  }

  if (text === '/id') {
    await api.sendMessage({
      chat_id: chatId,
      text: \`شناسه عددی شما: \${from.id}\\nنام: \${from.first_name || ''}\\nنام کاربری: @\${from.username || 'ندارد'}\`,
    });
    return;
  }

  await api.sendMessage({
    chat_id: chatId,
    text: \`طول متن دریافتی: \${text.length} کاراکتر\\nتعداد کلمات: \${text.split(/\\s+/).filter(Boolean).length}\\n\\nدستور /id یا /ping را ارسال کنید.\`,
  });
}
`;
  }

  // Default / ai_chat / custom
  return `// ══════════════════════════════════════════════════════════
// BotMother Serverless Intelligent Bot
// Category: ${cat.title}
// Requirements: ${reqSummary}
// ══════════════════════════════════════════════════════════
import { api } from 'sdk';

export default async function (message) {
  const chatId = message?.chat?.id;
  if (!chatId) return;

  const text = (message.text || '').trim();
  const name = message.from?.first_name || 'کاربر گرامی';

  if (text === '/start') {
    await api.sendMessage({
      chat_id: chatId,
      text: \`سلام \${name}! من ربات هوشمند شما بر بستر Telegram Serverless هستم 🤖\\n\\nشرح وظایف من: ${reqSummary}\\n\\nبرای شروع پیامی بفرستید یا یکی از گزینه‌ها را لمس کنید:\`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '✨ شروع کاربری', callback_data: 'main' }],
          [{ text: '❓ راهنما و اطلاعات', callback_data: 'help' }],
        ],
      },
    });
    return;
  }

  if (text === '/help') {
    await api.sendMessage({
      chat_id: chatId,
      text: 'راهنمای ربات:\\n/start — شروع مجدد ربات\\n/help — راهنما و دستورات\\n\\nهر پیامی ارسال کنید، بررسی و پاسخ داده می‌شود.',
    });
    return;
  }

  // Handle conversational message
  await api.sendMessage({
    chat_id: chatId,
    text: \`پاسخ به «\${text}»:\\nپیام شما به عنوان درخواست مرتبط با «${cat.title}» دریافت و با موفقیت پردازش گردید.\`,
  });
}
`;
}

export async function generateBotSource(userId, state) {
  const templateId = state.templateId || 'custom';
  const category = CATEGORIES[templateId] || CATEGORIES.custom;
  const requirements = (state.history || [])
    .map((item) => `${item.role}: ${item.content}`)
    .join('\n');

  let generated = '';

  try {
    const response = await completeWithPool(
      userId,
      [
        {
          role: 'system',
          content: `You generate a single Telegram Serverless handler module in JavaScript. Return only valid JavaScript source, no markdown fences or explanation. Use only the built-in Telegram Serverless SDK import { api } from 'sdk'; export default async function(message) { ... }. Handle /start, /help, and the user's main request. Use plain text unless HTML is properly escaped. Do not use Node.js, process.env, npm packages, external services, secrets, or undocumented APIs. Keep the code concise and safe for a beginner to review.`,
        },
        {
          role: 'user',
          content: `Create the handler for this bot. Category: ${category.title}. Requirements:\n${requirements || state.brief || category.prompt}`,
        },
      ],
      2600
    );

    if (!response.unavailable && !response.error && response.text) {
      const code = response.text
        .replace(/^```(?:javascript|js)?\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      if (code.includes('export default') && code.includes('api.')) {
        generated = code;
      }
    }
  } catch (err) {
    console.error('generateBotSource with pool failed:', err);
  }

  if (!generated) {
    generated = buildServerlessSourceFallback(templateId, state.brief, requirements);
  }

  return generated;
}

export function poolStatusText(status) {
  if (!status) return 'کلیدی از حساب شما در استخر DeepSeek ثبت نشده است.';
  const state = status.status === 'active' ? 'فعال ✅' : 'موقتاً غیرفعال؛ کلید را دوباره ثبت کن ⚠️';
  return `وضعیت کلید شما در استخر: ${state}\n` +
    `درخواست‌های موفق: ${status.requestCount || 0}\n` +
    `توکن ورودی: ${status.promptTokens || 0} | توکن خروجی: ${status.completionTokens || 0}`;
}
