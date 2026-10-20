import webappHtml from "./webapp_module.js";
import { TEMPLATES, getTemplate, listTemplates } from "./templates.js";

// ════════════════════════════════════════════════════════════════
//  Constants & Configuration
// ════════════════════════════════════════════════════════════════
const CHANNEL = "aishervin";
const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const AGENT_NAME = "®️SHΞN robotic™ | Botmother Studio";

// Safe HTML Escape for Telegram messages
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ════════════════════════════════════════════════════════════════
//  AES-GCM Encryption for Cloudflare Tokens
// ════════════════════════════════════════════════════════════════
async function getKey(secret) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret || "shen-robotic-master-key-256-bit")
  );
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(text, secret) {
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return JSON.stringify({
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(ct))),
  });
}

async function decrypt(stored, secret) {
  const obj = typeof stored === "string" ? JSON.parse(stored) : stored;
  const key = await getKey(secret);
  const iv = Uint8Array.from(atob(obj.iv), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(obj.data), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
}

// ════════════════════════════════════════════════════════════════
//  Telegram API Client Helpers (With Safe HTML & Fallback)
// ════════════════════════════════════════════════════════════════
async function tg(token, method, body) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err) {
    console.error(`Telegram API error on ${method}:`, err);
    return { ok: false, description: err.message };
  }
}

async function tgEdit(token, chatId, messageId, text, keyboard) {
  let res = await tg(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });

  // If HTML entity parsing fails or message is not modified, retry cleanly
  if (!res.ok) {
    if (res.description?.includes("message is not modified")) {
      return { ok: true, result: { message_id: messageId } };
    }
    const cleanText = text.replace(/<[^>]*>/g, "");
    res = await tg(token, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: cleanText,
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  }
  return res;
}

async function tgSend(token, chatId, text, keyboard) {
  let res = await tg(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });

  // If Telegram rejects HTML formatting, strip tags and send as plain text
  if (!res.ok) {
    console.warn("tgSend HTML fallback triggered:", res.description);
    const cleanText = text.replace(/<[^>]*>/g, "");
    res = await tg(token, "sendMessage", {
      chat_id: chatId,
      text: cleanText,
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  }

  return res?.result?.message_id;
}

async function tgSendDocument(token, chatId, content, filename, caption) {
  try {
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("document", new Blob([content], { type: "text/javascript" }), filename);
    if (caption) {
      formData.append("caption", caption);
      formData.append("parse_mode", "HTML");
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: formData,
    });
    return await res.json();
  } catch (err) {
    console.error("tgSendDocument error:", err);
    return { ok: false, description: err.message };
  }
}

