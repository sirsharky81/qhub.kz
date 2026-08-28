"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_ATTACHMENTS } from "@/lib/mail/web/constants";
import { fetchMailProfile, sendMailCompose } from "@/lib/mail/web/client";
import { effectiveMailSignature } from "@/lib/mail/web/profile-utils";
import { iosPwaShellStyle, useIosPwaKeyboardShell } from "@/lib/platform/ios-pwa-keyboard-shell";

interface Props {
  open: boolean;
  initialTo?: string;
  initialSubject?: string;
  initialText?: string;
  onClose: () => void;
  onSent: () => void;
}

interface FormProps {
  initialTo: string;
  initialSubject: string;
  initialText: string;
  onClose: () => void;
  onSent: () => void;
}

function MailComposeForm({
  initialTo,
  initialSubject,
  initialText,
  onClose,
  onSent,
}: FormProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useIosPwaKeyboardShell(scrollRef, true);

  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMailProfile()
      .then((profile) => {
        if (cancelled) return;
        setSignaturePreview(effectiveMailSignature(profile));
      })
      .catch(() => {
        if (!cancelled) setSignaturePreview("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSend() {
    if (!to.trim()) {
      setError("Укажите получателя");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("to", to.trim());
      if (cc.trim()) form.set("cc", cc.trim());
      if (bcc.trim()) form.set("bcc", bcc.trim());
      form.set("subject", subject);
      form.set("text", text);
      for (const file of files) form.append("attachments", file);
      await sendMailCompose(form);
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setLoading(false);
    }
  }

  function handleFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...files, ...Array.from(selected)].slice(0, MAX_ATTACHMENTS);
    setFiles(next);
  }

  return (
    <div
      className="fixed inset-x-0 z-[60] mx-auto flex w-full max-w-lg flex-col overflow-hidden bg-white text-gray-900 shadow-xl"
      style={iosPwaShellStyle}
    >
      <header
        className="shrink-0 flex items-center gap-3 border-b border-gray-200 px-4 py-3 bg-white"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button type="button" onClick={onClose} className="text-sky-600 text-sm touch-manipulation">
          Отменить
        </button>
        <h2 className="flex-1 text-center text-sm font-semibold">Новое</h2>
        <button
          type="button"
          disabled={loading || !to.trim()}
          onClick={() => void handleSend()}
          className="text-sky-600 text-sm font-semibold disabled:opacity-40 touch-manipulation"
        >
          {loading ? "…" : "Отправить"}
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y px-4 py-3 space-y-3 [-webkit-overflow-scrolling:touch]"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <label className="flex items-center gap-2 border-b border-gray-200 pb-2">
          <span className="text-sm text-gray-500 shrink-0">Кому:</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-gray-900"
            style={{ fontSize: "16px" }}
          />
        </label>
        <label className="flex items-center gap-2 border-b border-gray-200 pb-2">
          <span className="text-sm text-gray-500 shrink-0">Копия:</span>
          <input
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-gray-900"
            style={{ fontSize: "16px" }}
          />
        </label>
        <label className="flex items-center gap-2 border-b border-gray-200 pb-2">
          <span className="text-sm text-gray-500 shrink-0">Скрытая:</span>
          <input
            type="text"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-gray-900"
            style={{ fontSize: "16px" }}
          />
        </label>
        <label className="flex items-center gap-2 border-b border-gray-200 pb-2">
          <span className="text-sm text-gray-500 shrink-0">Тема:</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-gray-900"
            style={{ fontSize: "16px" }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sky-600 text-lg shrink-0 touch-manipulation"
            aria-label="Прикрепить файл"
          >
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>

        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-xs text-gray-500">
                <span className="truncate flex-1">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  className="text-red-600 touch-manipulation"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Текст письма"
          className="w-full min-h-[200px] bg-transparent text-sm outline-none resize-none leading-relaxed text-gray-900 placeholder:text-gray-400"
          style={{ fontSize: "16px" }}
        />

        {signaturePreview && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5 text-sm text-gray-500 whitespace-pre-wrap">
            <p className="text-xs text-gray-400 mb-1">Подпись (добавится автоматически)</p>
            {signaturePreview}
          </div>
        )}

        {error && <p className="text-sm text-red-600 text-center pb-2">{error}</p>}
      </div>
    </div>
  );
}

export function MailComposeSheet({
  open,
  initialTo = "",
  initialSubject = "",
  initialText = "",
  onClose,
  onSent,
}: Props) {
  if (!open) return null;

  const formKey = `${initialTo}|${initialSubject}|${initialText}`;

  return (
    <MailComposeForm
      key={formKey}
      initialTo={initialTo}
      initialSubject={initialSubject}
      initialText={initialText}
      onClose={onClose}
      onSent={onSent}
    />
  );
}
