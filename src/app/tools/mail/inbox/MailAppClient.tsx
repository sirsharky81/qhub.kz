"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { MailFilter } from "@/lib/mail/web/constants";
import { DEFAULT_FOLDER } from "@/lib/mail/web/constants";
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
import { MailList } from "../components/MailList";
import { MailMessageView } from "../components/MailMessageView";
import { MailAccountSheet, MailServicesNav } from "../components/MailServicesNav";
import { MailShell } from "../components/MailShell";

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
  const [error, setError] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [message, setMessage] = useState<MailMessage | null>(null);

  const [refreshCounter, setRefreshCounter] = useState(0);

  function refreshMailbox() {
    setRefreshCounter((value) => value + 1);
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
    void fetchMailFolders()
      .then((list) => {
        if (!cancelled) setFolders(list);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить папки");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshCounter]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });
    void fetchMailMessages({
      folder: activeFolder,
      filter,
      q: search,
    })
      .then((result) => {
        if (!cancelled) setItems(result.items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeFolder, filter, search, refreshCounter]);

  const activeFolderLabel =
    folders.find((f) => f.path === activeFolder)?.label ?? activeFolder;

  async function openMessage(uid: number) {
    setSelectedUid(uid);
    setLoading(true);
    try {
      const msg = await fetchMailMessage(activeFolder, uid);
      setMessage(msg);
      setItems((prev) =>
        prev.map((item) => (item.uid === uid ? { ...item, unread: false } : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setSelectedUid(null);
    } finally {
      setLoading(false);
    }
  }

  function closeMessage() {
    setSelectedUid(null);
    setMessage(null);
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
    setComposeDefaults({
      to: message.from.replace(/.*<([^>]+)>.*/, "$1").includes("@")
        ? message.from.replace(/.*<([^>]+)>.*/, "$1")
        : message.from,
      subject: message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`,
      text: `\n\n---\n${message.bodyText}`,
    });
    setComposeOpen(true);
  }

  const unreadInFolder = folders.find((f) => f.path === activeFolder)?.unread ?? 0;
  const title = unreadInFolder
    ? `${activeFolderLabel} ${unreadInFolder}`
    : activeFolderLabel;

  if (message && selectedUid !== null) {
    return (
      <MailShell title={activeFolderLabel}>
        <MailMessageView
          message={message}
          folder={activeFolder}
          onBack={closeMessage}
          onReply={handleReply}
          onDelete={() => void handleDelete()}
          onToggleRead={() => void handleToggleRead()}
        />
        <MailServicesNav email={email} onAccount={() => setAccountOpen(true)} />
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
          onSent={refreshMailbox}
        />
      </MailShell>
    );
  }

  return (
    <>
      <MailShell
        title={title}
        leading={
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800"
            aria-label="Папки"
          >
            ☰
            {folders.reduce((sum, f) => sum + f.unread, 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-sky-600 text-[10px] font-bold flex items-center justify-center">
                {Math.min(99, folders.reduce((sum, f) => sum + f.unread, 0))}
              </span>
            )}
          </button>
        }
        trailing={
          <div className="flex items-center gap-1 relative">
            <button
              type="button"
              onClick={() => {
                setFilterOpen((v) => !v);
                setSearchOpen(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800"
              aria-label="Фильтр"
            >
              ⏚
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchOpen((v) => !v);
                setFilterOpen(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800"
              aria-label="Поиск"
            >
              🔍
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
        }
      >
        {searchOpen && (
          <div className="shrink-0 px-3 py-2 border-b border-zinc-800">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск…"
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
              style={{ fontSize: "16px" }}
              autoFocus
            />
          </div>
        )}

        {error && (
          <p className="shrink-0 px-3 py-2 text-sm text-red-400 bg-red-950/30">{error}</p>
        )}

        {loading && !items.length ? (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
            Загрузка…
          </div>
        ) : (
          <MailList items={items} onSelect={(uid) => void openMessage(uid)} />
        )}

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setComposeDefaults({ to: "", subject: "", text: "" });
              setComposeOpen(true);
            }}
            className="absolute -top-14 right-4 flex items-center gap-2 rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-lg"
          >
            ✏️ Написать
          </button>
          <MailServicesNav email={email} onAccount={() => setAccountOpen(true)} />
        </div>
      </MailShell>

      <MailFolderDrawer
        open={drawerOpen}
        email={email}
        folders={folders}
        activeFolder={activeFolder}
        onClose={() => setDrawerOpen(false)}
        onSelect={setActiveFolder}
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
        onSent={() => {
          refreshMailbox();
          void fetchMailFolders()
            .then(setFolders)
            .catch(() => undefined);
        }}
      />
    </>
  );
}