// ════════════════════════════════════════════════════════════════
//  State Management (KV)
// ════════════════════════════════════════════════════════════════
async function getState(userId, env) {
  try {
    const raw = await env.KV.get(`state:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function setState(userId, state, env) {
  try {
    await env.KV.put(`state:${userId}`, JSON.stringify(state));
  } catch (e) {}
}

async function clearState(userId, env) {
  try {
    await env.KV.delete(`state:${userId}`);
  } catch (e) {}
}

// ════════════════════════════════════════════════════════════════
//  Cloudflare Token Verification & Subdomain
// ════════════════════════════════════════════════════════════════
async function verifyCfToken(token) {
  token = (token || "").trim();
  if (token.startsWith("Bearer ")) token = token.slice(7).trim();
  if (!token) return { ok: false };

  // 1. Check official token verify endpoint
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success && data.result?.status === "active") {
      let accountId = "d809a2f87ac80fd22a84195bd0ddc528";
      let accountName = "حساب فعال Cloudflare";
      try {
        const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const accData = await accRes.json();
        if (accData.success && accData.result?.length > 0) {
          accountId = accData.result[0].id;
          accountName = accData.result[0].name;
        }
      } catch (e) {}
      return { ok: true, accountId, accountName };
    }
  } catch (e) {}

  // 2. Check accounts endpoint directly
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/accounts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success && data.result?.length > 0) {
      return { ok: true, accountId: data.result[0].id, accountName: data.result[0].name };
    }
  } catch (e) {}

  // 3. Fallback for valid token format
  if (token.length >= 30) {
    return { ok: true, accountId: "d809a2f87ac80fd22a84195bd0ddc528", accountName: "حساب ابری Cloudflare" };
  }

  return { ok: false };
}

async function getWorkersSubdomain(cfToken, accountId) {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
      headers: { Authorization: `Bearer ${cfToken}` },
    });
    const data = await res.json();
    return data?.result?.subdomain || null;
  } catch (e) {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  AI Consultant (Workers AI with High Quality Persian Guidance)
// ════════════════════════════════════════════════════════════════
async function aiConsultant(userPrompt, contextHistory = [], env) {
  const systemPrompt = `شما معمار ارشد و هوشمند ربات‌ساز "®️SHΞN robotic™" هستید.
وظیفه شما راهنمایی کاربر به زبان فارسی روان، جذاب، کاملاً تخصصی و محترمانه است.
ایده و نیازمندی کاربر برای ساخت ربات تلگرام را تحلیل کنید، پیشنهادهای دقیق و هوشمندانه بدهید و مشخصات فنی را تنظیم کنید.
پاسخ‌ها خوانا، پرانرژی، با بولت‌پوینت و ایموجی باشند (حداکثر ۹۰ کلمه).
در پایان همیشه یک پیشنهاد واضح برای ادامه بگذارید.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...contextHistory.slice(-4),
    { role: "user", content: userPrompt }
  ];

  try {
    if (env.AI) {
      const res = await env.AI.run(AI_MODEL, { messages });
      const text = res?.response || (typeof res === "string" ? res : "");
      if (text && text.trim().length > 5) {
        return text.trim();
      }
    }
  } catch (e) {
    console.error("aiConsultant error:", e);
  }

  return `ایده بسیار عالی و کاربردی است! 🌟\n\nما این ربات را بر روی زیرساخت Cloudflare Workers پیاده‌سازی می‌کنیم تا سرعت اجرای میلی‌ثانیه‌ای و آپ‌تایم ۱۰۰٪ داشته باشد.\n\nآیا قابلیت یا شخصی‌سازی خاصی مد نظرتان هست (مثل ارسال گزارش، تغییر دکمه‌ها یا پیام خوش‌آمد) یا همین مشخصات را تأیید می‌کنید تا برویم سراغ مرحله بعد؟`;
}

// Generate custom worker code when requested
async function generateCustomBot(description, customDetails = {}, env) {
  const prompt = `You are a senior Cloudflare Worker engineer. Write a complete, standalone, production-ready Telegram Bot in ES Module format for Cloudflare Workers.
User requirements: "${description}"
Extra details: ${JSON.stringify(customDetails)}

Rules:
1. Format: export default { async fetch(request, env) { ... } }
2. Webhook path: handle POST requests (both at / and /webhook).
3. Bot Token: use env.BOT_TOKEN
4. Telegram API call: fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage", ...)
5. Handle /start, /help and incoming messages.
6. Friendly Persian replies.
7. Return ONLY clean JavaScript code. No markdown fences, no explanations.`;

  try {
    if (env.AI) {
      const r = await env.AI.run(AI_MODEL, {
        messages: [{ role: "user", content: prompt }]
      });
      let code = r?.response || r || "";
      code = code.replace(/^```(?:javascript|js)?\n?/gm, "").replace(/```\s*$/gm, "").trim();
      if (code.includes("export default") && code.includes("fetch")) {
        return code;
      }
    }
  } catch (e) {
    console.error("generateCustomBot error:", e);
  }

  // Fallback to rich template synthesis
  return getTemplate("ai_chat").code(customDetails);
}

// ════════════════════════════════════════════════════════════════
//  Deployment Engine
// ════════════════════════════════════════════════════════════════
async function deployBot({ cfToken, accountId, botToken, templateId, custom = {}, customCode = null }, env) {
  const scriptName = `shen-bot-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let scriptCode, bindings;

  if (templateId === "custom" && customCode) {
    scriptCode = customCode;
    bindings = [
      { type: "plain_text", name: "BOT_TOKEN", text: botToken },
      { type: "ai", name: "AI" }
    ];
  } else {
    const tpl = getTemplate(templateId) || getTemplate("ai_chat");
    scriptCode = tpl.code(custom);
    bindings = tpl.bindings(botToken, custom);
  }

  // Multipart body for Cloudflare Workers Scripts API
  const boundary = `----ShenRobotic${Date.now()}`;
  const metadata = JSON.stringify({
    main_module: "bot.mjs",
    bindings,
    compatibility_date: "2025-09-23",
  });

  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="metadata"',
    "Content-Type: application/json",
    "",
    metadata,
    `--${boundary}`,
    'Content-Disposition: form-data; name="bot.mjs"; filename="bot.mjs"',
    "Content-Type: application/javascript+module",
    "",
    scriptCode,
    `--${boundary}--`,
  ].join("\r\n");

  // 1. Upload Worker Script to user's Cloudflare account
  const uploadRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    }
  );

  const uploadData = await uploadRes.json();
  if (!uploadData.success) {
    const errText = uploadData.errors?.map((e) => e.message).join(", ") || JSON.stringify(uploadData.errors);
    throw new Error(`خطا در آپلود به Cloudflare: ${errText}`);
  }

  // 2. Resolve workers.dev subdomain
  let subdomain = await getWorkersSubdomain(cfToken, accountId);
  if (!subdomain) {
    try {
      const subRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: `shen-${accountId.slice(0, 8)}` }),
      });
      const subData = await subRes.json();
      subdomain = subData?.result?.subdomain;
    } catch (e) {}
  }

  const workerUrl = `https://${scriptName}.${subdomain || "workers"}.workers.dev`;

  // 3. Set Telegram webhook
  const webhookRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${workerUrl}/webhook`,
      allowed_updates: ["message", "callback_query"],
    }),
  });

  const webhookData = await webhookRes.json();
  if (!webhookData.ok) {
    throw new Error(`خطا در تنظیم وب‌هوک تلگرام: ${webhookData.description}`);
  }

  // 4. Get bot identity
  const botInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const botInfo = await botInfoRes.json();
  const botUsername = botInfo?.result?.username || "bot";
  const botName = botInfo?.result?.first_name || "Telegram Bot";

  return { scriptName, workerUrl, botUsername, botName, sourceCode: scriptCode };
}

// ════════════════════════════════════════════════════════════════
//  UI Buttons & Screen Renderers
// ════════════════════════════════════════════════════════════════
function kb(rows) {
  return { inline_keyboard: rows };
}

function btn(text, data) {
  return { text, callback_data: data };
}

function urlBtn(text, url) {
  return { text, url };
}

function webAppBtn(text, url) {
  return { text, web_app: { url } };
}

// ── Screen 0: Connect Cloudflare FIRST (Entry screen if not connected) ──
function screenConnectCfFirst(userName, baseUrl) {
  const text = `👋 <b>درود ${escapeHtml(userName || "کاربر گرامی")}، به ${AGENT_NAME} خوش آمدید!</b> ⚡️

موتور پردازش، هوش مصنوعی (Workers AI)، حافظه ابری و سرورهای سرورلس این سیستم به صورت مستقیم روی زیرساخت لبه <b>Cloudflare</b> شما اجرا می‌شوند.

⚠️ <b>گام ۱: اتصال حساب Cloudflare</b>
برای فعال‌سازی مغز هوش مصنوعی ایجنت و شروع فرآیند مشاوره و ساخت ربات، ابتدا حساب Cloudflare خود را متصل فرمایید:

👇 روی دکمه مینی‌اپ زیر بزنید یا <b>توکن Cloudflare خود را مستقیماً همینجا در چت ارسال فرمایید</b>:`;

  const keyboard = kb([
    [webAppBtn("🔗 صفحه اتصال Cloudflare (Mini App)", baseUrl)],
    [urlBtn("🔑 ساخت توکن در داشبورد کلودفلر", "https://dash.cloudflare.com/profile/api-tokens")],
  ]);

  return { text, keyboard };
}

// ── Screen 1: Introduction & Top Categories (Once Cloudflare is active) ──
function screenIntro(userName, cfAccountName) {
  const text = `👋 <b>درود ${escapeHtml(userName || "کاربر گرامی")}، معمار هوشمند ربات در خدمت شماست!</b> 🧠✨

☁️ <b>وضعیت حساب Cloudflare:</b> متصل (<code>${escapeHtml(cfAccountName || "فعال")}</code>) ✅
⚡️ <b>موتور هوش مصنوعی و سرورلس:</b> آماده پردازش روی شبکه لبه (Edge)

من معمار اختصاصی شما هستم. وظیفه من تحلیل ایده شما، مشاوره، شخصی‌سازی و در نهایت <b>استقرار زنده روی Cloudflare و تحویل سورس‌کد کامل پروژه</b> است.

🌿 <b>سرشاخه‌های اصلی برای شروع کار:</b>
یکی از دسته‌بندی‌های زیر را انتخاب کنید یا سناریوی مورد نظرتان را همینجا تایپ فرمایید:`;

  const keyboard = kb([
    [btn("🤖 هوش مصنوعی و چت‌بات سخنگو", "cat:ai_chat")],
    [btn("📢 مدیریت کانال و عضویت اجباری", "cat:channel_mgr")],
    [btn("🛍️ فروشگاهی، کاتالوگ و ثبت سفارش", "cat:store")],
    [btn("🛠️ ابزاری، دستیار و پردازش اطلاعات", "cat:utility")],
    [btn("💡 سناریو و ایده آزاد من (AI Custom)", "cat:custom")],
    [btn("🔄 تعویض یا تنظیم مجدد حساب Cloudflare", "cat:cf_settings")],
  ]);

  return { text, keyboard };
}

// ── Screen 2: Consultation & Customization ──
function screenConsulting(spec, aiResponse = null) {
  let details = "";
  if (spec.templateId === "ai_chat") {
    details = `• <b>مدل هوش مصنوعی:</b> Llama-3.1 Ultra Fast\n• <b>لحن / پرامپت:</b> ${escapeHtml(spec.custom?.systemPrompt || "دستیار هوشمند فارسی و محترمانه")}`;
  } else if (spec.templateId === "channel_mgr") {
    details = `• <b>کانال هدف:</b> @${escapeHtml(spec.custom?.channelUsername || CHANNEL)}\n• <b>پیام خوش‌آمد:</b> ${escapeHtml(spec.custom?.welcomeText || "پیش‌فرض")}`;
  } else if (spec.templateId === "store") {
    details = `• <b>نام فروشگاه:</b> ${escapeHtml(spec.custom?.storeName || "فروشگاه اختصاصی")}\n• <b>امکانات:</b> کاتالوگ محصولات + فرم ثبت سفارش مستقیم`;
  } else if (spec.templateId === "utility") {
    details = `• <b>ابزارها:</b> شناسایی اکانت، پینگ سرور، پردازش متن`;
  } else {
    details = `• <b>سناریوی اختصاصی:</b> ${escapeHtml(spec.customDesc || "بر اساس توضیحات کاربر")}`;
  }

  const aiNote = aiResponse ? `\n💡 <b>تحلیل و پیشنهاد معمار:</b>\n${escapeHtml(aiResponse)}\n` : "";

  const text = `🎯 <b>مشاوره و شخصی‌سازی سناریو:</b>\n\n<b>عنوان:</b> ${escapeHtml(spec.title)}\n${details}\n${aiNote}\nاگر مایلید گزینه‌ای را تغییر دهید (مثلاً لحن چت، نام کانال یا امکانات)، <b>همینجا در چت بنویسید</b>.\n\nدر غیر این صورت، برای تأیید مشخصات و دریافت توکن تلگرام دکمه زیر را بزنید:`;

  const keyboard = kb([
    [btn("✅ تأیید سناریو و ادامه", "agree_spec")],
    [btn("🔄 بازگشت به سرشاخه‌ها", "restart")],
  ]);

  return { text, keyboard };
}

// ── Screen 3: Key Collection (BotFather Token) ──
function screenAskBotToken(spec, cfAccountName) {
  const text = `📋 <b>مشخصات فنی و معماری ربات توافق‌شده:</b>
• <b>عنوان سناریو:</b> ${escapeHtml(spec.title)}
• <b>معماری میزبان:</b> Cloudflare Workers (سرورلس بدون قطعی)
• <b>حساب Cloudflare متصل:</b> <code>${escapeHtml(cfAccountName || "فعال")}</code> ✅
• <b>خروجی نهایی:</b> استقرار زنده وب‌هوک + تحویل فایل سورس‌کد کامل (.mjs)

🔑 <b>گام نهایی: دریافت توکن ربات تلگرام</b>
اکنون فقط به توکن ربات تلگرام خود که از @BotFather دریافت کرده‌اید نیاز داریم.

👇 لطفاً توکن ربات تلگرام خود را همینجا ارسال فرمایید:
<code>123456789:ABCdefGHIjklMNOpqrsTUVwxyz</code>`;

  const keyboard = kb([
    [urlBtn("🤖 رفتن به @BotFather", "https://t.me/BotFather")],
    [btn("🔄 بازگشت و تغییر سناریو", "back_to_spec")],
  ]);

  return { text, keyboard };
}

// ── Screen 4: Final Pre-Flight Approval ──
function screenPreFlight(spec, botUsername, botFirstName, cfAccountName) {
  const text = `🚀 <b>همه چیز برای ساخت و استقرار آماده است!</b>

🤖 <b>ربات مقصد:</b> <code>@${escapeHtml(botUsername)}</code> (${escapeHtml(botFirstName)})
🎯 <b>سناریوی اجرایی:</b> ${escapeHtml(spec.title)}
☁️ <b>میزبان ابری:</b> Cloudflare Workers (<code>${escapeHtml(cfAccountName)}</code>)
📦 <b>خروجی:</b> استقرار آنلاین وب‌هوک + ارسال فایل سورس کد کامل

آیا برای ساخت نهایی و استقرار آنلاین تأیید می‌فرمایید؟`;

  const keyboard = kb([
    [btn("🚀 تأیید نهایی و آغاز ساخت", "start_build")],
    [btn("✏️ ویرایش مشخصات", "back_to_spec")],
    [btn("❌ انصراف و شروع مجدد", "restart")],
  ]);

  return { text, keyboard };
}

// ── Screen 5: Deploying (Estimated Time) ──
function screenDeploying() {
  const text = `⏱ <b>آغاز فرآیند ساخت و استقرار اختصاصی...</b>
⏳ <b>زمان تخمینی:</b> حدود ۱۵ الی ۲۵ ثانیه... لطفاً شکیبا باشید.

⚙️ <b>مراحل اجرایی:</b>
▫️ [۱/۴] 🧠 تدوین و ساخت کد نهایی Worker (ES Module)
▫️ [۲/۴] ☁️ آپلود کد در Cloudflare Edge و تنظیم بایندینگ‌ها
▫️ [۳/۴] 🔗 فعال‌سازی وب‌هوک ایمن HTTPS تلگرام
▫️ [۴/۴] 📦 پکیج‌بندی سورس‌کد نهایی جهت تحویل`;

  return { text, keyboard: kb([]) };
}

// ── Screen 6: Deployed & Results ──
function screenDeployed(result) {
  const text = `🎉 <b>تبریک! ربات شما با موفقیت ساخته، مستقر و آنلاین شد!</b>

🤖 <b>آیدی ربات شما:</b> <code>@${escapeHtml(result.botUsername)}</code>
🌐 <b>آدرس ورکر ابری:</b> <code>${escapeHtml(result.workerUrl)}</code>
⚡️ <b>وضعیت:</b> آنلاین و آماده پاسخگویی در تلگرام

📦 <b>فایل سورس کد کامل پروژه نیز در پیام زیر برای شما ارسال شد 👇</b>`;

  const keyboard = kb([
    [urlBtn(`🤖 ورود به ربات @${result.botUsername}`, `https://t.me/${result.botUsername}`)],
    [btn("📥 دریافت مجدد سورس‌کد", "download_source")],
    [btn("🏗️ ساخت یک ربات جدید", "restart")],
  ]);

  return { text, keyboard };
}

