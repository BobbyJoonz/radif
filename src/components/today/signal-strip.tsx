import type { Locale } from "@/i18n/config";
import { localizeDigits } from "@/i18n/format";

/**
 * The day's signal: one bar per hour, counted from stored inbound messages.
 * Pure CSS, no JavaScript, and it is the only ambient motion on Today — the
 * current hour breathes slowly unless the visitor asks for reduced motion.
 */
export function SignalStrip({
  data,
  locale,
  nowHour,
  title,
}: {
  data: { hour: number; count: number }[];
  locale: Locale;
  nowHour: number;
  title: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div>
      <h2>{title}</h2>
      <div className="strip" aria-hidden="true">
        {data.map(({ hour, count }) => (
          <span
            key={hour}
            className="strip-bar"
            data-now={hour === nowHour ? "true" : undefined}
            style={{ height: `${Math.max(2, Math.round((count / max) * 100))}%` }}
          />
        ))}
      </div>
      <div className="strip-hours" aria-hidden="true">
        <span>{localizeDigits("00", locale)}</span>
        <span>{localizeDigits("06", locale)}</span>
        <span>{localizeDigits("12", locale)}</span>
        <span>{localizeDigits("18", locale)}</span>
        <span>{localizeDigits("24", locale)}</span>
      </div>
    </div>
  );
}
