export interface MailConfig {
  enabled: boolean;
  domain: string;
  host: string;
  addCommand: string | null;
  passwdCommand: string | null;
  listCommand: string | null;
  removeCommand: string | null;
}

export function getMailConfig(): MailConfig {
  const enabled = process.env.MAIL_ENABLED === "1" || process.env.MAIL_ENABLED === "true";
  const domain = process.env.MAIL_DOMAIN?.trim() || "qhub.kz";
  const host = process.env.MAIL_HOST?.trim() || `mail.${domain}`;
  return {
    enabled,
    domain,
    host,
    addCommand: process.env.MAIL_ADD_COMMAND?.trim() || null,
    passwdCommand: process.env.MAIL_PASSWD_COMMAND?.trim() || null,
    listCommand: process.env.MAIL_LIST_COMMAND?.trim() || null,
    removeCommand: process.env.MAIL_REMOVE_COMMAND?.trim() || null,
  };
}

export function isMailServerConfigured(): boolean {
  const cfg = getMailConfig();
  return (
    cfg.enabled &&
    Boolean(cfg.addCommand && cfg.passwdCommand && cfg.listCommand && cfg.removeCommand)
  );
}

export function getMailClientSettings() {
  const cfg = getMailConfig();
  return {
    enabled: isMailServerConfigured(),
    domain: cfg.domain,
    host: cfg.host,
    imap: { host: cfg.host, port: 993, security: "ssl" as const },
    smtp: { host: cfg.host, port: 587, security: "starttls" as const },
  };
}
