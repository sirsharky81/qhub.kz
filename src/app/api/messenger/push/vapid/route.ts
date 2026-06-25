import { getVapidPublicKey } from "@/lib/family/push-server";

export async function GET() {
  const publicKey = getVapidPublicKey();
  return Response.json({ publicKey });
}
