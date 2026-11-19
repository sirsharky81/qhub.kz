import { withCors } from "@/lib/api/cors";
import { assertAssistMember, jsonAssistError } from "@/lib/subaru-assist/guard";
import { isAssistService, isAssistStatusCode } from "@/lib/subaru-assist/status";
import { markAssistRegionWriteOk, patchAssistClientState, pushAssistStatus } from "@/lib/subaru-assist/store";

export async function POST(request: Request) {
  try {
    const { member } = await assertAssistMember(request);
    let body: {
      service?: string;
      ignition?: boolean;
      adapter?: string;
      status?: string;
      regionWriteOk?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return withCors(Response.json({ error: "Неверный формат" }, { status: 400 }), request);
    }

    if (member.role === "client") {
      if (body.status || body.regionWriteOk) {
        return withCors(Response.json({ error: "Недостаточно прав" }, { status: 403 }), request);
      }
      const state = await patchAssistClientState(member.roomId, {
        service: body.service && isAssistService(body.service) ? body.service : undefined,
        ignition: typeof body.ignition === "boolean" ? body.ignition : undefined,
        adapter: body.adapter === "online" || body.adapter === "offline" ? body.adapter : undefined,
      });
      return withCors(Response.json({ state }), request);
    }

    if (member.role !== "master") {
      return withCors(Response.json({ error: "Недостаточно прав" }, { status: 403 }), request);
    }

    let state = await patchAssistClientState(member.roomId, {});
    if (body.regionWriteOk === true) {
      state = await markAssistRegionWriteOk(member.roomId);
    }
    if (typeof body.status === "string") {
      if (!isAssistStatusCode(body.status)) {
        return withCors(Response.json({ error: "Неверный статус" }, { status: 400 }), request);
      }
      state = await pushAssistStatus(member.roomId, body.status);
    }
    return withCors(Response.json({ state }), request);
  } catch (err) {
    return withCors(jsonAssistError(err), request);
  }
}
