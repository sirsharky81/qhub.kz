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
  onSent: (to: string) => void;
}

interface FormProps {
  initialTo: string;
  initialSubject: string;
  initialText: string;
  onClose: () => void;
  onSent: (to: string) => void;
}

function ComposeHeader({
  loading,
  canSend,
  onClose,
  onSend,
  variant,
}: {
  loading: boolean;
  canSend: boolean;
  onClose: () => void;
  onSend: () => void;
  variant: "mobile" | "desktop";
}) {
  return (
    <header
      className={`shrink-0 flex items-center gap-3 border-b border-gray-200 bg-white ${
        variant === "desktop" ? "px-5 py-4" : "px-4 py-3"
      }`}
      style={variant === "mobile" ? { paddingTop: "max(0.75rem, env(safe-area-inset-top))" } : undefined}
    >
      <button
        type="button"
        onClick={onClose}
        className="text-sm text-gray-500 hover:text-gray-800 touch-manipulation"
      >
        {variant === "desktop" ? "✕" : "Отменить"}
      </button>
      <h2 className={`flex-1 font-semibold text-gray-900 ${variant === "desktop" ? "text-base" : "text-center text-sm"}`}>
        {variant === "desktop" ? "Новое сообщение" : "Новое"}
      </h2>
      <button
        type="button"
        disabled={loading || !canSend}
        onClick={onSend}
        className={`rounded-lg text-sm font-semibold touch-manipulation disabled:opacity-40 ${
          variant === "desktop"
            ? "bg-sky-600 px-4 py-2 text-white hover:bg-sky-700"
            : "text-sky-600"
        }`}
      >
        {loading ? "…" : "Отправить"}
      </button>
    </header>
  );
}

function ComposeFields({
  to,
  setTo,
  cc,
  setCc,
  bcc,
  setBcc,
  subject,
  setSubject,
  text,
  setText,
  files,
  setFiles,
  signaturePreview,
  error,
  showCopyFields,
  setShowCopyFields,
  variant,
}: {
  to: string;
  setTo: (value: string) => void;
  cc: string;
  setCc: (value: string) => void;
  bcc: string;
  setBcc: (value: string) => void;
  subject: string;
  setSubject: (value: string) => void;
  text: string;
  setText: (value: string) => void;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  signaturePreview: string;
  error: string | null;
  showCopyFields: boolean;
  setShowCopyFields: (value: boolean) => void;
  variant: "mobile" | "desktop";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputClass =
    "flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder:text-gray-400";
  const rowClass = "flex items-center gap-2 border-b border-gray-100 py-2.5";
  const labelClass = "text-sm text-gray-500 shrink-0 w-16";

  function handleFiles(selected: FileList | null) {
    if (!selected) return;
    setFiles((prev) => [...prev, ...Array.from(selected)].slice(0, MAX_ATTACHMENTS));
  }

  return (
    <div className={`space-y-1 ${variant === "desktop" ? "px-5 py-4" : "px-4 py-3"}`}>
      <label className={rowClass}>
        <span className={labelClass}>Кому</span>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="email@example.com"
          className={inputClass}
          style={{ fontSize: "16px" }}
          autoFocus={variant === "desktop"}
        />
        {variant === "desktop" && !showCopyFields && (
          <button
            type="button"
            onClick={() => setShowCopyFields(true)}
            className="shrink-0 text-xs text-sky-600 hover:underline"
          >
            Копия
          </button>
        )}
      </label>

      {(showCopyFields || variant === "mobile") && (
        <>
          <label className={rowClass}>
            <span className={labelClass}>Копия</span>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className={inputClass}
              style={{ fontSize: "16px" }}
            />
          </label>
          <label className={rowClass}>
            <span className={labelClass}>Скрытая</span>
            <input
              type="text"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              className={inputClass}
              style={{ fontSize: "16px" }}
            />
          </label>
        </>
      )}

      <label className={rowClass}>
        <span className={labelClass}>Тема</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Тема письма"
          className={inputClass}
          style={{ fontSize: "16px" }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-sky-600 text-lg shrink-0 touch-manipulation"
          aria-label="Прикрепить файл"
          title="Прикрепить файл"
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
        <ul className="space-y-1 pt-1">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-xs text-gray-500">
              <span className="truncate flex-1">📎 {file.name}</span>
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
        className={`w-full bg-transparent text-sm outline-none resize-none leading-relaxed text-gray-900 placeholder:text-gray-400 ${
          variant === "desktop" ? "min-h-[280px] pt-3" : "min-h-[200px] pt-2"
        }`}
        style={{ fontSize: "16px" }}
      />

      {signaturePreview && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5 text-sm text-gray-500 whitespace-pre-wrap">
          <p className="text-xs text-gray-400 mb-1">Подпись (добавится автоматически)</p>
          {signaturePreview}
        </div>
      )}

      {error && <p className="text-sm text-red-600 text-center pt-2">{error}</p>}
    </div>
  );
}

function MailComposeForm({
  initialTo,
  initialSubject,
  initialText,
  onClose,
  onSent,
}: FormProps) {
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  useIosPwaKeyboardShell(mobileScrollRef, true);

  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(initialSubject);
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState("");
  const [showCopyFields, setShowCopyFields] = useState(Boolean(initialTo && initialSubject));

  useEffect(() => {
    let cancelled = false;
    void fetchMailProfile()
      .then((profile) => {
        if (!cancelled) setSignaturePreview(effectiveMailSignature(profile));
      })
      .catch(() => {
        if (!cancelled) setSignaturePreview("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
      onSent(to.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отправки");
    } finally {
      setLoading(false);
    }
  }

  const fieldProps = {
    to,
    setTo,
    cc,
    setCc,
    bcc,
    setBcc,
    subject,
    setSubject,
    text,
    setText,
    files,
    setFiles,
    signaturePreview,
    error,
    showCopyFields,
    setShowCopyFields,
  };

  const headerProps = {
    loading,
    canSend: Boolean(to.trim()),
    onClose,
    onSend: () => void handleSend(),
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[55] bg-black/40 md:bg-black/50"
        aria-label="Закрыть"
        onClick={onClose}
      />

      {/* Mobile: full-screen sheet pinned to visual viewport */}
      <div
        className="md:hidden fixed inset-x-0 z-[60] mx-auto flex w-full max-w-lg flex-col overflow-hidden bg-white text-gray-900 shadow-xl"
        style={iosPwaShellStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Новое письмо"
      >
        <ComposeHeader {...headerProps} variant="mobile" />
        <div
          ref={mobileScrollRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <ComposeFields {...fieldProps} variant="mobile" />
        </div>
      </div>

      {/* Desktop: centered dialog (Gmail / Outlook style) */}
      <div className="hidden md:flex fixed inset-0 z-[60] items-center justify-center p-6 pointer-events-none">
        <div
          className="pointer-events-auto flex w-full max-w-2xl max-h-[min(88vh,760px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <ComposeHeader {...headerProps} variant="desktop" />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ComposeFields {...fieldProps} variant="desktop" />
          </div>
        </div>
      </div>
    </>
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
