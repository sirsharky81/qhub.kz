import { withCors } from "@/lib/api/cors";
import { getServerIceServers } from "@/lib/messenger/call/ice-config";

const LAN_STUN: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export async function GET(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode");
  if (mode === "lan") {
    return withCors(
      Response.json({ iceServers: LAN_STUN, turnSource: "lan-stun-only" }),
      request,
    );
  }
  const { iceServers, turnSource } = await getServerIceServers();
  return withCors(Response.json({ iceServers, turnSource }), request);
}
