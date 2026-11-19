import { withCors } from "@/lib/api/cors";
import { assertAssistMember, jsonAssistError } from "@/lib/subaru-assist/guard";
import { appendAssistSignal } from "@/lib/subaru-assist/store";

const ALLOWED = new Set(["offer", "answer", "ice"]);

export async function POST(request: Request) {
  try {
    const { member } = await assertAssistMember(request);
    let body: { type?: string; payload?: string };
    try {
      body = await request.json();
    } catch {
      return withCors(Response.json({ error: "Неверный формат" }, { status: 400 }), request);
    }
    if (!body.type || !ALLOWED.has(body.type) || typeof body.payload !== "string" || !body.payload) {
      return withCors(Response.json({ error: "Неполные данные сигнала" }, { status: 400 }), request);
    }
    const signal = await appendAssistSignal(
      member.roomId,
      member.memberId,
      body.type as "offer" | "answer" | "ice",
      body.payload,
    );
    return withCors(Response.json({ ok: true, signal }), request);
  } catch (err) {
    return withCors(jsonAssistError(err), request);
  }
}
