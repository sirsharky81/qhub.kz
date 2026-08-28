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
        className="fixed inset-0 z-50 bg-black/30"
        aria-label="Закрыть меню"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 left-0 z-[51] w-[min(85vw,320px)] bg-white border-r border-gray-200 flex flex-col shadow-xl"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-xs text-gray-500">Аккаунт</p>
          <p className="text-sm font-medium truncate text-gray-900">{email}</p>
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
                  active ? "text-sky-700 bg-sky-50 font-medium" : "text-gray-800 hover:bg-gray-50"
                }`}
              >
                <span className="flex-1 truncate">{folder.label}</span>
                {folder.unread > 0 && (
                  <span className="text-xs text-gray-500 shrink-0">{folder.unread}</span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
