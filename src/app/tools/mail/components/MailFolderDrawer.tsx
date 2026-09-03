"use client";

import type { MailFolder } from "@/lib/mail/web/types";
import { MailFolderSidebar } from "./MailFolderSidebar";

interface Props {
  open: boolean;
  email: string;
  folders: MailFolder[];
  activeFolder: string;
  onClose: () => void;
  onSelect: (path: string) => void;
  onCompose: () => void;
  onAccount: () => void;
}

export function MailFolderDrawer({
  open,
  email,
  folders,
  activeFolder,
  onClose,
  onSelect,
  onCompose,
  onAccount,
}: Props) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 bg-black/30 md:hidden"
        aria-label="Закрыть меню"
        onClick={onClose}
      />
      <MailFolderSidebar
        email={email}
        folders={folders}
        activeFolder={activeFolder}
        onSelect={(path) => {
          onSelect(path);
          onClose();
        }}
        onCompose={() => {
          onCompose();
          onClose();
        }}
        onAccount={() => {
          onAccount();
          onClose();
        }}
        className="fixed inset-y-0 left-0 z-[51] w-[min(85vw,320px)] border-r border-gray-200 shadow-xl md:hidden"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      />
    </>
  );
}
