import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailFilter } from "./constants";
import { folderLabel, sortFolders } from "./folders";
import type {
  MailAttachmentMeta,
  MailFolder,
  MailListItem,
  MailListQuery,
  MailMessage,
} from "./types";
import { getMailClientSettings } from "../env";

function createImapClient(email: string, password: string): ImapFlow {
  const { imap } = getMailClientSettings();
  return new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.security === "ssl",
    auth: { user: email, pass: password },
    logger: false,
    emitLogs: false,
  });
}

export async function verifyMailCredentials(email: string, password: string): Promise<boolean> {
  const client = createImapClient(email, password);
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function withImapClient<T>(
  email: string,
  password: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = createImapClient(email, password);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

function addressFieldText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "object" && value !== null && "text" in value) {
    const text = (value as { text?: string }).text;
    return typeof text === "string" ? text : "";
  }
  return parseAddressList(value);
}

function parseAddressList(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "address" in item) {
          const addr = item as { name?: string; address?: string };
          return addr.name ? `${addr.name} <${addr.address}>` : (addr.address ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join(", ");
  }
  return String(value);
}

function formatFrom(envelope: { from?: unknown } | undefined): { from: string; fromName: string } {
  const raw = parseAddressList(envelope?.from);
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { fromName: match[1].trim(), from: match[2].trim() };
  return { fromName: raw.split("@")[0] || "?", from: raw };
}

function buildSearchQuery(filter: MailFilter, q: string): Record<string, unknown> {
  const trimmed = q.trim();
  if (filter === "unread" && trimmed) {
    return { unseen: true, or: [{ subject: trimmed }, { from: trimmed }, { body: trimmed }] };
  }
  if (filter === "flagged" && trimmed) {
    return { flagged: true, or: [{ subject: trimmed }, { from: trimmed }, { body: trimmed }] };
  }
  if (filter === "attachments" && trimmed) {
    return { header: ["Content-Type", "multipart/mixed"], or: [{ subject: trimmed }, { from: trimmed }] };
  }
  if (filter === "unread") return { unseen: true };
  if (filter === "flagged") return { flagged: true };
  if (filter === "attachments") return { header: ["Content-Type", "multipart/mixed"] };
  if (trimmed) {
    return { or: [{ subject: trimmed }, { from: trimmed }, { body: trimmed }] };
  }
  return { all: true };
}

export async function listMailFolders(email: string, password: string): Promise<MailFolder[]> {
  return withImapClient(email, password, async (client) => {
    const mailboxes = await client.list();
    const folders: MailFolder[] = [];
    for (const box of mailboxes) {
      if (!box.path || box.flags?.has("\\Noselect")) continue;
      let unread = 0;
      let total = 0;
      try {
        const status = await client.status(box.path, { unseen: true, messages: true });
        unread = status.unseen ?? 0;
        total = status.messages ?? 0;
      } catch {
        /* ignore status errors for custom folders */
      }
      const specialUse = box.specialUse ? String(box.specialUse) : undefined;
      folders.push({
        path: box.path,
        name: box.name || box.path,
        label: folderLabel(box.path, specialUse),
        unread,
        total,
        specialUse,
      });
    }
    return sortFolders(folders);
  });
}

export async function listMailMessages(
  email: string,
  password: string,
  query: MailListQuery,
): Promise<{ items: MailListItem[]; total: number }> {
  return withImapClient(email, password, async (client) => {
    const lock = await client.getMailboxLock(query.folder);
    try {
      const searchCriteria = buildSearchQuery(query.filter, query.q);
      const uidsResult = await client.search(searchCriteria, { uid: true });
      const uids = uidsResult === false ? [] : uidsResult;
      const sorted = [...uids].sort((a, b) => b - a);
      const total = sorted.length;
      const slice = sorted.slice(query.offset, query.offset + query.limit);

      if (!slice.length) return { items: [], total };

      const items: MailListItem[] = [];
      for await (const msg of client.fetch(
        slice,
        {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
        },
        { uid: true },
      )) {
        const { from, fromName } = formatFrom(msg.envelope);
        items.push({
          uid: msg.uid,
          from,
          fromName,
          subject: msg.envelope?.subject || "(без темы)",
          preview: "",
          date: msg.envelope?.date?.toISOString() ?? new Date().toISOString(),
          unread: !msg.flags?.has("\\Seen"),
          flagged: !!msg.flags?.has("\\Flagged"),
          hasAttachments: hasAttachments(msg.bodyStructure),
        });
      }
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return { items, total };
    } finally {
      lock.release();
    }
  });
}

