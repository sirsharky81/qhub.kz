/** Agent debug ingest + /api/debug-log — local dev, or prod with AGENT_DEBUG=1 (temporary field debugging). */
export const AGENT_DEBUG_ENABLED =
  process.env.NODE_ENV === "development" || process.env.AGENT_DEBUG === "1";
