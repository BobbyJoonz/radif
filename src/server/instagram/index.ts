/**
 * The Instagram channel module.
 *
 *   connect.ts — OAuth, sealed tokens, connection state (owner-only)
 *   ingest.ts  — webhook events -> customers, conversations, messages, analysis
 *   ../channels/instagram/api.ts — the protocol layer (Meta URLs, state signing,
 *                                  signature checks, payload parsing); pure, testable
 *
 * Deliberately read-only for now: there is no send path here, so no screen can
 * claim a reply was delivered.
 */
export * from "./connect";
export * from "./ingest";
