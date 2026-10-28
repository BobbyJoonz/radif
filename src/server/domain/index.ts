/**
 * The domain barrel.
 *
 * Everything re-exported here is pure: no database handle, no `fetch`, no
 * `next/*`. That is what lets the worker, the services and the unit tests share
 * exactly one implementation of "what does this message mean" — and makes the
 * proxy between them impossible to drift.
 *
 * Deliberately *not* exported: anything that reads or writes a row. Those live in
 * `src/server/ingestion`, `src/server/services` and `src/server/worker`.
 */
export * from "./dedupe";
export * from "./intents";
export * from "./money";
export * from "./normalize";
export * from "./priority";
export * from "./reply";
export * from "./spans";
export * from "./state";
export * from "./time";
