import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { getMailClientSettings } from "../env";
import { appendToSent } from "./imap";
import { appendMailSignature, formatMailFrom } from "./profile-utils";

export interface SendMailInput {
  email: string;
  password: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  fromName?: string;
  signature?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

function buildRawMessage(input: SendMailInput): string {
  const from = formatMailFrom(input.email, input.fromName);
  const body = appendMailSignature(input.text, input.signature ?? "");
  const encodedSubject = /[^\x20-\x7E]/.test(input.subject)
    ? `=?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`
    : input.subject;
  const lines = [
    `From: ${from}`,
    `To: ${input.to}`,
  ];
  if (input.cc) lines.push(`Cc: ${input.cc}`);
  if (input.bcc) lines.push(`Bcc: ${input.bcc}`);
  lines.push(
    `Subject: ${encodedSubject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  );
  return lines.join("\r\n");
}

export async function sendMailMessage(input: SendMailInput): Promise<void> {
  const { smtp } = getMailClientSettings();
  const from = formatMailFrom(input.email, input.fromName);
  const text = appendMailSignature(input.text, input.signature ?? "");

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: false,
    requireTLS: smtp.security === "starttls",
    auth: { user: input.email, pass: input.password },
  });

  const mailOptions: Mail.Options = {
    from,
    to: input.to,
    cc: input.cc || undefined,
    bcc: input.bcc || undefined,
    subject: input.subject,
    text,
    attachments: input.attachments?.map((att) => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
    })),
  };

  await transporter.sendMail(mailOptions);

  await appendToSent(input.email, input.password, buildRawMessage(input)).catch((err) => {
    console.error("[mail] failed to append to Sent Items:", err);
  });
}
