import type { Locale } from "./config";

/**
 * The marketing copy. Kept out of the app dictionary on purpose: the landing page
 * and the product share a voice but not a vocabulary — a seller never reads
 * "Start free" inside the queue, and a visitor never reads "صف کار" in a button.
 *
 * Rules from DIRECTION.md §4 still apply: short sentences, no adjective soup, and
 * nothing claimed that the product does not do.
 */
export type MarketingCopy = {
  nav: { how: string; value: string; faq: string; signIn: string };
  cta: { primary: string; guest: string; guestPending: string; guestError: string };
  hero: { title: string; lede: string; micro: string };
  specimen: { title: string; note: string; overdue: string; today: string };
  value: { title: string; lede: string; items: { title: string; body: string }[] };
  how: { title: string; lede: string; steps: { title: string; body: string }[] };
  numbers: { line: string; note: string };
  faq: { title: string; items: { q: string; a: string }[] };
  band: { title: string; body: string };
  footer: {
    tagline: string;
    product: string;
    more: string;
    links: { how: string; value: string; faq: string };
    moreLinks: { demo: string; signup: string; login: string; docs: string };
    note: string;
    rights: string;
  };
  signup: {
    title: string;
    lede: string;
    name: string;
    shop: string;
    email: string;
    password: string;
    passwordHint: string;
    submit: string;
    pending: string;
    haveAccount: string;
    goLogin: string;
    orDemo: string;
    errorGeneric: string;
    errorTaken: string;
  };
};

const fa: MarketingCopy = {
  nav: { how: "چطور کار می‌کند", value: "چه چیزی می‌گیرید", faq: "پرسش‌ها", signIn: "ورود" },
  cta: {
    primary: "شروع رایگان",
    guest: "بدون ثبت‌نام امتحان کن",
    guestPending: "در حال باز کردن دمو…",
    guestError: "ورود به دمو ممکن نشد. دوباره تلاش کنید.",
  },
  hero: {
    title: "هر دایرکت، سرِ ردیفش.",
    lede: "ردیف صف کار فروشندهٔ اینستاگرامی است: هر پیام به یک اقدام روشن با شاهد تبدیل می‌شود — پرداختِ اعلام‌شده، کد رهگیریِ ثبت‌شده، آدرسِ تازه، همه از دل همان پیام.",
    micro: "بدون کارت بانکی · دادهٔ نمایشی آماده است · فارسی و انگلیسی",
  },
  specimen: {
    title: "صف امروز · دادهٔ نمایشی",
    note: "همین سطرها را در دموی زنده می‌بینید، نه تصویر ساختگی.",
    overdue: "عقب‌افتاده",
    today: "امروز",
  },
  value: {
    title: "چه چیزی می‌گیرید",
    lede: "سه چیزی که این محصول ادعا می‌کند، و سه چیز که عمداً ادعا نمی‌کند.",
    items: [
      {
        title: "ادعای پرداخت، پرداخت نیست.",
        body: "«واریز کردم» یک ادعای مشتری است و همین‌طور ثبت می‌شود. تأیید پرداخت کار یک انسان با نقش مالک است؛ سیستم هیچ‌وقت خودش آن را تأیید نمی‌کند.",
      },
      {
        title: "بدون کد رهگیری، «ارسال شد» نمی‌سازیم.",
        body: "اگر کد رهگیری در پیام یا سفارش نباشد، یک وظیفهٔ پیگیری ساخته می‌شود، نه یک جملهٔ اطمینان‌بخش بی‌پشتوانه.",
      },
      {
        title: "هر مقدار، یک شاهد.",
        body: "هر فیلدی که سیستم پیشنهاد می‌دهد به همان بازهٔ متن پیام وصل است. روی پیشنهاد کلیک کنید، خط شاهد کشیده می‌شود.",
      },
    ],
  },
  how: {
    title: "چطور کار می‌کند",
    lede: "چهار قدم، بدون جادو.",
    steps: [
      { title: "پیام می‌رسد", body: "از فایل، بازپخش دادهٔ نمایشی، یا اتصال رسمی اینستاگرام؛ همه از یک مسیر." },
      { title: "نوع درخواست و فیلدها پیشنهاد می‌شود", body: "با شاهد، با اطمینان، و با «نامشخص» جایی که پیام چیزی نگفته است." },
      { title: "شما تأیید یا اصلاح می‌کنید", body: "تصمیم انسانی همیشه بالاتر از پیشنهاد است؛ ویرایش‌ها در سابقه می‌مانند." },
      { title: "پاسخ از وضعیت ثبت‌شده ساخته می‌شود", body: "کپی یا پیش‌نمایش پاسخ هیچ‌وقت «ارسال شد» نمی‌سازد." },
    ],
  },
  numbers: {
    line: "۱۳ گفتگو در دو فروشگاه · سه وضعیت مستقل · صفر ادعای بی‌مدرک",
    note: "اعداد از دادهٔ نمایشیِ همین نسخه گرفته شده‌اند.",
  },
  faq: {
    title: "پرسش‌ها",
    items: [
      { q: "برای دیدنش باید ثبت‌نام کنم؟", a: "نه. «بدون ثبت‌نام امتحان کن» شما را داخل یک فروشگاه نمایشی می‌برد؛ همان صف، همان گفتگوها، همان پنل اقدام." },
      { q: "به اینستاگرام وصل می‌شود؟", a: "اتصال رسمی فاز بعد است و در همین نسخه با برچسب «فاز بعد» نشان داده می‌شود. الان ورودی، فایل و بازپخش است." },
      { q: "پرداخت‌ها را خودکار تأیید می‌کند؟", a: "نه، و این یک قابلیت نیست: تأیید پرداخت نیاز به مدرک یا تأیید مسئول مجاز دارد." },
      { q: "فارسی است؟", a: "فارسی، راست‌به‌چپ، با فونت پیدا و اعداد فارسی؛ نسخهٔ انگلیسی هم کامل است." },
    ],
  },
  band: { title: "امشب، صف کارت را ببین.", body: "یک دقیقه وقت می‌گیرد: بدون ثبت‌نام وارد دمو شو، یا حساب بساز." },
  footer: {
    tagline: "میز سفارش فروشگاه‌های اینستاگرامی",
    product: "محصول",
    more: "بیشتر",
    links: { how: "چطور کار می‌کند", value: "چه چیزی می‌گیرید", faq: "پرسش‌ها" },
    moreLinks: { demo: "دموی زنده", signup: "ساخت حساب", login: "ورود", docs: "مستندات" },
    note: "دادهٔ نمایشی است؛ هیچ فروشگاه واقعی پشت این نسخه نیست.",
    rights: "همهٔ حقوق محفوظ است.",
  },
  signup: {
    title: "ساخت حساب فروشگاه",
    lede: "یک نام، یک ایمیل، یک گذرواژه. بعد از آن، صف کار خودتان را می‌بینید.",
    name: "نام شما",
    shop: "نام فروشگاه",
    email: "ایمیل",
    password: "گذرواژه",
    passwordHint: "حداقل ۸ نویسه",
    submit: "ساخت حساب",
    pending: "در حال ساخت…",
    haveAccount: "حساب دارید؟",
    goLogin: "وارد شوید",
    orDemo: "یا بدون ثبت‌نام امتحان کنید",
    errorGeneric: "ساخت حساب انجام نشد.",
    errorTaken: "این ایمیل قبلاً ثبت شده است.",
  },
};

