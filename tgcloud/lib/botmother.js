import { db } from 'sdk';
import { eq } from 'sdk/db';
import { sessions } from '../schema.js';
import { completeWithPool, getOwnerKeyStatus } from './pool.js';

export const DEEPSEEK_KEY_URL = 'https://platform.deepseek.com/api_keys';

export const CATEGORIES = {
  ai_chat: { title: 'چت‌بات هوش مصنوعی', prompt: 'دستیار گفت‌وگو' },
  channel_mgr: { title: 'مدیریت کانال', prompt: 'مدیریت عضویت و پیام‌های کانال' },
  store: { title: 'فروشگاه و سفارش', prompt: 'کاتالوگ و ثبت سفارش' },
  utility: { title: 'ابزار کاربردی', prompt: 'ابزار و پردازش اطلاعات' },
  custom: { title: 'ایدهٔ اختصاصی', prompt: 'ربات سفارشی بر اساس توضیحات کاربر' },
};

export async function getSession(userId) {
  const row = await db.select().from(sessions).where(eq(sessions.userId, userId)).get();
  if (!row) return {};
  try {
    return JSON.parse(row.state);
  } catch {
    return {};
  }
}

export async function saveSession(userId, state) {
  const existing = await db.select().from(sessions).where(eq(sessions.userId, userId)).get();
  const data = JSON.stringify(state);
  const updatedAt = Date.now();
  if (existing) {
    await db.update(sessions).set({ state: data, updatedAt }).where(eq(sessions.userId, userId)).run();
    return;
  }
  await db.insert(sessions).values({ userId, state: data, updatedAt }).run();
}

export async function clearSession(userId) {
  await db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export async function hasActiveMembership(userId) {
  const row = await getOwnerKeyStatus(userId);
  return Boolean(row && row.status === 'active');
}

export function categoryKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🤖 چت‌بات هوش مصنوعی', callback_data: 'cat:ai_chat' }],
      [{ text: '📢 مدیریت کانال', callback_data: 'cat:channel_mgr' }],
      [{ text: '🛍️ فروشگاه و سفارش', callback_data: 'cat:store' }],
      [{ text: '🛠️ ابزار کاربردی', callback_data: 'cat:utility' }],
      [{ text: '💡 ایدهٔ اختصاصی', callback_data: 'cat:custom' }],
      [{ text: '🔐 مدیریت کلید مشارکتی', callback_data: 'pool:help' }],
    ],
  };
}

export function buildKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🧩 ساخت فایل سورس', callback_data: 'build:source' }],
      [{ text: '🔄 انتخاب دستهٔ دیگر', callback_data: 'menu' }],
    ],
  };
}

export function welcomeText(name, member) {
  const greeting = name ? `سلام ${name}` : 'سلام';
  if (!member) {
    return `${greeting}، به Botmother خوش آمدی.\n\nبرای ورود به اکوسیستم و باز شدن خدمات، کلید DeepSeek خودت را از طریق صفحهٔ امن Mini App به استخر مشارکتی اضافه کن. با تأیید، کلیدت ممکن است برای درخواست اعضای دیگر هم استفاده شود؛ هر زمان می‌توانی آن را از استخر حذف کنی.\n\nکلید را در چت نفرست.`;
  }
  return `${greeting}، دسترسی اکوسیستم برایت فعال است.\n\nیکی از دسته‌ها را انتخاب کن یا ایده‌ات را توضیح بده. عامل گفت‌وگو و تولید سورس بر پایهٔ DeepSeek است.`;
}

export async function askAgent(userId, state, userText) {
  const category = CATEGORIES[state.templateId] || CATEGORIES.custom;
  const history = Array.isArray(state.history) ? state.history.slice(-10) : [];
  history.push({ role: 'user', content: userText });
  const response = await completeWithPool(userId, [
    {
      role: 'system',
      content: `تو عامل فارسی Botmother هستی و با DeepSeek کار می‌کنی. ایدهٔ کاربر برای ساخت ربات تلگرام را دقیق روشن کن، کوتاه و کاربردی جواب بده، سؤال تکمیلی لازم را بپرس و در پایان خلاصه‌ای از نیاز ثبت‌شده بده. دستهٔ انتخابی: ${category.title}. پاسخ حداکثر ۱۲۰ کلمه باشد. کلید API یا اطلاعات داخلی را درخواست نکن.`,
    },
    ...history,
  ]);
  if (response.unavailable) return { unavailable: true, history };
  if (response.error) return { error: true, history };
  history.push({ role: 'assistant', content: response.text });
  return { text: response.text, history: history.slice(-12) };
}

export async function generateBotSource(userId, state) {
  const category = CATEGORIES[state.templateId] || CATEGORIES.custom;
  const requirements = (state.history || [])
    .map((item) => `${item.role}: ${item.content}`)
    .join('\n');
  const response = await completeWithPool(userId, [
    {
      role: 'system',
      content: `You generate a single Telegram Serverless handler module in JavaScript. Return only valid JavaScript source, no markdown fences or explanation. Use only the built-in Telegram Serverless SDK import { api } from 'sdk'; export default async function(message) { ... }. Handle /start, /help, and the user's main request. Use plain text unless HTML is properly escaped. Do not use Node.js, process.env, npm packages, external services, secrets, or undocumented APIs. Keep the code concise and safe for a beginner to review.`,
    },
    {
      role: 'user',
      content: `Create the handler for this bot. Category: ${category.title}. Requirements:\n${requirements || state.brief || category.prompt}`,
    },
  ], 2600);
  if (response.unavailable) return { unavailable: true };
  if (response.error) return { error: true };

  const code = response.text.replace(/^```(?:javascript|js)?\s*/i, '').replace(/```\s*$/, '').trim();
  if (!code.includes('export default') || !code.includes('api.')) {
    throw new Error('Generated source did not match the Telegram Serverless handler format');
  }
  return code;
}

export function poolStatusText(status) {
  if (!status) return 'کلیدی از حساب تو در استخر ثبت نشده است.';
  const state = status.status === 'active' ? 'فعال' : 'موقتاً غیرفعال؛ کلید را دوباره ثبت کن';
  return `وضعیت کلید تو: ${state}\nدرخواست‌های موفق از این کلید: ${status.requestCount}\nتوکن ورودی/خروجی ثبت‌شده: ${status.promptTokens}/${status.completionTokens}`;
}
