/** Agent debug ingest + /api/debug-log — only in local dev. Re-enable via NODE_ENV=development. */
export const AGENT_DEBUG_ENABLED = process.env.NODE_ENV === "development";