const en: MarketingCopy = {
  nav: { how: "How it works", value: "What you get", faq: "Questions", signIn: "Sign in" },
  cta: {
    primary: "Start free",
    guest: "Try without signing up",
    guestPending: "Opening the demo…",
    guestError: "Could not open the demo. Try again.",
  },
  hero: {
    title: "Every DM finds its row.",
    lede: "Radif is the work queue for an Instagram seller: each message becomes one clear action with a witness — a claimed payment, a recorded tracking code, a new address, all from the message itself.",
    micro: "No card · demo data ready · Persian and English",
  },
  specimen: {
    title: "Today's queue · demo data",
    note: "These are the rows you see in the live demo, not a mock screenshot.",
    overdue: "overdue",
    today: "today",
  },
  value: {
    title: "What you get",
    lede: "Three things this product claims, and three it refuses to claim.",
    items: [
      {
        title: "A payment claim is not a payment.",
        body: "“I paid” is the customer's assertion and is stored as one. Verifying it is a human act by the owner role; the system never does it on its own.",
      },
      {
        title: "No tracking code, no “shipped”.",
        body: "When the code is missing, Radif opens a follow-up task instead of writing a reassuring sentence it cannot support.",
      },
      {
        title: "Every value has a witness.",
        body: "Each proposed field is tied to the exact span of the message. Select a proposal and the witness line is drawn.",
      },
    ],
  },
  how: {
    title: "How it works",
    lede: "Four steps, no magic.",
    steps: [
      { title: "A message arrives", body: "From a file, a replay of demo data, or the official Instagram connection — one path." },
      { title: "Intents and fields are proposed", body: "With evidence, with confidence, and with “unknown” wherever the message said nothing." },
      { title: "You confirm or correct", body: "A human decision always outranks a proposal, and edits stay in the audit trail." },
      { title: "The reply is read back from stored state", body: "Copying or previewing a reply never marks anything as sent." },
    ],
  },
  numbers: {
    line: "13 conversations · two shops · three independent states · zero unsupported claims",
    note: "Numbers come from this build's demo data.",
  },
  faq: {
    title: "Questions",
    items: [
      { q: "Do I need to sign up to see it?", a: "No. “Try without signing up” drops you into a demo shop: the same queue, the same conversations, the same action sheet." },
      { q: "Does it connect to Instagram?", a: "The official connection is the next phase and is labelled as such. Today the input is files and replay." },
      { q: "Does it verify payments automatically?", a: "No, and that is not a missing feature: verification needs proof or an authorised human." },
      { q: "Is it Persian?", a: "Persian, right-to-left, with the Peyda typeface and Persian numerals. The English build is complete too." },
    ],
  },
  band: { title: "See your queue tonight.", body: "It takes a minute: open the demo without an account, or create one." },
  footer: {
    tagline: "The order desk for Instagram shops",
    product: "Product",
    more: "More",
    links: { how: "How it works", value: "What you get", faq: "Questions" },
    moreLinks: { demo: "Live demo", signup: "Create account", login: "Sign in", docs: "Docs" },
    note: "Synthetic data; no real shop sits behind this build.",
    rights: "All rights reserved.",
  },
  signup: {
    title: "Create a shop account",
    lede: "One name, one email, one password. Then you see your own queue.",
    name: "Your name",
    shop: "Shop name",
    email: "Email",
    password: "Password",
    passwordHint: "At least 8 characters",
    submit: "Create account",
    pending: "Creating…",
    haveAccount: "Already have an account?",
    goLogin: "Sign in",
    orDemo: "Or try without signing up",
    errorGeneric: "Could not create the account.",
    errorTaken: "That email is already registered.",
  },
};

export function getMarketingCopy(locale: Locale): MarketingCopy {
  return locale === "fa" ? fa : en;
}