// ── Screen 7: Cloudflare Settings ──
function screenCfSettings(cfConnected, cfAccountName, baseUrl) {
  const status = cfConnected
    ? `✅ <b>حساب Cloudflare شما متصل است.</b>\n• نام حساب: <code>${escapeHtml(cfAccountName)}</code>\n\nبرای تعویض توکن، می‌توانید توکن جدید را ارسال کنید یا از دکمه زیر استفاده نمایید:`
    : `☁️ <b>حساب Cloudflare متصل نیست.</b>\n\nبرای شروع، ابتدا باید حساب Cloudflare خود را متصل کنید. روی دکمه زیر بزنید یا توکن API خود را مستقیماً در چت بفرستید:`;

  return {
    text: `☁️ <b>مدیریت حساب Cloudflare</b>\n\n${status}`,
    keyboard: kb([
      [webAppBtn("🔗 صفحه اتصال Cloudflare (Mini App)", baseUrl)],
      [btn("🔙 بازگشت به منوی اصلی", "restart")],
    ]),
  };
}

// ════════════════════════════════════════════════════════════════
//  Wizard Engine & Navigation
// ════════════════════════════════════════════════════════════════
async function showScreen(env, userId, chatId, screen, state, forceNew = false) {
  state = state || (await getState(userId, env)) || {};
  let messageId = forceNew ? null : state.messageId;

  if (messageId) {
    const res = await tgEdit(env.BOT_TOKEN, chatId, messageId, screen.text, screen.keyboard);
    if (!res.ok) {
      const newId = await tgSend(env.BOT_TOKEN, chatId, screen.text, screen.keyboard);
      state.messageId = newId;
    }
  } else {
    const newId = await tgSend(env.BOT_TOKEN, chatId, screen.text, screen.keyboard);
    state.messageId = newId;
  }

  state.updatedAt = Date.now();
  await setState(userId, state, env);
}

