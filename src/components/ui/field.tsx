import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import styles from "./ui.module.css";

/**
 * Labels are a rule above the value, not a floating caption: in a Persian form
 * the label must survive RTL reflow and a 200% zoom.
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  aside,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        <span>{label}</span>
        {aside ? <span className={styles.labelValue}>{aside}</span> : null}
      </label>
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {error ? (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A field whose value is a machine value (email, phone, code, id). */
export function MachineInput({
  inputMode = "text",
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { inputMode?: "text" | "numeric" | "tel" | "email" }) {
  return (
    <input
      inputMode={inputMode}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      className={[styles.input, styles.machineInput, className ?? ""].join(" ").trim()}
      {...rest}
    />
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[styles.input, className ?? ""].join(" ").trim()} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={[styles.textarea, className ?? ""].join(" ").trim()} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={[styles.select, className ?? ""].join(" ").trim()} {...rest}>
      {children}
    </select>
  );
}

export function FieldRow({ children }: { children: ReactNode }) {
  return <div className={styles.fieldRow}>{children}</div>;
}

/** One fact per line, key in lav-grey, value in chalk. Never a card. */
export function KeyValue({ rows }: { rows: { key: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className={styles.kv}>
      {rows.map((row, index) => (
        <div className={styles.kvRow} key={index}>
          <dt className={styles.kvKey}>{row.key}</dt>
          <dd className={styles.kvValue}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
