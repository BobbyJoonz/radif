import Link from "next/link";
import { BrandEmblem } from "./brand-mark";

/**
 * Shown instead of a 500 when the deployment is missing a required secret.
 *
 * A half-configured deploy is a *setup* state, not a crash: the page names the
 * missing variables (names only — never values), says where to put them, and
 * keeps the brand. This is the difference between "the site is broken" and
 * "the site needs one environment variable".
 */
export function SetupScreen({ missing }: { missing: string[] }) {
  return (
    <div className="brandscreen" role="alert">
      <BrandEmblem size={56} />
      <h1 className="brandscreen-title">این نسخه هنوز پیکربندی نشده</h1>
      <p className="brandscreen-body" lang="en" dir="ltr">
        This deployment is missing required environment variables. Set them in your
        hosting project (Vercel → Settings → Environment Variables), then redeploy.
      </p>
      <ul className="setup-missing">
        {missing.map((name) => (
          <li key={name}>
            <code className="mono ltr">{name}</code>
          </li>
        ))}
      </ul>
      <p className="brandscreen-body">
        راهنما: فایل <code className="mono ltr">README.md</code> بخش «Deploy on Vercel»
        و <code className="mono ltr">.env.example</code> در مخزن.
      </p>
      <div className="brandscreen-actions">
        <Link className="ghost-btn" href="/api/health?deep=1" prefetch={false}>
          گزارش تشخیص / diagnostics
        </Link>
      </div>
    </div>
  );
}
