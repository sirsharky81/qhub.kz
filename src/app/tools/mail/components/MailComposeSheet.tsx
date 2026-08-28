"use client";

import { useRef, useState } from "react";
import { MAX_ATTACHMENTS } from "@/lib/mail/web/constants";
import { sendMailCompose } from "@/lib/mail/web/client";

interface Props {
  open: boolean;
  initialTo?: string;
  initialSubject?: string;
  initialText?: string;
  onClose: () => void;
  onSent: () => void;
}

export function MailComposeSheet({
  open,
  initialTo = "",
  initialSubject = "",
  initialText = "",
  onClose,
  onSent,
}: Props) {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function resetFromProps() {
    setTo(initialTo);
    setSubject(initialSubject);
    setText(initialText);
    setCc("");
    setFiles([]);
    setError(null);
  }

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
      form.set("subject", subject);
      form.set("text", text);
      for (const file of files) form.append("attachments", file);
      await sendMailCompose(form);
      resetFromProps();
      onSent();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    resetFromProps();
    onClose();
  }

  function handleFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...files, ...Array.from(selected)].slice(0, MAX_ATTACHMENTS);
    setFiles(next);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <header
        className="shrink-0 flex items-center gap-3 border-b border-zinc-800 px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button type="button" onClick={handleClose} className="text-sky-400 text-sm">
          Отменить
        </button>
        <h2 className="flex-1 text-center text-sm font-semibold">Новое</h2>
        <button
          type="button"
          disabled={loading || !to.trim()}
          onClick={() => void handleSend()}
          className="text-sky-400 text-sm font-semibold disabled:opacity-40"
        >
          {loading ? "…" : "Отправить"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <label className="flex items-center gap-2 border-b border-zinc-800 pb-2">
          <span className="text-sm text-zinc-500 shrink-0">Кому:</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ fontSize: "16px" }}
          />
        </label>
        <label className="flex items-center gap-2 border-b border-zinc-800 pb-2">
          <span className="text-sm text-zinc-500 shrink-0">Копия:</span>
          <input
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ fontSize: "16px" }}
          />
        </label>
        <label className="flex items-center gap-2 border-b border-zinc-800 pb-2">
          <span className="text-sm text-zinc-500 shrink-0">Тема:</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ fontSize: "16px" }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sky-400 text-lg shrink-0"
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
              <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="truncate flex-1">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                  className="text-red-400"
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
          className="w-full min-h-[200px] bg-transparent text-sm outline-none resize-none leading-relaxed"
          style={{ fontSize: "16px" }}
        />
      </div>

      {error && (
        <p className="px-4 pb-3 text-sm text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
