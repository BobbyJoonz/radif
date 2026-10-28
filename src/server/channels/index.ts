import type { ChannelAdapter } from "./types";
import { FileChannelAdapter } from "./file";
import { ReplayChannelAdapter } from "./replay";

/**
 * Channel registry. One adapter per source; adding Instagram in phase 3 means
 * adding a class here and nothing else in the pipeline changes (CONTRACTS §1).
 */
const adapters: Record<string, ChannelAdapter> = {
  file: new FileChannelAdapter(),
  replay: new ReplayChannelAdapter(),
};

export function getChannelAdapter(source: "file" | "replay" | "instagram" | "manual"): ChannelAdapter {
  const adapter = adapters[source];
  if (!adapter) {
    // Instagram and manual have no *parser*: manual messages arrive through the
    // ingest route as an already-shaped IncomingMessage, and phase 3 supplies the
    // Instagram webhook adapter. Refusing here keeps "not built yet" honest.
    throw new Error(`برای منبع «${source}» آداپتور فایل تعریف نشده است.`);
  }
  return adapter;
}

export * from "./csv";
export * from "./file";
export * from "./replay";
export * from "./types";
