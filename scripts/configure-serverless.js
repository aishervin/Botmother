import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envPath = resolve(root, '.env');
const configPath = resolve(root, 'tgcloud/lib/config.js');
const credentialsPath = resolve(root, '.tgcloud/credentials');

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

function envValue(source, name) {
  const line = source.split(/\r?\n/).find((item) => item.trim().startsWith(`${name}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '') : '';
}

const envSource = await readOptional(envPath);
const existingConfig = await readOptional(configPath);
const credentials = `${process.env.TGCLOUD_TOKEN || ''}\n${await readOptional(credentialsPath)}`;
const appMatch = credentials.match(/app([a-z\d_-]+):/i);
const appId = process.env.TGCLOUD_APP_ID || appMatch?.[1];
if (!appId) throw new Error('اول npx tgcloud login را اجرا کن؛ شناسهٔ برنامه از فایل ورود پیدا نشد.');

let encryptionKey = process.env.POOL_ENCRYPTION_KEY || envValue(envSource, 'POOL_ENCRYPTION_KEY');
if (!encryptionKey) {
  if (process.env.CI === 'true') {
    throw new Error('در GitHub Actions مقدار ثابت POOL_ENCRYPTION_KEY را به‌عنوان secret تنظیم کن.');
  }
  const configMatch = existingConfig.match(/POOL_ENCRYPTION_KEY\s*=\s*['"]([a-f\d]{64})['"]/i);
  encryptionKey = configMatch?.[1] || randomBytes(32).toString('hex');
}
if (!/^[a-f\d]{64}$/i.test(encryptionKey)) {
  throw new Error('POOL_ENCRYPTION_KEY باید دقیقاً ۶۴ رقم هگزادسیمال باشد.');
}

const envLines = envSource.split(/\r?\n/).filter((line) => !line.trim().startsWith('POOL_ENCRYPTION_KEY='));
const prefix = envLines.join('\n').trimEnd();
await writeFile(envPath, `${prefix}${prefix ? '\n' : ''}POOL_ENCRYPTION_KEY=${encryptionKey}\n`, { mode: 0o600 });
await chmod(envPath, 0o600);

const webAppUrl = `https://app${appId}.tgcloud.ai/`;
const config = `// Generated locally by npm run configure:serverless. Keep this file out of Git.\nexport const POOL_ENCRYPTION_KEY = ${JSON.stringify(encryptionKey)};\nexport const WEBAPP_URL = ${JSON.stringify(webAppUrl)};\n`;
await writeFile(configPath, config, { mode: 0o600 });
await chmod(configPath, 0o600);
console.log('تنظیمات محلی Serverless ساخته شد؛ مقدار کلیدها نمایش داده نمی‌شود.');
