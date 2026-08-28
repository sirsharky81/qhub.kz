"use client";

import type { MailFolder } from "@/lib/mail/web/types";

interface Props {
  open: boolean;
  email: string;
  folders: MailFolder[];
  activeFolder: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export function MailFolderDrawer({ open, email, folders, activeFolder, onClose, onSelect }: Props) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 bg-black/60"
        aria-label="Закрыть меню"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 left-0 z-[51] w-[min(85vw,320px)] bg-zinc-950 border-r border-zinc-800 flex flex-col"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-xs text-zinc-500">Аккаунт</p>
          <p className="text-sm font-medium truncate">{email}</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {folders.map((folder) => {
            const active = folder.path === activeFolder;
            return (
              <button
                key={folder.path}
                type="button"
                onClick={() => {
                  onSelect(folder.path);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm ${
                  active ? "text-sky-400 bg-sky-950/30" : "text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <span className="flex-1 truncate">{folder.label}</span>
                {folder.unread > 0 && (
                  <span className="text-xs text-zinc-400 shrink-0">{folder.unread}</span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
