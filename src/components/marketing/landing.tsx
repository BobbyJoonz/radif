import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { GuestButton } from "@/components/marketing/guest-button";
import type { Locale } from "@/i18n/config";
import { otherLocale } from "@/i18n/config";
import { getMarketingCopy } from "@/i18n/marketing";

/**
 * The public landing page.
 *
 * Grammar: a scroll-story with the product itself as the evidence — the first
 * screen carries a real specimen of the queue (the same rows the demo serves),
 * one sentence of what this is, and one action. Every later section answers the
 * next question a seller actually has ("what do I get", "how does it work", "what
 * does it refuse to do"), and the honesty section is a feature, not a disclaimer.
 */
export function Landing({ locale, signedIn }: { locale: Locale; signedIn: boolean }) {
  const t = getMarketingCopy(locale);
  const appHref = `/${locale}/today`;
  const signupHref = `/${locale}/signup`;
  const loginHref = `/${locale}/login`;

  const rows = [
    {
      name: locale === "fa" ? "نگار احمدی" : "Negar Ahmadi",
      ref: "DEMO-ORD-1042",
      why:
        locale === "fa"
          ? "اعلام پرداخت · تغییر آدرس · درخواست رهگیری"
          : "payment claim · address change · tracking",
      next: locale === "fa" ? "تطبیق پرداخت و تکمیل آدرس" : "Reconcile payment, complete address",
      due: locale === "fa" ? "۲ روز پیش" : "2 days ago",
      tag: t.specimen.overdue,
      late: true,
    },
    {
      name: locale === "fa" ? "شیرین کیانی" : "Shirin Kiani",
      ref: "DEMO-ORD-1039",
      why: locale === "fa" ? "مبلغ بدون واحد روشن" : "amount without a unit",
      next: locale === "fa" ? "تأیید مبلغ با فروشنده" : "Confirm the amount",
      due: locale === "fa" ? "۱۴:۳۰" : "14:30",
      tag: t.specimen.today,
      late: false,
    },
    {
      name: locale === "fa" ? "حسین مرادی" : "Hossein Moradi",
      ref: "DEMO-ORD-1031",
      why: locale === "fa" ? "پرسش محصول" : "product question",
      next: locale === "fa" ? "پاسخ آماده: موجودی و قیمت" : "Ready answer: stock and price",
      due: locale === "fa" ? "۱۸:۰۰" : "18:00",
      tag: t.specimen.today,
      late: false,
    },
  ];

  return (
    <div className="mkt">
      <a className="skip-link" href="#main">
        {locale === "fa" ? "رفتن به محتوای اصلی" : "Skip to content"}
      </a>

      <header className="mkt-head">
        <div className="mkt-head-inner">
          <Link href={`/${locale}`} className="mkt-brand" aria-label="ردیف · Radif">
            <BrandMark priority />
          </Link>
          <nav className="mkt-nav" aria-label={locale === "fa" ? "بخش‌های صفحه" : "Sections"}>
            <a href="#value">{t.nav.value}</a>
            <a href="#how">{t.nav.how}</a>
            <a href="#faq">{t.nav.faq}</a>
          </nav>
          <div className="mkt-actions">
            <Link href={`/${otherLocale(locale)}`} className="mkt-lang" hrefLang={otherLocale(locale)}>
              {otherLocale(locale) === "en" ? "EN" : "فا"}
            </Link>
            {signedIn ? (
              <Link href={appHref} className="marketing-cta">
                {locale === "fa" ? "رفتن به صف" : "Open the queue"}
              </Link>
            ) : (
              <>
                <Link href={loginHref} className="mkt-signin">
                  {t.nav.signIn}
                </Link>
                <Link href={signupHref} className="marketing-cta">
                  {t.cta.primary}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main">
        <section className="mkt-hero">
          <div className="mkt-hero-copy">
            <h1 className="mkt-h1">{t.hero.title}</h1>
            <p className="mkt-lede">{t.hero.lede}</p>
            <div className="mkt-ctas">
              <Link href={signupHref} className="marketing-cta is-primary">
                {t.cta.primary}
              </Link>
              <GuestButton
                locale={locale}
                label={t.cta.guest}
                pendingLabel={t.cta.guestPending}
                errorLabel={t.cta.guestError}
              />
            </div>
            <p className="mkt-micro">{t.hero.micro}</p>
          </div>

          <aside className="mkt-specimen" aria-label={t.specimen.title}>
            <div className="mkt-specimen-head">
              <span>{t.specimen.title}</span>
              <span className="mkt-specimen-live">
                <i aria-hidden="true" />
                {locale === "fa" ? "زنده" : "live"}
              </span>
            </div>
            <ul className="mkt-rows">
              {rows.map((row) => (
                <li key={row.ref} className="mkt-row">
                  <span className={`mkt-mark ${row.late ? "is-late" : ""}`} aria-hidden="true" />
                  <span className="mkt-row-who">
                    <b>{row.name}</b>
                    <small className="mono ltr">{row.ref}</small>
                  </span>
                  <span className="mkt-row-why">{row.why}</span>
                  <span className="mkt-row-next">{row.next}</span>
                  <span className={`mkt-row-due ${row.late ? "is-late" : ""}`}>
                    {row.due}
                    <small>{row.tag}</small>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mkt-witness">
              <p>
                {locale === "fa"
                  ? "«واریز کردم، کد رهگیری رو می‌فرستید؟ آدرسم هم عوض شده…»"
                  : "“I paid — will you send the tracking code? My address changed…”"}
              </p>
              <div className="mkt-witness-marks">
                <span className="mkt-hl">
                  {locale === "fa" ? "واریز کردم" : "I paid"}
                </span>
                <span className="mkt-hl">
                  {locale === "fa" ? "آدرسم هم عوض شده" : "my address changed"}
                </span>
                <span className="mkt-witness-note">
                  {locale === "fa" ? "شاهدِ هر پیشنهاد" : "the witness for each proposal"}
                </span>
              </div>
            </div>
            <p className="mkt-specimen-note">{t.specimen.note}</p>
          </aside>
        </section>

        <section className="mkt-section" id="value" aria-labelledby="value-title">
          <div className="mkt-section-head">
            <h2 id="value-title">{t.value.title}</h2>
            <p>{t.value.lede}</p>
          </div>
          <div className="mkt-values">
            {t.value.items.map((item) => (
              <article key={item.title} className="mkt-value">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mkt-section" id="how" aria-labelledby="how-title">
          <div className="mkt-section-head">
            <h2 id="how-title">{t.how.title}</h2>
            <p>{t.how.lede}</p>
          </div>
          <ol className="mkt-steps">
            {t.how.steps.map((step) => (
              <li key={step.title}>
                <span className="mkt-step-line" aria-hidden="true" />
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mkt-numbers" aria-label={t.numbers.note}>
          <p className="mkt-numbers-line">{t.numbers.line}</p>
          <p className="mkt-numbers-note">{t.numbers.note}</p>
        </section>

        <section className="mkt-section" id="faq" aria-labelledby="faq-title">
          <div className="mkt-section-head">
            <h2 id="faq-title">{t.faq.title}</h2>
          </div>
          <div className="mkt-faq">
            {t.faq.items.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mkt-band" aria-labelledby="band-title">
          <div className="mkt-band-inner">
            <h2 id="band-title">{t.band.title}</h2>
            <p>{t.band.body}</p>
            <div className="mkt-ctas">
              <Link href={signupHref} className="marketing-cta is-primary">
                {t.cta.primary}
              </Link>
              <GuestButton
                locale={locale}
                label={t.cta.guest}
                pendingLabel={t.cta.guestPending}
                errorLabel={t.cta.guestError}
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="mkt-foot">
        <div className="mkt-foot-inner">
          <div className="mkt-foot-brand">
            <BrandMark />
            <p>{t.footer.tagline}</p>
            <p className="mkt-foot-note">{t.footer.note}</p>
          </div>
          <nav className="mkt-foot-cols" aria-label={t.footer.product}>
            <div>
              <h2>{t.footer.product}</h2>
              <a href="#value">{t.footer.links.value}</a>
              <a href="#how">{t.footer.links.how}</a>
              <a href="#faq">{t.footer.links.faq}</a>
            </div>
            <div>
              <h2>{t.footer.more}</h2>
              <Link href={appHref}>{t.footer.moreLinks.demo}</Link>
              <Link href={signupHref}>{t.footer.moreLinks.signup}</Link>
              <Link href={loginHref}>{t.footer.moreLinks.login}</Link>
              <a href="https://github.com/BobbyJoonz/radif" rel="noreferrer noopener" target="_blank">
                {t.footer.moreLinks.docs}
              </a>
            </div>
          </nav>
        </div>
        <div className="mkt-foot-base">
          <span>
            © {new Date().getFullYear()} ردیف · Radif — {t.footer.rights}
          </span>
          <span>{locale === "fa" ? "ساخته‌شده برای فروشندهٔ فارسی‌زبان" : "Built for Persian-speaking sellers"}</span>
        </div>
      </footer>
    </div>
  );
}
