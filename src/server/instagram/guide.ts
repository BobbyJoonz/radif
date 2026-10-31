/**
 * The connect-Instagram guide, as data.
 *
 * The step list lives here rather than in JSX so it can be tested: each step knows
 * what state makes it "done", and the page only renders what this function returns.
 * The copy is deliberately operational — the exact URL, the exact field to subscribe,
 * the exact place in the Meta dashboard — because "no messages arrive" is almost
 * always one of these settings, not a code bug.
 */
export type GuideState = {
  appConfigured: boolean;
  verifyTokenSet: boolean;
  sealKeySet: boolean;
  webhookOrigin: string;
  connectedAccount: string | null;
  tokenStatus: "valid" | "invalid" | "unknown" | "absent";
  lastWebhookAt: string | null;
  pendingWebhooks: number;
};

export type GuideStep = {
  key: string;
  index: number;
  title: string;
  body: string;
  ok: boolean;
  copyValue?: string;
  hint?: string;
};

export function buildGuide(state: GuideState): { steps: GuideStep[]; ready: boolean; blocker: string | null } {
  const webhookUrl = `${state.webhookOrigin}/api/webhooks/instagram`;
  const steps: GuideStep[] = [
    {
      key: "account_type",
      index: 1,
      title: "اکانت اینستاگرام حرفه‌ای",
      body: "اکانت فروشگاه باید Business یا Creator باشد و به یک Facebook Page وصل باشد. اکانت شخصی هیچ پیامی از طریق API نمی‌دهد.",
      ok: Boolean(state.connectedAccount),
      hint: "اینستاگرام → Settings → Account type: Professional",
    },
    {
      key: "app",
      index: 2,
      title: "اپ متا و کلیدها",
      body: "در Meta for Developers یک App بساز و INSTAGRAM_APP_ID و INSTAGRAM_APP_SECRET را در محیط استقرار بگذار.",
      ok: state.appConfigured,
      hint: "App Dashboard → App settings → Basic",
    },
    {
      key: "webhook",
      index: 3,
      title: "آدرس وبهوک",
      body: "همین آدرس را در Meta → Webhooks → Instagram وارد کن. کد در همین مسیر آماده است.",
      ok: Boolean(state.verifyTokenSet),
      copyValue: webhookUrl,
      hint: "بدون اتصال وبهوک، هیچ دایرکتی در ردیف بالا نمی‌آید",
    },
    {
      key: "verify_token",
      index: 4,
      title: "Verify Token",
      body: "مقداری که برای INSTAGRAM_WEBHOOK_VERIFY_TOKEN گذاشته‌ای را دقیقاً در همان فرم وبهوک متا وارد کن؛ باید نویسه‌به‌نویسه یکی باشد.",
      ok: state.verifyTokenSet,
    },
    {
      key: "subscribe",
      index: 5,
      title: "اشتراک رویداد messages",
      body: "در همان صفحهٔ وبهوک، فیلد messages را Subscribe کن. این قدم بیشتر از همه فراموش می‌شود و نتیجه‌اش «هیچ پیامی نمی‌آید» است.",
      ok: state.lastWebhookAt !== null,
      hint: state.lastWebhookAt ? `آخرین رویداد: ${state.lastWebhookAt}` : "هنوز هیچ رویدادی نرسیده",
    },
    {
      key: "connect",
      index: 6,
      title: "اتصال اکانت در ردیف",
      body: "دکمهٔ «اتصال اکانت اینستاگرام» را بزن، در متا اجازه بده و برگرد. توکن رمزنگاری‌شده ذخیره می‌شود.",
      ok: Boolean(state.connectedAccount) && state.tokenStatus === "valid",
      hint: state.tokenStatus === "invalid" ? "توکن معتبر نیست؛ دوباره وصل کن" : undefined,
    },
  ];

  const ready = state.appConfigured && state.verifyTokenSet && state.sealKeySet;
  const blocker = !state.sealKeySet
    ? "CHANNEL_TOKEN_ENC_KEY تنظیم نشده است؛ توکن کانال نمی‌تواند ذخیره شود."
    : !state.appConfigured
      ? "INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET تنظیم نشده‌اند."
      : !state.verifyTokenSet
        ? "INSTAGRAM_WEBHOOK_VERIFY_TOKEN تنظیم نشده است."
        : null;

  return { steps, ready, blocker };
}

/** Oldest unanswered webhook is the single number that matters when diagnosing. */
export function diagnose(state: { lastWebhookAt: string | null; pendingWebhooks: number; tokenStatus: string }): string {
  if (state.pendingWebhooks > 0) return "رویدادها ذخیره شده‌اند ولی پردازش نشده‌اند؛ drain را اجرا کن.";
  if (state.tokenStatus === "invalid") return "توکن متا معتبر نیست؛ اتصال را تجدید کن.";
  if (state.lastWebhookAt === null) return "هیچ وبهوکی نرسیده: اشتراک messages یا آدرس وبهوک را بررسی کن.";
  return "اتصال سالم است.";
}
