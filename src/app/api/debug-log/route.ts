import { AGENT_DEBUG_ENABLED } from "@/lib/agent-debug-enabled";
import { appendFileSync } from "fs";
import { join } from "path";

const LOG_FILE = join(process.cwd(), "debug-1c0a94.log");
const INGEST_URL = "http://127.0.0.1:7799/ingest/fe409093-9b20-464b-89a5-ab8bb99d144e";

export async function POST(req: Request) {
  if (!AGENT_DEBUG_ENABLED) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.text();
  try {
    appendFileSync(LOG_FILE, `${body}\n`);
  } catch {
    /* serverless / read-only fs */
  }
  fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "1c0a94",
    },
    body,
  }).catch(() => {});
  return Response.json({ ok: true });
}
