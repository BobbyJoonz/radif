import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./ui.module.css";

export type ButtonVariant = "primary" | "ghost" | "quiet" | "critical";

function classes(variant: ButtonVariant, small: boolean, block: boolean, extra?: string) {
  return [
    styles.btn,
    styles[variant],
    small ? styles.btnSm : "",
    block ? styles.btnBlock : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * A button is a control, never a decoration. `primary` is the one orange action
 * on a screen; everything else is a hairline or a word.
 */
export function Button({
  variant = "ghost",
  small = false,
  block = false,
  className,
  type = "button",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  small?: boolean;
  block?: boolean;
  children: ReactNode;
}) {
  return (
    <button type={type} className={classes(variant, small, block, className)} {...rest}>
      {children}
    </button>
  );
}

/** Same shapes, but a real link (server-renderable, prefetched, shareable). */
export function ButtonLink({
  href,
  variant = "ghost",
  small = false,
  block = false,
  className,
  children,
  prefetch,
}: {
  href: string;
  variant?: ButtonVariant;
  small?: boolean;
  block?: boolean;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} prefetch={prefetch} className={classes(variant, small, block, className)}>
      {children}
    </Link>
  );
}