function hasAttachments(structure: unknown): boolean {
  if (!structure || typeof structure !== "object") return false;
  const node = structure as {
    disposition?: string;
    type?: string;
    childNodes?: unknown[];
  };
  if (node.disposition === "attachment") return true;
  if (node.type === "multipart/mixed") return true;
  if (Array.isArray(node.childNodes)) {
    return node.childNodes.some((child) => hasAttachments(child));
  }
  return false;
}

export async function fetchMailMessage(
  email: string,
  password: string,
  folder: string,
  uid: number,
): Promise<MailMessage | null> {
  return withImapClient(email, password, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(String(uid), {
        uid: true,
        envelope: true,
        flags: true,
        source: true,
        bodyStructure: true,
      }, { uid: true });

      if (!msg) return null;

      const source = msg.source ? Buffer.from(msg.source) : Buffer.alloc(0);
      const parsed = await simpleParser(source);
      const attachments: MailAttachmentMeta[] = (parsed.attachments ?? []).map(
        (att: { filename?: string; size?: number; contentType?: string }, index: number) => ({
          partId: String(index),
          filename: att.filename || `attachment-${index + 1}`,
          size: att.size ?? 0,
          contentType: att.contentType || "application/octet-stream",
        }),
      );

      return {
        uid: msg.uid,
        from: addressFieldText(parsed.from) || parseAddressList(msg.envelope?.from),
        to: addressFieldText(parsed.to) || parseAddressList(msg.envelope?.to),
        cc: addressFieldText(parsed.cc) || parseAddressList(msg.envelope?.cc) || undefined,
        subject: parsed.subject || msg.envelope?.subject || "(без темы)",
        date: (parsed.date ?? msg.envelope?.date ?? new Date()).toISOString(),
        bodyText: parsed.text || stripHtml(parsed.html || ""),
        bodyHtml: parsed.html || undefined,
        unread: !msg.flags?.has("\\Seen"),
        flagged: !!msg.flags?.has("\\Flagged"),
        attachments,
      };
    } finally {
      lock.release();
    }
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function updateMailMessage(
  email: string,
  password: string,
  folder: string,
  uid: number,
  action: "read" | "unread" | "flag" | "unflag" | "delete",
): Promise<void> {
  return withImapClient(email, password, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      if (action === "delete") {
        await client.messageDelete([uid], { uid: true });
        return;
      }
      const addFlags: string[] = [];
      const removeFlags: string[] = [];
      if (action === "read") addFlags.push("\\Seen");
      if (action === "unread") removeFlags.push("\\Seen");
      if (action === "flag") addFlags.push("\\Flagged");
      if (action === "unflag") removeFlags.push("\\Flagged");
      if (addFlags.length) await client.messageFlagsAdd([uid], addFlags, { uid: true });
      if (removeFlags.length) await client.messageFlagsRemove([uid], removeFlags, { uid: true });
    } finally {
      lock.release();
    }
  });
}

export async function fetchMailAttachment(
  email: string,
  password: string,
  folder: string,
  uid: number,
  partIndex: number,
): Promise<{ filename: string; contentType: string; data: Buffer } | null> {
  return withImapClient(email, password, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !("source" in msg) || !msg.source) return null;
      const parsed = await simpleParser(Buffer.from(msg.source));
      const att = parsed.attachments?.[partIndex];
      if (!att) return null;
      return {
        filename: att.filename || `attachment-${partIndex + 1}`,
        contentType: att.contentType || "application/octet-stream",
        data: att.content,
      };
    } finally {
      lock.release();
    }
  });
}

export async function appendToSent(
  email: string,
  password: string,
  rawMessage: string,
): Promise<void> {
  return withImapClient(email, password, async (client) => {
    const sentPath = await resolveSentFolder(client);
    await client.append(sentPath, rawMessage, ["\\Seen"]);
  });
}

async function resolveSentFolder(client: ImapFlow): Promise<string> {
  const mailboxes = await client.list();
  for (const box of mailboxes) {
    if (box.specialUse === "\\Sent" || box.path === "Sent Items" || box.path === "Sent") {
      return box.path;
    }
  }
  return "Sent Items";
}
