import { fa, type Dictionary } from "./messages/fa";
import { en } from "./messages/en";
import type { Locale } from "./config";

const dictionaries: Record<Locale, Dictionary> = { fa, en };

/** Synchronous by design: the dictionaries are small, and every screen reads
 *  them during the same render as its data. */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
