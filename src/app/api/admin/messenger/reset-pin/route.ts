import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import { isValidKzPhone, normalizeKzPhone } from "@/lib/messenger/phone";
import { resetAuthPin } from "@/lib/messenger/store";

export async function POST(request: Request) {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { phone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const phone = body.phone ? normalizeKzPhone(body.phone) : "";
  if (!isValidKzPhone(phone)) {
    return NextResponse.json({ error: "Неверный номер +7XXXXXXXXXX" }, { status: 400 });
  }

  await resetAuthPin(phone);
  return NextResponse.json({ ok: true });
}
