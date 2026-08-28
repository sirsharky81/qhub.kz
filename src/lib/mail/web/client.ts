"use client";

import type { MailFilter } from "./constants";
import type { MailFolder, MailListItem, MailMessage } from "./types";

export interface MailLoginResult {
  ok: boolean;
  error?: string;
  email?: string;
}

export interface MailSessionResult {
  loggedIn: boolean;
  email?: string;
}

export async function fetchMailSession(): Promise<MailSessionResult> {
  const res = await fetch("/api/mail/web/auth/session", { credentials: "include" });
  if (!res.ok) return { loggedIn: false };
  return res.json() as Promise<MailSessionResult>;
}

export async function loginMail(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<MailLoginResult> {
  const res = await fetch("/api/mail/web/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password, captchaToken }),
  });
  const data = (await res.json()) as MailLoginResult;
  if (!res.ok) return { ok: false, error: data.error ?? "Ошибка входа" };
  return data;
}

export async function logoutMail(): Promise<void> {
  await fetch("/api/mail/web/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

export async function fetchMailFolders(): Promise<MailFolder[]> {
  const res = await fetch("/api/mail/web/folders", { credentials: "include" });
  if (!res.ok) throw new Error("Не удалось загрузить папки");
  const data = (await res.json()) as { folders: MailFolder[] };
  return data.folders;
}

export async function fetchMailMessages(params: {
  folder: string;
  filter: MailFilter;
  q: string;
  offset?: number;
  limit?: number;
}): Promise<{ items: MailListItem[]; total: number }> {
  const search = new URLSearchParams({
    folder: params.folder,
    filter: params.filter,
    q: params.q,
    offset: String(params.offset ?? 0),
    limit: String(params.limit ?? 50),
  });
  const res = await fetch(`/api/mail/web/messages?${search}`, { credentials: "include" });
  const data = (await res.json()) as { items?: MailListItem[]; total?: number; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить письма");
  return { items: data.items ?? [], total: data.total ?? 0 };
}

export async function fetchMailMessage(folder: string, uid: number): Promise<MailMessage> {
  const search = new URLSearchParams({ folder });
  const res = await fetch(`/api/mail/web/messages/${uid}?${search}`, { credentials: "include" });
  if (!res.ok) throw new Error("Не удалось загрузить письмо");
  const data = (await res.json()) as { message: MailMessage };
  return data.message;
}

export async function patchMailMessage(
  folder: string,
  uid: number,
  action: "read" | "unread" | "flag" | "unflag" | "delete",
): Promise<void> {
  const res = await fetch(`/api/mail/web/messages/${uid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ folder, action }),
  });
  if (!res.ok) throw new Error("Не удалось обновить письмо");
}

export async function sendMailCompose(form: FormData): Promise<void> {
  const res = await fetch("/api/mail/web/send", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Не удалось отправить письмо");
}

export function mailAttachmentUrl(folder: string, uid: number, partId: string): string {
  const search = new URLSearchParams({ folder });
  return `/api/mail/web/messages/${uid}/attachments/${partId}?${search}`;
}
