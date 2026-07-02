import { NextResponse } from "next/server";
import { getServerIceServers } from "@/lib/messenger/call/ice-config";
import { assertMessengerSession, jsonAuthError } from "@/lib/messenger/guard";

export async function GET() {
  try {
    await assertMessengerSession();
    const { iceServers, turnSource } = await getServerIceServers();
    return NextResponse.json({ iceServers, turnSource });
  } catch (err) {
    return jsonAuthError(err);
  }
}
