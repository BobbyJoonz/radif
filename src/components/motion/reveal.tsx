"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { AnimatedGroup } from "./core/animated-group";
import { InView } from "./core/in-view";
import { Magnetic } from "./core/magnetic";
import { TextEffect } from "./core/text-effect";
import { TextShimmer } from "./core/text-shimmer";
import { Tilt } from "./core/tilt";

/**
 * The site's motion vocabulary, in one place.
 *
 * Everything here is a thin, opinionated wrapper around a motion-primitive, and every
 * wrapper has a static fallback: when the visitor asks for reduced motion (or the
 * component is rendered before hydration), the content is plain, readable text with
 * the same markup and the same classes. Motion is decoration — never the thing that
 * carries meaning or the thing that keeps content off the screen.
 *
 * The curve is the same everywhere (a soft out-expo), durations are short, and nothing
 * loops except the one shimmer on the live badge, which is a status, not a heading.
 */
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Motion is allowed only after mount and only if the visitor has not asked for less.
 * Before mount the animated markup is rendered as-is, which is exactly what the server
 * sent — that is what keeps hydration clean.
 */
function useMotionAllowed(): boolean {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !reduced;
}

type Tag = "h1" | "h2" | "h3" | "p" | "div" | "span";

function Static({ as, className, children }: { as: Tag; className?: string; children: ReactNode }) {
  const Component = as;
  return <Component className={className}>{children}</Component>;
}

/** A heading that reveals per word: the sentence is still one sentence to a reader. */
export function MotionTitle({
  text,
  as = "h1",
  className,
  preset = "fade-in-blur",
  per = "word",
  delay = 0,
}: {
  text: string;
  as?: Tag;
  className?: string;
  preset?: "blur" | "fade-in-blur" | "scale" | "fade" | "slide";
  per?: "word" | "char" | "line";
  delay?: number;
}) {
  const allowed = useMotionAllowed();
  if (!allowed) return <Static as={as} className={className}>{text}</Static>;
  return (
    <TextEffect
      as={as}
      per={per}
      preset={preset}
      className={className}
      delay={delay}
      speedReveal={1.1}
      segmentTransition={{ duration: 0.55, ease: EASE }}
    >
      {text}
    </TextEffect>
  );
}

/** One quiet loop, for a status word only. */
export function MotionShimmer({ text, className, as = "span" }: { text: string; className?: string; as?: Tag }) {
  const allowed = useMotionAllowed();
  if (!allowed) return <Static as={as} className={className}>{text}</Static>;
  return (
    <TextShimmer
      as={as}
      duration={3.2}
      spread={1.6}
      className={
        "inline-block [--base-color:#B5B6DD] [--base-gradient-color:#ECECF6] " + (className ?? "")
      }
    >
      {text}
    </TextShimmer>
  );
}

/** Children rise in sequence. Each child keeps its own element; the wrapper is a div. */
export function MotionStagger({
  children,
  className,
  as = "div",
  asChild = "div",
  preset = "blur-slide",
}: {
  children: ReactNode;
  className?: string;
  as?: Tag;
  asChild?: Tag;
  preset?: "fade" | "slide" | "scale" | "blur" | "blur-slide" | "zoom" | "flip" | "bounce" | "rotate" | "swing";
}) {
  const allowed = useMotionAllowed();
  if (!allowed) return <Static as={as} className={className}>{children}</Static>;
  return (
    <AnimatedGroup as={as} asChild={asChild} preset={preset} className={className}>
      {children}
    </AnimatedGroup>
  );
}

/** Fade-and-rise when the section reaches the viewport, once. */
export function MotionReveal({
  children,
  className,
  as = "div",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  as?: Tag;
  delay?: number;
}) {
  const allowed = useMotionAllowed();
  if (!allowed) return <Static as={as} className={className}>{children}</Static>;
  return (
    <InView
      as={as}
      className={className}
      once
      viewOptions={{ once: true, margin: "0px 0px -12% 0px" }}
      variants={{
        hidden: { opacity: 0, y: 18 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </InView>
  );
}

/** A pointer pull of a few pixels. Never the only affordance: the button still looks like one. */
export function MotionMagnetic({ children }: { children: ReactNode }) {
  const allowed = useMotionAllowed();
  if (!allowed) return <>{children}</>;
  return <Magnetic>{children}</Magnetic>;
}

/** The hero specimen leans toward the pointer; text and layout are untouched. */
export function MotionTilt({ children, rotationFactor = 5 }: { children: ReactNode; rotationFactor?: number }) {
  const allowed = useMotionAllowed();
  if (!allowed) return <>{children}</>;
  return <Tilt rotationFactor={rotationFactor}>{children}</Tilt>;
}
