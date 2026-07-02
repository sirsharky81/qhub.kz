import { NextResponse } from "next/server";
import { getServerIceServers } from "@/lib/messenger/call/ice-config";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";

export async function GET() {
  try {
    await assertMessengerSession();
    return NextResponse.json({ iceServers: getServerIceServers() });
  } catch (err) {
    return jsonAuthError(err);
  }
}