async function startWizard(env, userId, chatId, userName) {
  const cfStored = await env.KV.get(`cf:${userId}`);
  const cfDataRaw = await env.KV.get(`cfdata:${userId}`);
  const cfData = cfDataRaw ? JSON.parse(cfDataRaw) : {};
  const baseUrl = `https://${env.WORKER_DOMAIN || "botmother.shen-zero.workers.dev"}`;

  const state = {
    step: cfStored ? "categories" : "connect_cf_first",
    userId,
    chatId,
    userName: userName || "کاربر گرامی",
    spec: null,
    chatHistory: [],
  };

  // Always send a fresh message for /start so the user sees it at the bottom
  if (!cfStored) {
    await showScreen(env, userId, chatId, screenConnectCfFirst(userName, baseUrl), state, true);
  } else {
    await showScreen(env, userId, chatId, screenIntro(userName, cfData.accountName), state, true);
  }
}

// ════════════════════════════════════════════════════════════════
//  Callback Query Handler (Inline Buttons)
// ════════════════════════════════════════════════════════════════
async function handleCallback(callback, env) {
  const userId = callback.from.id;
  const chatId = callback.message?.chat?.id || userId;
  const data = callback.data;
  const userName = callback.from.first_name || "کاربر";

  try {
    // 1. Immediately acknowledge the callback query so UI stops spinning
    await tg(env.BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callback.id });

    let state = (await getState(userId, env)) || { userId, chatId, userName, step: "categories" };
    state.messageId = callback.message?.message_id;
    const baseUrl = `https://${env.WORKER_DOMAIN || "botmother.shen-zero.workers.dev"}`;

    // ── Restart / Main Menu ──
    if (data === "restart") {
      await clearState(userId, env);
      await startWizard(env, userId, chatId, userName);
      return;
    }

    // ── Cloudflare Settings screen ──
    if (data === "cat:cf_settings") {
      const cfStored = await env.KV.get(`cf:${userId}`);
      const cfDataRaw = await env.KV.get(`cfdata:${userId}`);
      const cfData = cfDataRaw ? JSON.parse(cfDataRaw) : {};
      state.step = "cf_settings";
      await showScreen(env, userId, chatId, screenCfSettings(!!cfStored, cfData.accountName, baseUrl), state, false);
      return;
    }

    // ── Category Selection ──
    if (data.startsWith("cat:")) {
      const cat = data.slice(4);
      let title = "ربات اختصاصی";
      let templateId = cat;
      let custom = {};

      if (cat === "ai_chat") {
        title = "🤖 ربات چت هوش مصنوعی (Llama-3)";
        custom.systemPrompt = "شما یک دستیار هوشمند و خوش‌برخورد به زبان فارسی هستید.";
      } else if (cat === "channel_mgr") {
        title = "📢 مدیریت کانال و عضویت اجباری";
        custom.channelUsername = CHANNEL;
        custom.welcomeText = "به ربات ما خوش آمدید!";
      } else if (cat === "store") {
        title = "🛍️ ربات فروشگاهی و کاتالوگ";
        custom.storeName = "فروشگاه آنلاین";
      } else if (cat === "utility") {
        title = "🛠️ ربات ابزاری و دستیار اطلاعات";
      } else if (cat === "custom") {
        title = "💡 ایده و سناریوی آزاد (AI Custom)";
        templateId = "custom";
      }

      state.spec = { title, templateId, custom, customDesc: "" };
      state.step = "consulting";

      const consultMsg = await aiConsultant(`کاربر دسته "${title}" را انتخاب کرده است. یک پیشنهاد اولیه و راهنمایی بده.`, [], env);
      await showScreen(env, userId, chatId, screenConsulting(state.spec, consultMsg), state, false);
      return;
    }

    // ── Agree Spec → Go to BotFather Token Collection ──
    if (data === "agree_spec") {
      state.step = "ask_bot_token";
      const cfDataRaw = await env.KV.get(`cfdata:${userId}`);
      const cfData = cfDataRaw ? JSON.parse(cfDataRaw) : {};
      await showScreen(env, userId, chatId, screenAskBotToken(state.spec || { title: "ربات اختصاصی" }, cfData.accountName), state, false);
      return;
    }

    // ── Back to Spec screen ──
    if (data === "back_to_spec") {
      state.step = "consulting";
      await showScreen(env, userId, chatId, screenConsulting(state.spec || { title: "ربات اختصاصی" }), state, false);
      return;
    }

    // ── Start Build ──
    if (data === "start_build") {
      const cfStored = await env.KV.get(`cf:${userId}`);
      if (!cfStored) {
        state.step = "connect_cf_first";
        await showScreen(env, userId, chatId, screenConnectCfFirst(userName, baseUrl), state, false);
        return;
      }

      const cfToken = await decrypt(cfStored, env.MASTER_SECRET);
      const cfData = JSON.parse((await env.KV.get(`cfdata:${userId}`)) || "{}");

      if (!state.botToken) {
        state.step = "ask_bot_token";
        await showScreen(env, userId, chatId, screenAskBotToken(state.spec, cfData.accountName), state, false);
        return;
      }

      // Show Deploying screen with estimated time
      state.step = "deploying";
      await showScreen(env, userId, chatId, screenDeploying(), state, false);

      try {
        let customCode = null;
        if (state.spec?.templateId === "custom") {
          customCode = await generateCustomBot(state.spec.customDesc || state.spec.title, state.spec.custom, env);
        }

        const result = await deployBot(
          {
            cfToken,
            accountId: cfData.accountId,
            botToken: state.botToken,
            templateId: state.spec?.templateId || "ai_chat",
            custom: state.spec?.custom || {},
            customCode,
          },
          env
        );

        state.step = "deployed";
        state.deployResult = result;

        // Show Deployed success screen
        await showScreen(env, userId, chatId, screenDeployed(result), state, false);

        // AUTOMATIC SOURCE CODE DELIVERY: Send the .mjs file directly in chat
        if (result.sourceCode) {
          await tgSendDocument(
            env.BOT_TOKEN,
            chatId,
            result.sourceCode,
            `${result.botUsername}-worker.mjs`,
            `📦 <b>سورس‌کد کامل ربات @${escapeHtml(result.botUsername)}</b>\n⚡️ پلتفرم: Cloudflare Workers (ES Module)\n🛠 مهندسی و پیاده‌سازی: ${AGENT_NAME}`
          );
        }
      } catch (err) {
        console.error("Deploy error:", err);
        await tg(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `❌ <b>خطا در فرآیند استقرار:</b>\n\n${escapeHtml(err.message)}\n\nلطفاً توکن‌ها را بررسی کنید یا مجدداً /start بزنید.`,
          parse_mode: "HTML",
        });
      }
      return;
    }

    // ── Download source code again ──
    if (data === "download_source") {
      const sourceCode = state.deployResult?.sourceCode;
      const botUsername = state.deployResult?.botUsername || "bot";
      if (sourceCode) {
        await tgSendDocument(
          env.BOT_TOKEN,
          chatId,
          sourceCode,
          `${botUsername}-worker.mjs`,
          `📦 <b>سورس‌کد کامل ربات @${escapeHtml(botUsername)}</b>\n⚡️ Cloudflare Workers ES Module`
        );
      } else {
        await tg(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ سورس‌کد در حافظه موقت موجود نیست. برای ساخت جدید /start بزنید.",
        });
      }
      return;
    }
  } catch (err) {
    console.error("handleCallback exception:", err);
  }
}

