#!/usr/bin/env node
/**
 * Run QHub mail management commands on the VPS.
 * Used by admin API and self-service password change.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getMailConfig, isMailServerConfigured } from "./env";

const execFileAsync = promisify(execFile);

export interface MailMailbox {
  email: string;
  maildir: string | null;
}

function requireCommand(command: string | null, name: string): string {
  if (!command) {
    throw new Error(`${name} is not configured`);
  }
  return command;
}

async function runMailCommand(command: string, args: string[] = []): Promise<string> {
  const full = args.length ? `${command} ${args.map(shellQuote).join(" ")}` : command;
  const { stdout, stderr } = await execFileAsync("bash", ["-lc", full], {
    timeout: 20_000,
    env: process.env,
  });
  if (stderr.trim()) {
    console.error("[mail]", stderr.trim());
  }
  return stdout.trim();
}

export async function listMailboxes(): Promise<MailMailbox[]> {
  const command = requireCommand(getMailConfig().listCommand, "MAIL_LIST_COMMAND");
  const stdout = await runMailCommand(`${command}`);
  if (!stdout) return [];
  const parsed = JSON.parse(stdout) as MailMailbox[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function addMailbox(email: string, password: string): Promise<void> {
  const command = requireCommand(getMailConfig().addCommand, "MAIL_ADD_COMMAND");
  await runMailCommand(command, [email, password]);
}

export async function removeMailbox(email: string, purge = false): Promise<void> {
  const command = requireCommand(getMailConfig().removeCommand, "MAIL_REMOVE_COMMAND");
  await runMailCommand(command, purge ? [email, "--purge"] : [email]);
}

export async function changeMailboxPassword(
  email: string,
  newPassword: string,
  currentPassword?: string,
): Promise<void> {
  const command = requireCommand(getMailConfig().passwdCommand, "MAIL_PASSWD_COMMAND");
  if (currentPassword) {
    await runMailCommand(command, ["--verify", email, currentPassword, newPassword]);
    return;
  }
  await runMailCommand(command, [email, newPassword]);
}

export function getMailStatus() {
  const cfg = getMailConfig();
  return {
    configured: isMailServerConfigured(),
    enabled: cfg.enabled,
    domain: cfg.domain,
    host: cfg.host,
    addCommandSet: Boolean(cfg.addCommand),
    listCommandSet: Boolean(cfg.listCommand),
    passwdCommandSet: Boolean(cfg.passwdCommand),
    removeCommandSet: Boolean(cfg.removeCommand),
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function isValidMailAddress(email: string, domain: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith(`@${domain.toLowerCase()}`)) return false;
  const local = normalized.slice(0, -(domain.length + 1));
  return /^[a-z0-9][a-z0-9._+-]{0,63}$/.test(local);
}
