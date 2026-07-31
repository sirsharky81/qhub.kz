import { withCors } from "@/lib/api/cors";
import { getServerIceServers } from "@/lib/messenger/call/ice-config";

export async function GET(request: Request) {
  const { iceServers, turnSource } = await getServerIceServers();
  return withCors(Response.json({ iceServers, turnSource }), request);
}
