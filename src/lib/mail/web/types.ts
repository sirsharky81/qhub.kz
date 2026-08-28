import type { MailFilter } from "./constants";

export interface MailFolder {
  path: string;
  name: string;
  label: string;
  unread: number;
  total: number;
  specialUse?: string;
}

export interface MailListItem {
  uid: number;
  from: string;
  fromName: string;
  subject: string;
  preview: string;
  date: string;
  unread: boolean;
  flagged: boolean;
  hasAttachments: boolean;
}

export interface MailAttachmentMeta {
  partId: string;
  filename: string;
  size: number;
  contentType: string;
}

export interface MailMessage {
  uid: number;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml?: string;
  unread: boolean;
  flagged: boolean;
  attachments: MailAttachmentMeta[];
}

export interface MailListQuery {
  folder: string;
  filter: MailFilter;
  q: string;
  limit: number;
  offset: number;
}
