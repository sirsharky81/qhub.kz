"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MailFilter } from "@/lib/mail/web/constants";
import { DEFAULT_FOLDER } from "@/lib/mail/web/constants";
import { findSentFolderPath, isSameMailbox } from "@/lib/mail/web/addresses";
import {
  fetchMailFolders,
  fetchMailMessage,
  fetchMailMessages,
  fetchMailSession,
  patchMailMessage,
} from "@/lib/mail/web/client";
import type { MailFolder, MailListItem, MailMessage } from "@/lib/mail/web/types";
import { MailComposeSheet } from "../components/MailComposeSheet";
import { MailFilterMenu } from "../components/MailFilterMenu";
import { MailFolderDrawer } from "../components/MailFolderDrawer";
import { MailFolderSidebar } from "../components/MailFolderSidebar";
import { MailList } from "../components/MailList";
import { MailMessageView } from "../components/MailMessageView";
import { MailAccountSheet, MailServicesNav } from "../components/MailServicesNav";
import { MailShell } from "../components/MailShell";

function MailEmptyPreview() {
  return (
    <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-gray-50/50 text-center px-8">
      <div className="mb-4 text-5xl opacity-40" aria-hidden>
        ✉️
      </div>
      <p className="text-base font-medium text-gray-600">Выберите письмо</p>
      <p className="mt-1 max-w-xs text-sm text-gray-400">
        Список слева, содержимое откроется здесь
      </p>
    </div>
  );
}

