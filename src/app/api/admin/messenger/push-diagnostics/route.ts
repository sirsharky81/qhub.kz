import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { getMessengerPushDiagnosticsSnapshot } from "@/lib/messenger/push-diagnostics";

export async function GET() {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await getMessengerPushDiagnosticsSnapshot();
  return NextResponse.json(data);
}