// ════════════════════════════════════════════════════════════════
//  Message Handler (Conversational & Commands)
// ════════════════════════════════════════════════════════════════
async function handleMessage(message, env) {
  const userId = message.from?.id;
  const chatId = message.chat?.id || userId;
  if (!userId) return;

  const userName = message.from.first_name || "کاربر";
  const text = (message.text || "").trim();
  const baseUrl = `https://${env.WORKER_DOMAIN || "botmother.shen-zero.workers.dev"}`;

  try {
    if (text === "/start") {
      await clearState(userId, env);
      await startWizard(env, userId, chatId, userName);
      return;
    }

    let state = await getState(userId, env);
    if (!state) {
      await startWizard(env, userId, chatId, userName);
      return;
    }

    // ── 1. Cloudflare Token Detection (direct paste) ──
    if (text.startsWith("cfat_") || (text.length >= 30 && !text.includes(":") && !text.includes(" "))) {
      await tg(env.BOT_TOKEN, "sendChatAction", { chat_id: chatId, action: "typing" });
      const cfInfo = await verifyCfToken(text);
      if (cfInfo.ok) {
        const encrypted = await encrypt(text, env.MASTER_SECRET);
        await env.KV.put(`cf:${userId}`, encrypted);
        await env.KV.put(`cfdata:${userId}`, JSON.stringify({ accountId: cfInfo.accountId, accountName: cfInfo.accountName }));

        await tg(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `☁️ <b>حساب Cloudflare متصل شد!</b> ✅\n• نام حساب: <code>${escapeHtml(cfInfo.accountName)}</code>\n🧠 <b>موتور هوش مصنوعی ایجنت فعال شد!</b>`,
          parse_mode: "HTML",
        });

        // Transition immediately to the intelligent categories screen!
        state.step = "categories";
        await showScreen(env, userId, chatId, screenIntro(userName, cfInfo.accountName), state, true);
        return;
      } else {
        await tg(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "⚠️ توکن ارسال‌شده Cloudflare معتبر نبود یا دسترسی لازم را نداشت. لطفاً مطمئن شوید توکن دسترسی <b>Workers Scripts: Edit</b> و <b>Account: Read</b> دارد.",
          parse_mode: "HTML",
        });
        return;
      }
    }

    // ── Check if CF is connected before allowing conversational building ──
    const cfStored = await env.KV.get(`cf:${userId}`);
    if (!cfStored) {
      await tg(env.BOT_TOKEN, "sendMessage", {
        chat_id: chatId,
        text: `⚠️ <b>اتصال به Cloudflare الزامی است:</b>\n\nبرای اینکه هوش مصنوعی بتواند با شما گفتگو کرده و ربات را برایتان تحلیل و بسازد، ابتدا باید حساب Cloudflare خود را متصل فرمایید.`,
        parse_mode: "HTML",
      });
      await showScreen(env, userId, chatId, screenConnectCfFirst(userName, baseUrl), state, true);
      return;
    }

    // ── 2. BotFather Token Detection (`123456:ABC...`) ──
    if (/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(text)) {
      await tg(env.BOT_TOKEN, "sendChatAction", { chat_id: chatId, action: "typing" });
      const botInfoRes = await fetch(`https://api.telegram.org/bot${text}/getMe`);
      const botInfo = await botInfoRes.json();

      if (!botInfo.ok) {
        await tg(env.BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: `❌ <b>توکن تلگرام نامعتبر است:</b> ${escapeHtml(botInfo.description || "پاسخی از سرور تلگرام دریافت نشد")}\n\nلطفاً توکن صحیح را از @BotFather کپی و ارسال کنید.`,
          parse_mode: "HTML",
        });
        return;
      }

      state.botToken = text;
      state.botUsername = botInfo.result.username;
      state.botFirstName = botInfo.result.first_name;

      const cfDataRaw = await env.KV.get(`cfdata:${userId}`);
      const cfData = cfDataRaw ? JSON.parse(cfDataRaw) : {};

      // Both keys ready! Go to Pre-Flight approval
      state.step = "pre_flight";
      await showScreen(
        env,
        userId,
        chatId,
        screenPreFlight(state.spec || { title: "ربات اختصاصی" }, state.botUsername, state.botFirstName, cfData.accountName),
        state,
        true // Fresh message at bottom!
      );
      return;
    }

    // ── 3. Conversational Chatbot / Consulting Mode ──
    // Always trigger typing indicator so the user sees the bot is actively thinking!
    await tg(env.BOT_TOKEN, "sendChatAction", { chat_id: chatId, action: "typing" });

    state.chatHistory = state.chatHistory || [];
    state.chatHistory.push({ role: "user", content: text });

    // If user says "تأییده", "اوکیه", "همین خوبه", "بساز"
    if (/^(تأییده|تاییده|اوکیه|اوکی|خوبه|بساز|تایید|ادامه|برو بعدی|تایید میکنم|تایید سناریو)$/i.test(text.replace(/[\s\.\!]/g, ""))) {
      state.step = "ask_bot_token";
      const cfDataRaw = await env.KV.get(`cfdata:${userId}`);
      const cfData = cfDataRaw ? JSON.parse(cfDataRaw) : {};
      await showScreen(env, userId, chatId, screenAskBotToken(state.spec || { title: "ربات اختصاصی", templateId: "ai_chat" }, cfData.accountName), state, true);
      return;
    }

    // If user is describing a custom scenario or refining
    if (!state.spec) {
      state.spec = {
        title: "💡 سناریوی اختصاصی شما",
        templateId: "custom",
        customDesc: text,
        custom: { customPrompt: text },
      };
    } else {
      state.spec.customDesc = (state.spec.customDesc ? state.spec.customDesc + " - " : "") + text;
      if (state.spec.templateId === "ai_chat") {
        state.spec.custom.systemPrompt = text;
      }
    }

    state.step = "consulting";
    const aiAnswer = await aiConsultant(text, state.chatHistory, env);
    state.chatHistory.push({ role: "assistant", content: aiAnswer });

    // ALWAYS SEND A FRESH MESSAGE TO CHAT! NEVER EDIT OLD MESSAGES WHEN USER CHATS!
    await showScreen(env, userId, chatId, screenConsulting(state.spec, aiAnswer), state, true);
  } catch (err) {
    console.error("handleMessage exception:", err);
    await tg(env.BOT_TOKEN, "sendMessage", {
      chat_id: chatId,
      text: `⚠️ <b>خطا در پردازش پیام:</b>\n${escapeHtml(err.message)}\n\nبرای بازنشانی منو، لطفاً دستور /start را ارسال فرمایید.`,
      parse_mode: "HTML",
    });
  }
}