export function MailAppClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState(DEFAULT_FOLDER);
  const [filter, setFilter] = useState<MailFilter>("all");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDefaults, setComposeDefaults] = useState({ to: "", subject: "", text: "" });
  const [items, setItems] = useState<MailListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [message, setMessage] = useState<MailMessage | null>(null);

  const [refreshCounter, setRefreshCounter] = useState(0);
  const [inboxReady, setInboxReady] = useState(false);
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  const retryTimersRef = useRef<number[]>([]);

  const refreshMailbox = useCallback(() => {
    setRefreshCounter((value) => value + 1);
  }, []);

  const refreshMailboxWithRetry = useCallback(() => {
    refreshMailbox();
    for (const timerId of retryTimersRef.current) {
      window.clearTimeout(timerId);
    }
    retryTimersRef.current = [3000, 8000, 20000].map((delay) =>
      window.setTimeout(() => refreshMailbox(), delay),
    );
  }, [refreshMailbox]);

  useEffect(() => {
    return () => {
      for (const timerId of retryTimersRef.current) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  useEffect(() => {
    if (!sentNotice) return;
    const timerId = window.setTimeout(() => setSentNotice(null), 8000);
    return () => window.clearTimeout(timerId);
  }, [sentNotice]);

  function openCompose(defaults = { to: "", subject: "", text: "" }) {
    setComposeDefaults(defaults);
    setComposeOpen(true);
  }

  function handleSent(to: string) {
    refreshMailboxWithRetry();
    const applySentFolder = (list: MailFolder[]) => {
      const sentPath = findSentFolderPath(list);
      if (!sentPath) return;
      setActiveFolder(sentPath);
      setSentNotice(
        isSameMailbox(to, email)
          ? "Письмо отправлено. Копия — в «Отправленных». Во «Входящие» может прийти с небольшой задержкой."
          : "Письмо отправлено. Копия — в «Отправленных».",
      );
    };
    void fetchMailFolders()
      .then((list) => {
        setFolders(list);
        applySentFolder(list);
      })
      .catch(() => applySentFolder(folders));
  }

  useEffect(() => {
    let cancelled = false;
    void fetchMailSession().then((session) => {
      if (cancelled) return;
      if (!session.loggedIn) {
        router.replace("/tools/mail/login");
        return;
      }
      setEmail(session.email ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setInboxReady(false);
    });
    void fetchMailFolders()
      .then((list) => {
        if (cancelled) return;
        setFolders(list);
        setFoldersError(null);
        const inbox =
          list.find((f) => f.specialUse === "\\Inbox") ??
          list.find((f) => f.path.toUpperCase() === "INBOX");
        if (inbox) {
          setActiveFolder((current) =>
            current === DEFAULT_FOLDER && current !== inbox.path ? inbox.path : current,
          );
        }
      })
      .catch(() => {
        if (!cancelled) setFoldersError("Не удалось загрузить папки");
      })
      .finally(() => {
        if (!cancelled) setInboxReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshCounter]);

  useEffect(() => {
    if (!inboxReady) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setMessagesError(null);
      }
    });
    void fetchMailMessages({
      folder: activeFolder,
      filter,
      q: search,
    })
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setMessagesError(null);
          if (selectedUid !== null && !result.items.some((item) => item.uid === selectedUid)) {
            setSelectedUid(null);
            setMessage(null);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMessagesError(err instanceof Error ? err.message : "Ошибка загрузки");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFolder, filter, search, refreshCounter, inboxReady]);

  useEffect(() => {
    if (!inboxReady || selectedUid !== null) return;
    const timerId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshMailbox();
      }
    }, 45000);
    return () => window.clearInterval(timerId);
  }, [inboxReady, selectedUid, refreshMailbox]);

  const activeFolderLabel =
    folders.find((f) => f.path === activeFolder)?.label ?? activeFolder;

  async function openMessage(uid: number) {
    setSelectedUid(uid);
    setMessageLoading(true);
    try {
      const msg = await fetchMailMessage(activeFolder, uid);
      setMessage(msg);
      setItems((prev) =>
        prev.map((item) => (item.uid === uid ? { ...item, unread: false } : item)),
      );
    } catch (err) {
      setMessagesError(err instanceof Error ? err.message : "Ошибка");
      setSelectedUid(null);
      setMessage(null);
    } finally {
      setMessageLoading(false);
    }
  }

  function closeMessage() {
    setSelectedUid(null);
    setMessage(null);
  }

  function handleFolderSelect(path: string) {
    setActiveFolder(path);
    closeMessage();
  }

  async function handleToggleRead() {
    if (!selectedUid || !message) return;
    const action = message.unread ? "read" : "unread";
    await patchMailMessage(activeFolder, selectedUid, action);
    setMessage({ ...message, unread: action === "unread" });
    setItems((prev) =>
      prev.map((item) =>
        item.uid === selectedUid ? { ...item, unread: action === "unread" } : item,
      ),
    );
    refreshMailbox();
    void fetchMailFolders()
      .then(setFolders)
      .catch(() => undefined);
  }

  async function handleDelete() {
    if (!selectedUid) return;
    await patchMailMessage(activeFolder, selectedUid, "delete");
    closeMessage();
    refreshMailbox();
    void fetchMailFolders()
      .then(setFolders)
      .catch(() => undefined);
  }

  function handleReply() {
    if (!message) return;
    openCompose({
      to: message.from.replace(/.*<([^>]+)>.*/, "$1").includes("@")
        ? message.from.replace(/.*<([^>]+)>.*/, "$1")
        : message.from,
      subject: message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`,
      text: `\n\n---\n${message.bodyText}`,
    });
  }

  const unreadInFolder = folders.find((f) => f.path === activeFolder)?.unread ?? 0;
  const title = unreadInFolder
    ? `${activeFolderLabel} ${unreadInFolder}`
    : activeFolderLabel;

  const totalUnread = folders.reduce((sum, f) => sum + f.unread, 0);
  const showMobileMessage = selectedUid !== null && message !== null;

  const toolbarButtons = (
    <div className="flex items-center gap-1 relative">
      <button
        type="button"
        onClick={refreshMailbox}
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 touch-manipulation"
        aria-label="Обновить"
        title="Обновить"
      >
        ↻
      </button>
      <button
        type="button"
        onClick={() => {
          setFilterOpen((v) => !v);
          setSearchOpen(false);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 touch-manipulation"
        aria-label="Фильтр"
        title="Фильтр"
      >
        ⏚
      </button>
      <button
        type="button"
        onClick={() => {
          setSearchOpen((v) => !v);
          setFilterOpen(false);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 touch-manipulation md:hidden"
        aria-label="Поиск"
      >
        🔍
      </button>
      <button
        type="button"
        onClick={() => setAccountOpen(true)}
        className="hidden md:flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
        aria-label="Аккаунт"
        title={email}
      >
        👤
      </button>
      {filterOpen && (
        <MailFilterMenu
          filter={filter}
          onChange={(value) => {
            setFilter(value);
            setFilterOpen(false);
          }}
        />
      )}
    </div>
  );

  const notices = (
    <>
      {sentNotice && (
        <p className="shrink-0 px-3 py-2 text-sm text-sky-800 bg-sky-50 md:px-4">{sentNotice}</p>
      )}
      {foldersError && (
        <p className="shrink-0 px-3 py-2 text-sm text-amber-700 bg-amber-50 md:px-4">{foldersError}</p>
      )}
      {messagesError && !items.length && (
        <p className="shrink-0 px-3 py-2 text-sm text-red-600 bg-red-50 md:px-4">{messagesError}</p>
      )}
      {messagesError && items.length > 0 && (
        <p className="shrink-0 px-3 py-2 text-sm text-amber-700 bg-amber-50 md:px-4">
          {messagesError}
          {" · "}
          <button
            type="button"
            className="underline touch-manipulation"
            onClick={refreshMailbox}
          >
            Повторить
          </button>
        </p>
      )}
    </>
  );

  return (
    <>
      <MailShell
        layout="inbox"
        title={title}
        leading={
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 touch-manipulation md:hidden"
            aria-label="Папки"
          >
            ☰
            {totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-sky-600 text-[10px] font-bold flex items-center justify-center text-white">
                {Math.min(99, totalUnread)}
              </span>
            )}
          </button>
        }
        trailing={toolbarButtons}
      >
        <div className="hidden md:block shrink-0 border-b border-gray-200 bg-gray-50/80 px-4 py-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по письмам…"
            className="w-full max-w-md rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <MailFolderSidebar
            email={email}
            folders={folders}
            activeFolder={activeFolder}
            onSelect={handleFolderSelect}
            onCompose={() => openCompose()}
            onAccount={() => setAccountOpen(true)}
            className="hidden md:flex md:w-56 lg:w-64 shrink-0 border-r border-gray-200"
          />

          <div
            className={`flex min-h-0 min-w-0 flex-col md:w-80 lg:w-96 md:shrink-0 md:border-r md:border-gray-200 ${
              showMobileMessage ? "hidden md:flex" : "flex flex-1 md:flex-none"
            }`}
          >
            <div className="hidden md:flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">{activeFolderLabel}</h2>
              {unreadInFolder > 0 && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                  {unreadInFolder} нов.
                </span>
              )}
            </div>
            {searchOpen && (
              <div className="shrink-0 px-3 py-2 border-b border-gray-200 md:hidden">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск…"
                  className="w-full rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-900"
                  style={{ fontSize: "16px" }}
                  autoFocus
                />
              </div>
            )}

            {notices}

            {loading && !items.length ? (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
                Загрузка…
              </div>
            ) : (
              <MailList
                items={items}
                selectedUid={selectedUid}
                onSelect={(uid) => void openMessage(uid)}
              />
            )}

            <div className="relative shrink-0 md:hidden">
              <button
                type="button"
                onClick={() => openCompose()}
                className="absolute -top-14 right-4 flex items-center gap-2 rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-lg"
              >
                ✏️ Написать
              </button>
              <MailServicesNav email={email} onAccount={() => setAccountOpen(true)} />
            </div>
          </div>

          <div
            className={`min-h-0 min-w-0 flex-col flex-1 ${
              showMobileMessage ? "flex md:flex" : "hidden md:flex"
            }`}
          >
            {messageLoading && !message ? (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
                Загрузка письма…
              </div>
            ) : message && selectedUid !== null ? (
              <MailMessageView
                message={message}
                folder={activeFolder}
                onBack={closeMessage}
                onReply={handleReply}
                onDelete={() => void handleDelete()}
                onToggleRead={() => void handleToggleRead()}
                showBack
              />
            ) : (
              <MailEmptyPreview />
            )}
          </div>
        </div>
      </MailShell>

      <MailFolderDrawer
        open={drawerOpen}
        email={email}
        folders={folders}
        activeFolder={activeFolder}
        onClose={() => setDrawerOpen(false)}
        onSelect={handleFolderSelect}
        onCompose={() => openCompose()}
        onAccount={() => setAccountOpen(true)}
      />

      <MailAccountSheet
        open={accountOpen}
        email={email}
        onClose={() => setAccountOpen(false)}
        onLogout={() => router.replace("/tools/mail/login")}
      />

      <MailComposeSheet
        open={composeOpen}
        initialTo={composeDefaults.to}
        initialSubject={composeDefaults.subject}
        initialText={composeDefaults.text}
        onClose={() => setComposeOpen(false)}
        onSent={handleSent}
      />
    </>
  );
}
