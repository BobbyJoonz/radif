# اتصال اینستاگرام (خواندن دایرکت‌ها)

این دور **فقط خواندن** است: فروشگاه مالک اکانتش را وصل می‌کند و دایرکت‌های تازه در
همان صندوق ردیف می‌آیند و تحلیل می‌شوند. مسیر ارسال ساخته نشده و هیچ صفحه‌ای ادعای
«پاسخ ارسال شد» نمی‌کند.

## معماری ماژول

```
src/server/channels/instagram/api.ts   لایهٔ پروتکل متا (بدون I/O دیتابیس)
  ├─ buildAuthUrl / exchangeCode       OAuth با Instagram Login
  ├─ signState / verifyState           state امضاشده، ۱۰ دقیقه، متصل به فروشگاه
  ├─ verifyChallenge                   دست‌دادن وبهوک
  ├─ verifySignature                   HMAC-SHA256 روی بدنهٔ خام
  └─ parseWebhook                      پیام متنی، بدون echo/attachment/بدون mid

src/server/instagram/
  ├─ connect.ts    startConnect / completeConnect / disconnect / status
  └─ ingest.ts     رویداد → مشتری، گفتگو، پیام، و job تحلیل

src/server/crypto/seal.ts              AES-256-GCM با AAD = tenantId
```

مسیرها: `/api/channels/instagram/connect` · `/callback` · `/status` · `/:accountRef` (DELETE)
و `/api/webhooks/instagram` (GET دست‌دادن، POST رویداد).

## راه‌اندازی

| متغیر | مقدار |
|---|---|
| `INSTAGRAM_APP_ID` | از اپ متا |
| `INSTAGRAM_APP_SECRET` | از اپ متا |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | رشتهٔ دلخواه، همان در تنظیم وبهوک |
| `CHANNEL_TOKEN_ENC_KEY` | ۶۴ کاراکتر هگز (۳۲ بایت) |

1. اپ در **Meta for Developers** (نوع Business) + محصول Instagram.
2. Redirect URI: `https://<domain>/api/channels/instagram/callback`
3. Webhook: `https://<domain>/api/webhooks/instagram` · فیلد **messages**
4. در حالت Development تا ۲۵ تستر می‌توانند وصل شوند (برای پایلوت کافی است).
5. اکانت باید **Business/Creator** باشد؛ بعد از اتصال، دایرکت‌های تازه می‌آیند.

## App Review

- اسکوپ‌ها: `instagram_business_basic`، `instagram_business_manage_messages`
- screencast لازم: کلیک «اتصال» → نمایش پیام دریافتی → (در نسخهٔ بعد) ارسال پاسخ
- Business Verification شرکت معمولاً لازم است
- زمان: ۱ تا ۳ هفته؛ خود API رایگان است

## محدودیت‌ها (صادقانه)

- تاریخچهٔ پیش از اتصال نمی‌آید.
- فقط متن؛ پیوست/استیکر ذخیره نمی‌شود.
- توکن‌های منقضی/باطل‌شده در کارت تنظیمات با وضعیت `expired`/`revoked` دیده می‌شوند.
- ارسال پاسخ (و پنجرهٔ ۲۴ ساعته) مرحلهٔ بعد است؛ جای اتصال آن: بعد از `accessTokenFor`
  یک `sendMessage` اضافه می‌شود و UI دکمهٔ ارسال را فقط داخل پنجره فعال می‌کند.

## آزمون

`tests/instagram.test.ts` — ۱۰ سنجه: مهروموم (رفت‌وبرگشت، فروشگاه دیگر، دستکاری)،
state (جعلی/منقضی/اسکوپ)، امضا، پارس وبهوک، ingest (یک‌بار ذخیره، تکراری، اکانت
ناشناس) و **ساخته‌شدن job تحلیل** برای هر پیام.