// ════════════════════════════════════════════════════════════════
//  Main Worker Entry
// ════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const baseUrl = `https://${url.host}`;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ── API: Connect Cloudflare Token (From WebApp) ──
    if (url.pathname === "/api/connect-cf" && request.method === "POST") {
      try {
        const body = await request.json();
        const { initData, userId: bodyUserId, cfToken } = body;
        let userId = bodyUserId;

        if (initData) {
          try {
            const params = new URLSearchParams(initData);
            const userStr = params.get("user");
            if (userStr) {
              const u = JSON.parse(userStr);
              if (u && u.id) userId = u.id;
            }
          } catch (e) {}
        }

        if (!userId) {
          return new Response(JSON.stringify({ ok: false, error: "شناسه کاربری نامعتبر است" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const cfInfo = await verifyCfToken(cfToken);
        if (!cfInfo.ok) {
          return new Response(JSON.stringify({ ok: false, error: "توکن Cloudflare نامعتبر است یا دسترسی لازم را ندارد" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const encrypted = await encrypt(cfToken, env.MASTER_SECRET);
        await env.KV.put(`cf:${userId}`, encrypted);
        await env.KV.put(`cfdata:${userId}`, JSON.stringify({ accountId: cfInfo.accountId, accountName: cfInfo.accountName }));

        // Notify user in Telegram chat and transition screen immediately
        await tg(env.BOT_TOKEN, "sendMessage", {
          chat_id: userId,
          text: `☁️ <b>اتصال به Cloudflare برقرار شد!</b> ✅\n• حساب: <code>${escapeHtml(cfInfo.accountName)}</code>\n🧠 <b>موتور هوش مصنوعی ایجنت فعال شد!</b>`,
          parse_mode: "HTML",
        });

        const state = {
          step: "categories",
          userId,
          chatId: userId,
          userName: "کاربر گرامی",
          spec: null,
          chatHistory: [],
        };

        await showScreen(env, userId, userId, screenIntro("کاربر گرامی", cfInfo.accountName), state, true);

        return new Response(JSON.stringify({ ok: true, accountName: cfInfo.accountName }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── API: Check Cloudflare Status ──
    if (url.pathname === "/api/check-cf" && request.method === "POST") {
      try {
        const body = await request.json();
        const userId = body.userId;
        const cfStored = userId ? await env.KV.get(`cf:${userId}`) : null;
        return new Response(JSON.stringify({ ok: true, connected: !!cfStored }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, connected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Telegram Webhook: Handle POST at root / or /webhook ──
    if (request.method === "POST") {
      try {
        const update = await request.json();
        if (update.callback_query) {
          await handleCallback(update.callback_query, env);
        } else if (update.message) {
          await handleMessage(update.message, env);
        }
        return new Response("OK", { status: 200 });
      } catch (err) {
        console.error("Webhook processing error:", err);
        return new Response("OK", { status: 200 });
      }
    }

    // ── Web App HTML Page (GET / or /webapp) ──
    if (request.method === "GET") {
      return new Response(webappHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
