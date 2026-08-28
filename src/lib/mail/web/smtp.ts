import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { getMailClientSettings } from "../env";
import { appendToSent } from "./imap";

export interface SendMailInput {
  email: string;
  password: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

function buildRawMessage(input: SendMailInput): string {
  const lines = [
    `From: ${input.email}`,
    `To: ${input.to}`,
  ];
  if (input.cc) lines.push(`Cc: ${input.cc}`);
  if (input.bcc) lines.push(`Bcc: ${input.bcc}`);
  lines.push(
    `Subject: ${input.subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    input.text,
  );
  return lines.join("\r\n");
}

export async function sendMailMessage(input: SendMailInput): Promise<void> {
  const { smtp } = getMailClientSettings();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: false,
    requireTLS: smtp.security === "starttls",
    auth: { user: input.email, pass: input.password },
  });

  const mailOptions: Mail.Options = {
    from: input.email,
    to: input.to,
    cc: input.cc || undefined,
    bcc: input.bcc || undefined,
    subject: input.subject,
    text: input.text,
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
