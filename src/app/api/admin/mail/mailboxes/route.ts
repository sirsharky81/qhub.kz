import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin/session";
import {
  addMailbox,
  changeMailboxPassword,
  getMailStatus,
  isValidMailAddress,
  listMailboxes,
  removeMailbox,
} from "@/lib/mail/exec";
import { getMailConfig } from "@/lib/mail/env";

async function requireAdmin(): Promise<NextResponse | null> {
  const ok = await isAdminAuthenticated();
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const mailboxes = await listMailboxes();
    return NextResponse.json({ ...getMailStatus(), mailboxes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mail list failed";
    return NextResponse.json({ ...getMailStatus(), mailboxes: [], error: message });
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const { domain } = getMailConfig();

  if (!email || !password) {
    return NextResponse.json({ error: "Укажите email и пароль" }, { status: 400 });
  }
  if (!isValidMailAddress(email, domain)) {
    return NextResponse.json({ error: `Email должен быть @${domain}` }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Пароль не короче 8 символов" }, { status: 400 });
  }

  try {
    await addMailbox(email, password);
    const mailboxes = await listMailboxes();
    return NextResponse.json({ ok: true, mailboxes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать ящик";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { email?: string; purge?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const { domain } = getMailConfig();
  if (!email || !isValidMailAddress(email, domain)) {
    return NextResponse.json({ error: "Неверный email" }, { status: 400 });
  }

  try {
    await removeMailbox(email, body.purge === true);
    const mailboxes = await listMailboxes();
    return NextResponse.json({ ok: true, mailboxes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось удалить ящик";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const { domain } = getMailConfig();

  if (!email || !password) {
    return NextResponse.json({ error: "Укажите email и новый пароль" }, { status: 400 });
  }
  if (!isValidMailAddress(email, domain)) {
    return NextResponse.json({ error: "Неверный email" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Пароль не короче 8 символов" }, { status: 400 });
  }

  try {
    await changeMailboxPassword(email, password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сбросить пароль";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
