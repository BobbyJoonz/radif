import type { SVGProps } from "react";

/**
 * One hand-drawn 16px set, 1.5px stroke, for *sources and states only*.
 * No emoji, no icon library used as decoration (DIRECTION.md §3).
 *
 * Every icon inherits `currentColor`, so its job is expressed by the type
 * around it — never by a hue of its own.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Source: a file was dropped in. */
export function IconFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 2.5h5l3 3v8H4z" />
      <path d="M9 2.5v3h3" />
    </Svg>
  );
}

/** Source: the scripted replay channel. */
export function IconReplay(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7.2a5 5 0 1 1 1.6 4.4" />
      <path d="M3 3.4v3.9h3.9" />
    </Svg>
  );
}

/** Source: a live channel. */
export function IconLive(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="1.6" />
      <path d="M5 5a4.2 4.2 0 0 0 0 6M11 5a4.2 4.2 0 0 1 0 6" />
    </Svg>
  );
}

/** Source: typed in by a human. */
export function IconManual(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.2 12.8l.7-3 6.4-6.4 2.3 2.3-6.4 6.4z" />
      <path d="M9.4 4.4l2.2 2.2" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7.2" cy="7.2" r="3.9" />
      <path d="M10.2 10.2L13 13" />
    </Svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5.6" y="5.6" width="7.6" height="7.6" rx="1.4" />
      <path d="M10.4 5.6V4.2a1.4 1.4 0 0 0-1.4-1.4H4.2a1.4 1.4 0 0 0-1.4 1.4v4.8a1.4 1.4 0 0 0 1.4 1.4h1.4" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.4 8.4l3 3 6-6.6" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.4" />
      <path d="M8 5.2V8l2 1.4" />
    </Svg>
  );
}

/** "Open this" — mirrored in RTL via the .mirror class. */
export function IconGo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.4 8h9M9 4.6L12.4 8 9 11.4" />
    </Svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3v7.2M5.2 7.4L8 10.2l2.8-2.8" />
      <path d="M3.4 12.4h9.2" />
    </Svg>
  );
}

export function sourceIcon(source: string) {
  switch (source) {
    case "file":
      return IconFile;
    case "replay":
      return IconReplay;
    case "instagram":
      return IconLive;
    default:
      return IconManual;
  }
}
