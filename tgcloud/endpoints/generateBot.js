import { EndpointError, InputFile, api } from 'sdk';
import { CATEGORIES, generateBotSource, saveSession } from '../lib/botmother.js';

export default async function (input, ctx) {
  const userId = String(ctx?.initData?.user?.id || input?.userId || '');
  if (!userId) {
    throw new EndpointError('شناسه کاربر تلگرام نامعتبر است. لطفاً صفحه را از درون ربات تلگرام باز کنید.');
  }

  const templateId = input?.templateId || 'custom';
  const category = CATEGORIES[templateId] || CATEGORIES.custom;
  const botName = typeof input?.botName === 'string' ? input.botName.trim() : '';
  const brief = typeof input?.brief === 'string' ? input.brief.trim() : '';
  const features = typeof input?.features === 'string' ? input.features.trim() : '';

  const fullPrompt = [
    botName ? `نام ربات: ${botName}` : '',
    brief ? `توضیحات: ${brief}` : '',
    features ? `قابلیت‌ها: ${features}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const state = {
    templateId,
    title: category.title,
    step: 'generated_from_webapp',
    history: [
      { role: 'user', content: fullPrompt || category.prompt },
    ],
    brief: fullPrompt || category.prompt,
  };

  let generated;
  try {
    generated = await generateBotSource(userId, state);
  } catch (err) {
    console.error('generateBot error:', err);
    throw new EndpointError('تولید سورس ربات با خطا مواجه شد. لطفاً دوباره تلاش فرمایید.');
  }

  if (!generated) {
    throw new EndpointError('متأسفانه کد ربات تولید نشد. مجدداً امتحان کنید.');
  }

  state.source = generated;
  await saveSession(userId, state);

  // Send the result to user in Telegram
  try {
    const bytes = new TextEncoder().encode(generated);
    const fileName = `botmother-${templateId}.js`;

    await api.sendMessage({
      chat_id: userId,
      text: `🎉 **مشخصات ربات شما از طریق Mini App دریافت شد!**\n\n` +
        `• عنوان: ${botName || category.title}\n` +
        `• دسته: ${category.title}\n` +
        `• توضیحات: ${brief || 'پیش‌فرض'}\n\n` +
        `فایل سورس تولیدشده در ادامه ارسال می‌گردد:`,
    });

    await api.sendDocument({
      chat_id: userId,
      document: new InputFile(bytes, fileName, { type: 'text/javascript' }),
      caption: `📁 سورس Telegram Serverless: ${fileName}\nتولید شده از طریق Mini App استودیو BotMother.`,
    });
  } catch (err) {
    console.error('Failed to send document to user chat:', err);
  }

  return {
    ok: true,
    message: 'سورس ربات با موفقیت تولید شد و در پیام خصوصی تلگرام برای شما ارسال گردید!',
    code: generated,
    templateId,
    title: category.title,
  };
}
