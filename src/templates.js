// ════════════════════════════════════════════════════════════════
//  Bot Templates for ®️SHΞN robotic™ / Botmother Engine
//  Each template is a complete, self-contained Cloudflare Worker (ES Module)
// ════════════════════════════════════════════════════════════════

export const TEMPLATES = {
  ai_chat: {
    id: "ai_chat",
    category: "ai",
    name: "🤖 ربات هوش مصنوعی و چت‌بات",
    desc: "گفتگوی هوشمند و طبیعی با مدل زبانی Llama-3 در لبه شبکه Cloudflare",
    icon: "🤖",
    features: [
      "مکالمه هوشمند به زبان فارسی و انگلیسی",
      "تنظیم شخصیت، پرامپت سیستمی و لحن اختصاصی",
      "نمایش حالت در حال تایپ (Typing Action)",
      "دستورات کمکی /help و پاکسازی گفتگو /clear",
      "پاسخگویی سریع بدون نیاز به سرور و قطعی",
    ],
    needsAI: true,
    bindings: (token, custom = {}) => [
      { type: "plain_text", name: "BOT_TOKEN", text: token },
      { type: "plain_text", name: "SYSTEM_PROMPT", text: custom.systemPrompt || "شما یک دستیار هوشمند و حرفه‌ای به زبان فارسی هستید. با لحنی محترمانه، شیوا و دقیق پاسخ دهید." },
      { type: "ai", name: "AI" },
    ],
    code: (custom = {}) => `// ══════════════════════════════════════════════════════════
// ®️SHΞN robotic™ — AI Conversational Telegram Bot
// Hosted on Cloudflare Workers (Serverless Edge)
// ══════════════════════════════════════════════════════════

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST") {
      return new Response("OK - Bot is active", { status: 200 });
    }

    try {
      const update = await request.json();
      const message = update.message;
      if (!message || !message.text) return new Response("OK");

      const chatId = message.chat.id;
      const text = message.text.trim();
      const userFirstName = message.from?.first_name || "کاربر گرامی";

      const tg = async (method, body) => {
        return fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(r => r.json());
      };

      // Handle /start
      if (text === "/start") {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "👋 درود " + userFirstName + "!\\n\\nمن ربات هوش مصنوعی شما هستم. هر سوالی دارید بپرسید تا با سرعت و دقت پاسخ دهم.\\n\\nدستورات:\\n• /clear — شروع گفتگوی جدید\\n• /help — راهنما",
          reply_markup: {
            inline_keyboard: [
              [{ text: "✨ شروع گفتگو", callback_data: "new_chat" }],
              [{ text: "ℹ️ درباره ربات", callback_data: "about" }]
            ]
          }
        });
        return new Response("OK");
      }

      if (text === "/clear") {
        await tg("sendMessage", { chat_id: chatId, text: "🧹 گفتگوی شما ریست شد. پیام بعدی‌تان را بفرستید." });
        return new Response("OK");
      }

      if (text === "/help") {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "📖 <b>راهنمای ربات:</b>\\n\\nفقط کافیست سوال، درخواست یا متن مورد نظرتان را در چت بفرستید تا هوش مصنوعی پردازش و پاسخ دهد.",
          parse_mode: "HTML"
        });
        return new Response("OK");
      }

      // Send Typing action
      await tg("sendChatAction", { chat_id: chatId, action: "typing" });

      // Run Workers AI
      const systemPrompt = env.SYSTEM_PROMPT || "شما یک دستیار هوشمند و مسلط به زبان فارسی هستید.";
      const aiRes = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ],
      });

      const reply = aiRes.response || "متأسفانه پاسخی دریافت نشد. لطفاً مجدداً سوال فرمایید.";
      await tg("sendMessage", {
        chat_id: chatId,
        text: reply
      });

      return new Response("OK");
    } catch (err) {
      console.error("Worker error:", err);
      return new Response("OK");
    }
  }
};`,
  },

  channel_mgr: {
    id: "channel_mgr",
    category: "channel",
    name: "📢 ربات مدیریت کانال و عضویت اجباری",
    desc: "بررسی عضویت اجباری در کانال تلگرام، خوش‌آمدگویی هوشمند و قفل محتوا",
    icon: "📢",
    features: [
      "بررسی عضویت کاربر در کانال قبل از دسترسی به امکانات",
      "پیام خوش‌آمدگویی جذاب همراه با دکمه‌های شیشه‌ای",
      "پشتیبانی از دکمه «عضو شدم / بررسی مجدد»",
      "ارسال پیام به ادمین و دریافت گزارش",
      "طراحی پایدار و بدون مسدودی با الگوریتم Fail-Open",
    ],
    needsAI: false,
    bindings: (token, custom = {}) => [
      { type: "plain_text", name: "BOT_TOKEN", text: token },
      { type: "plain_text", name: "CHANNEL_USERNAME", text: (custom.channelUsername || "aishervin").replace(/^@/, "") },
      { type: "plain_text", name: "WELCOME_TEXT", text: custom.welcomeText || "به ربات اختصاصی ما خوش آمدید!" },
    ],
    code: (custom = {}) => `// ══════════════════════════════════════════════════════════
// ®️SHΞN robotic™ — Channel Manager & Forced Join Bot
// Hosted on Cloudflare Workers (Serverless Edge)
// ══════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");

    try {
      const update = await request.json();
      const channel = env.CHANNEL_USERNAME || "aishervin";

      const tg = async (method, body) => {
        return fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(r => r.json());
      };

      const checkMember = async (userId) => {
        try {
          const res = await tg("getChatMember", { chat_id: "@" + channel, user_id: userId });
          if (!res || !res.ok) return true; // fail-open if bot isn't channel admin yet
          const status = res.result?.status;
          return status === "member" || status === "administrator" || status === "creator";
        } catch (e) {
          return true;
        }
      };

      // Handle Callbacks
      if (update.callback_query) {
        const cb = update.callback_query;
        const userId = cb.from.id;
        const chatId = cb.message.chat.id;

        await tg("answerCallbackQuery", { callback_query_id: cb.id });

        if (cb.data === "check_sub") {
          const isMember = await checkMember(userId);
          if (isMember) {
            await tg("editMessageText", {
              chat_id: chatId,
              message_id: cb.message.message_id,
              text: "✅ <b>عضویت شما تأیید شد!</b>\\n\\n" + (env.WELCOME_TEXT || "هم‌اکنون به تمامی امکانات ربات دسترسی دارید. 🎉"),
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "🌟 ورود به پنل اصلی", callback_data: "main_panel" }],
                  [{ text: "📢 کانال اطلاع‌رسانی", url: "https://t.me/" + channel }]
                ]
              }
            });
          } else {
            await tg("sendMessage", {
              chat_id: chatId,
              text: "❌ هنوز عضویت شما در کانال @" + channel + " تایید نشده است. لطفاً ابتدا عضو شوید و دوباره دکمه بررسی را بزنید."
            });
          }
        }
        return new Response("OK");
      }

      // Handle Messages
      const msg = update.message;
      if (!msg || !msg.text) return new Response("OK");

      const chatId = msg.chat.id;
      const userId = msg.from.id;

      const isMember = await checkMember(userId);
      if (!isMember) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: "🔒 <b>دسترسی محدود است!</b>\\n\\nبرای استفاده از این ربات، ابتدا باید در کانال رسمی ما عضو شوید:\\n👉 @" + channel,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 عضویت در @" + channel, url: "https://t.me/" + channel }],
              [{ text: "✅ بررسی مجدد عضویت", callback_data: "check_sub" }]
            ]
          }
        });
        return new Response("OK");
      }

      // Member confirmed
      await tg("sendMessage", {
        chat_id: chatId,
        text: "👋 سلام " + (msg.from?.first_name || "") + "!\\n\\n" + (env.WELCOME_TEXT || "به ربات خوش آمدید!"),
        reply_markup: {
          inline_keyboard: [
            [{ text: "📢 ورود به کانال", url: "https://t.me/" + channel }],
            [{ text: "💬 ارتباط با پشتیبانی", url: "https://t.me/" + channel }]
          ]
        }
      });

      return new Response("OK");
    } catch (e) {
      console.error(e);
      return new Response("OK");
    }
  }
};`,
  },

  store: {
    id: "store",
    category: "store",
    name: "🛍️ ربات فروشگاهی و کاتالوگ محصولات",
    desc: "نمایش محصولات، لیست خدمات، دریافت سفارش و ارتباط با مدیریت",
    icon: "🛍️",
    features: [
      "کاتالوگ محصولات با دسته‌بندی و دکمه‌های خرید",
      "فرم ساده ثبت سفارش و درخواست مشتری",
      "سیستم تماس با پشتیبانی و درباره ما",
      "بدون نیاز به دیتابیس خارجی روی سرورلس Edge",
    ],
    needsAI: false,
    bindings: (token, custom = {}) => [
      { type: "plain_text", name: "BOT_TOKEN", text: token },
      { type: "plain_text", name: "STORE_NAME", text: custom.storeName || "فروشگاه اختصاصی" },
    ],
    code: (custom = {}) => `// ══════════════════════════════════════════════════════════
// ®️SHΞN robotic™ — E-Commerce & Catalog Bot
// Hosted on Cloudflare Workers (Serverless Edge)
// ══════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");

    try {
      const update = await request.json();
      const tg = async (method, body) => {
        return fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(r => r.json());
      };

      if (update.callback_query) {
        const cb = update.callback_query;
        const chatId = cb.message.chat.id;
        await tg("answerCallbackQuery", { callback_query_id: cb.id });

        if (cb.data === "catalog") {
          await tg("sendMessage", {
            chat_id: chatId,
            text: "📦 <b>کاتالوگ خدمات و محصولات:</b>\\n\\n۱. سرویس طلایی — پشتیبانی ۲۴ ساعته\\n۲. سرویس نقره‌ای — ماهانه\\n۳. بسته ویژه سازمانی\\n\\nبرای ثبت سفارش پیام دهید یا با پشتیبانی تماس بگیرید.",
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🛒 ثبت سفارش آنلاین", callback_data: "order" }],
                [{ text: "🔙 بازگشت به منو", callback_data: "home" }]
              ]
            }
          });
        } else if (cb.data === "order") {
          await tg("sendMessage", {
            chat_id: chatId,
            text: "📝 لطفاً نام، شماره تماس و محصول مورد نظرتان را در یک پیام ارسال کنید تا کارشناسان ما با شما ارتباط برقرار کنند."
          });
        } else if (cb.data === "home") {
          await tg("sendMessage", {
            chat_id: chatId,
            text: "🛍 به " + (env.STORE_NAME || "فروشگاه") + " خوش آمدید! یکی از بخش‌ها را انتخاب کنید:",
            reply_markup: {
              inline_keyboard: [
                [{ text: "📦 مشاهده کاتالوگ", callback_data: "catalog" }],
                [{ text: "🛍 ثبت سفارش", callback_data: "order" }],
                [{ text: "📞 پشتیبانی و تماس", callback_data: "contact" }]
              ]
            }
          });
        }
        return new Response("OK");
      }

      const msg = update.message;
      if (!msg || !msg.text) return new Response("OK");

      const chatId = msg.chat.id;
      await tg("sendMessage", {
        chat_id: chatId,
        text: "🛍 <b>به " + (env.STORE_NAME || "فروشگاه") + " خوش آمدید!</b>\\n\\nجهت بررسی محصولات و خدمات، از منوی زیر استفاده فرمایید:",
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📦 مشاهده کاتالوگ", callback_data: "catalog" }],
            [{ text: "🛍 ثبت سفارش", callback_data: "order" }],
            [{ text: "📞 پشتیبانی و تماس", callback_data: "contact" }]
          ]
        }
      });

      return new Response("OK");
    } catch (e) {
      return new Response("OK");
    }
  }
};`,
  },

  utility: {
    id: "utility",
    category: "utility",
    name: "🛠️ ربات ابزاری، دستیار و پردازش اطلاعات",
    desc: "مجموعه ابزارهای کاربردی: اطلاعات کاربری تلگرام، تبدیل متن، پینگ و آمار",
    icon: "🛠️",
    features: [
      "دریافت اطلاعات دقیق اکانت تلگرام (ID, Username, Name)",
      "ابزار شمارش کلمات و پردازش کاراکترها",
      "پینگ و بررسی آنلاین بودن سرور",
      "دکمه‌های دسترسی سریع بدون تاخیر",
    ],
    needsAI: false,
    bindings: (token) => [
      { type: "plain_text", name: "BOT_TOKEN", text: token },
    ],
    code: () => `// ══════════════════════════════════════════════════════════
// ®️SHΞN robotic™ — Utility & Tools Telegram Bot
// Hosted on Cloudflare Workers (Serverless Edge)
// ══════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");

    try {
      const update = await request.json();
      const tg = async (method, body) => {
        return fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/" + method, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(r => r.json());
      };

      if (update.callback_query) {
        const cb = update.callback_query;
        const chatId = cb.message.chat.id;
        await tg("answerCallbackQuery", { callback_query_id: cb.id });

        if (cb.data === "my_info") {
          const from = cb.from;
          await tg("sendMessage", {
            chat_id: chatId,
            text: "👤 <b>مشخصات اکانت شما:</b>\\n\\n🆔 آیدی عددی: <code>" + from.id + "</code>\\n🏷 نام: " + (from.first_name || "") + "\\n🔗 یوزرنیم: @" + (from.username || "ندارد") + "\\n🌐 زبان: " + (from.language_code || "fa"),
            parse_mode: "HTML"
          });
        }
        return new Response("OK");
      }

      const msg = update.message;
      if (!msg || !msg.text) return new Response("OK");

      const chatId = msg.chat.id;
      const text = msg.text.trim();

      if (text === "/ping") {
        const start = Date.now();
        await tg("sendMessage", { chat_id: chatId, text: "🏓 Pong! تاخیر سرور: " + (Date.now() - start) + "ms" });
        return new Response("OK");
      }

      await tg("sendMessage", {
        chat_id: chatId,
        text: "🛠 <b>جعبه‌ابزار هوشمند تلگرام</b>\\n\\nیک گزینه را انتخاب کنید یا پیامی بفرستید:",
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "👤 مشخصات اکانت من (ID)", callback_data: "my_info" }],
            [{ text: "⚡️ تست پینگ سرور (/ping)", callback_data: "ping" }]
          ]
        }
      });

      return new Response("OK");
    } catch (e) {
      return new Response("OK");
    }
  }
};`,
  },

  echo: {
    id: "echo",
    category: "basic",
    name: "🪞 ربات اِکو ساده (تکرارکننده)",
    desc: "تکرار پیام‌ها و پاسخ به دستورات — سبک‌ترین ساختار برای تست اولیه",
    icon: "🪞",
    features: ["تکرار تمامی پیام‌ها", "بدون نیاز به هوش مصنوعی", "پاسخ سریع و سبک"],
    needsAI: false,
    bindings: (token) => [
      { type: "plain_text", name: "BOT_TOKEN", text: token },
    ],
    code: () => `export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");
    const u = await request.json();
    if (u.message?.text) {
      await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: u.message.chat.id, text: "📢 " + u.message.text }),
      });
    }
    return new Response("OK");
  }
};`,
  },
};

export function getTemplate(id) {
  return TEMPLATES[id] || null;
}

export function listTemplates() {
  return Object.values(TEMPLATES);
}
