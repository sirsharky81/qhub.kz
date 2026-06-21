import { NextResponse } from "next/server";
import { changeAdminPassword } from "@/lib/admin/auth";
import { isAdminAuthenticated } from "@/lib/admin/session";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Заполните оба поля пароля" }, { status: 400 });
  }

  const result = await changeAdminPassword(currentPassword, newPassword);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Ошибка" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
