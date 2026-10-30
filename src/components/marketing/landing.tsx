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
      chips:
        locale === "fa"
          ? ["اعلام پرداخت", "تغییر آدرس"]
          : ["payment claim", "address change"],
      next: locale === "fa" ? "تطبیق پرداخت و تکمیل آدرس" : "Reconcile payment, complete address",
      due: locale === "fa" ? "۲ روز پیش" : "2 days ago",
      tag: t.specimen.overdue,
      late: true,
      selected: true,
    },
    {
      name: locale === "fa" ? "شیرین کیانی" : "Shirin Kiani",
      ref: "DEMO-ORD-1039",
      chips: locale === "fa" ? ["مبلغ بدون واحد"] : ["amount without a unit"],
      next: locale === "fa" ? "تأیید مبلغ با فروشنده" : "Confirm the amount",
      due: locale === "fa" ? "۱۴:۳۰" : "14:30",
      tag: t.specimen.today,
      late: false,
      selected: false,
    },
    {
      name: locale === "fa" ? "حسین مرادی" : "Hossein Moradi",
      ref: "DEMO-ORD-1031",
      chips: locale === "fa" ? ["پرسش محصول"] : ["product question"],
      next: locale === "fa" ? "پاسخ آماده: موجودی و قیمت" : "Ready answer: stock and price",
      due: locale === "fa" ? "۱۸:۰۰" : "18:00",
      tag: t.specimen.today,
      late: false,
      selected: false,
    },
    {
      name: locale === "fa" ? "رضا نیک‌پور" : "Reza Nikpour",
      ref: "DEMO-ORD-1027",
      chips: locale === "fa" ? ["شکایت تأخیر", "رهگیری ثبت نشده"] : ["late delivery", "no tracking code"],
      next: locale === "fa" ? "ارجاع به مسئول" : "Escalate to the owner",
      due: locale === "fa" ? "دیروز" : "yesterday",
      tag: t.specimen.overdue,
      late: true,
      selected: false,
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
            <BrandMark priority size="sm" />
          </Link>
          <span className="mkt-head-rule" aria-hidden="true" />
          <nav className="mkt-nav" aria-label={locale === "fa" ? "بخش‌های صفحه" : "Sections"}>
            <a href="#value">
              <span>{t.nav.value}</span>
            </a>
            <a href="#how">
              <span>{t.nav.how}</span>
            </a>
            <a href="#faq">
              <span>{t.nav.faq}</span>
            </a>
          </nav>
          <span className="mkt-head-spacer" aria-hidden="true" />
          <div className="mkt-actions">
            <Link href={`/${otherLocale(locale)}`} className="mkt-lang" hrefLang={otherLocale(locale)}>
              {otherLocale(locale) === "en" ? "EN" : "فا"}
            </Link>
            {signedIn ? (
              <Link href={appHref} className="marketing-cta is-primary">
                {locale === "fa" ? "رفتن به صف" : "Open the queue"}
              </Link>
            ) : (
              <>
                <Link href={loginHref} className="mkt-signin">
                  {t.nav.signIn}
                </Link>
                <Link href={signupHref} className="marketing-cta is-primary">
                  {t.cta.primary}
                </Link>
              </>
            )}
            <details className="mkt-mobile">
              <summary aria-label={locale === "fa" ? "فهرست" : "Menu"}>
                <span aria-hidden="true" />
              </summary>
              <nav>
                <a href="#value">{t.nav.value}</a>
                <a href="#how">{t.nav.how}</a>
                <a href="#faq">{t.nav.faq}</a>
                <Link href={loginHref}>{t.nav.signIn}</Link>
              </nav>
            </details>
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

          <div className="mkt-specimen-wrap">
            <aside className="mkt-specimen" aria-label={t.specimen.title}>
              <div className="mkt-specimen-head">
                <span className="mkt-specimen-title">{t.specimen.title}</span>
                <span className="mkt-specimen-live">
                  <i aria-hidden="true" />
                  {locale === "fa" ? "زنده" : "live"}
                </span>
              </div>

              <p className="mkt-specimen-counts">
                <b>۹</b> {locale === "fa" ? "کار باز" : "open"}
                <span aria-hidden="true">·</span>
                <b className="is-hot">۳</b> {locale === "fa" ? "عقب‌افتاده" : "overdue"}
                <span aria-hidden="true">·</span>
                <b>۱</b> {locale === "fa" ? "نیازمند بررسی" : "needs review"}
              </p>

              <ul className="mkt-rows">
                {rows.map((row) => (
                  <li key={row.ref} className="mkt-row" data-selected={row.selected ? "true" : undefined}>
                    <span className={`mkt-mark ${row.late ? "is-late" : ""}`} aria-hidden="true" />
                    <span className="mkt-row-who">
                      <b>{row.name}</b>
                      <small className="mono ltr">{row.ref}</small>
                    </span>
                    <span className="mkt-row-chips">
                      {row.chips.map((chip) => (
                        <span key={chip} className="mkt-chip">
                          {chip}
                        </span>
                      ))}
                    </span>
                    <span className="mkt-row-next">{row.next}</span>
                    <span className={`mkt-row-due ${row.late ? "is-late" : ""}`}>
                      {row.due}
                      <small>{row.tag}</small>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mkt-thread">
                <div className="mkt-thread-head">
                  <span className="mkt-thread-who">{rows[0].name}</span>
                  <span className="mkt-thread-meta">
                    {locale === "fa" ? "۲۱:۰۴ · پیام مشتری" : "21:04 · inbound"}
                  </span>
                </div>
                <p className="mkt-thread-text">
                  {locale === "fa"
                    ? "«واریز کردم، کد رهگیری رو می‌فرستید؟ آدرسم هم عوض شده، هنوز نفرستادید؟»"
                    : "“I paid, will you send the tracking code? My address changed and it still hasn't shipped.”"}
                </p>
                <div className="mkt-thread-marks">
                  <span className="mkt-hl">{locale === "fa" ? "واریز کردم" : "I paid"}</span>
                  <span className="mkt-hl">{locale === "fa" ? "آدرسم هم عوض شده" : "my address changed"}</span>
                  <span className="mkt-thread-note">
                    {locale === "fa" ? "شاهدِ هر پیشنهاد" : "the witness for each proposal"}
                  </span>
                </div>
              </div>

              <div className="mkt-states">
                <span className="mkt-state">
                  {locale === "fa" ? "سفارش" : "order"}
                  <b>{locale === "fa" ? "تأیید شده" : "confirmed"}</b>
                </span>
                <span className="mkt-state is-hot">
                  {locale === "fa" ? "پرداخت" : "payment"}
                  <b>{locale === "fa" ? "اعلام‌شده" : "claimed"}</b>
                </span>
                <span className="mkt-state">
                  {locale === "fa" ? "ارسال" : "shipment"}
                  <b>{locale === "fa" ? "در آماده‌سازی" : "preparing"}</b>
                </span>
              </div>

              <p className="mkt-specimen-note">{t.specimen.note}</p>
            </aside>
          </div>
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
