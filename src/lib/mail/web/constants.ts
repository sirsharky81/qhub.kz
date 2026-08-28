export const MAIL_SESSION_COOKIE = "qhub_mail_session";
export const MAIL_SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export const DEFAULT_FOLDER = "INBOX";

export const SYSTEM_FOLDER_LABELS: Record<string, string> = {
  INBOX: "Входящие",
  "Sent Items": "Отправленные",
  Drafts: "Черновики",
  Trash: "Корзина",
  Junk: "Спам",
  Spam: "Спам",
};

export type MailFilter = "all" | "unread" | "flagged" | "attachments";

export const MAIL_FILTER_LABELS: Record<MailFilter, string> = {
  all: "Все",
  unread: "Непрочитанные",
  flagged: "Отмеченные флагом",
  attachments: "С файлами",
};

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
