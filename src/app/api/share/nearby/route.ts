import { withCors } from "@/lib/api/cors";
import { getClientIp } from "@/lib/rate-limit";
import { listNearbyBeacons } from "@/lib/share/lan-beacon";

export async function GET(request: Request) {
  const rooms = await listNearbyBeacons(getClientIp(request));
  return withCors(
    Response.json({
      rooms: rooms.map((r) => ({
        roomId: r.roomId,
        roomCode: r.roomCode,
        deviceName: r.deviceName,
      })),
    }),
    request,
  );
}
