import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { getMessengerHygieneSnapshot } from "@/lib/messenger/hygiene";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const snapshot = getMessengerHygieneSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}
