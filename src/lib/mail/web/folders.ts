import { SYSTEM_FOLDER_LABELS } from "./constants";

export function folderLabel(path: string, specialUse?: string): string {
  if (SYSTEM_FOLDER_LABELS[path]) return SYSTEM_FOLDER_LABELS[path];
  if (specialUse === "\\Inbox") return SYSTEM_FOLDER_LABELS.INBOX;
  if (specialUse === "\\Sent") return SYSTEM_FOLDER_LABELS["Sent Items"];
  if (specialUse === "\\Drafts") return SYSTEM_FOLDER_LABELS.Drafts;
  if (specialUse === "\\Trash") return SYSTEM_FOLDER_LABELS.Trash;
  if (specialUse === "\\Junk") return SYSTEM_FOLDER_LABELS.Junk;
  return path;
}

const FOLDER_ORDER = ["INBOX", "Sent Items", "Drafts", "Trash", "Junk", "Spam"];

export function sortFolders<T extends { path: string; specialUse?: string }>(folders: T[]): T[] {
  return [...folders].sort((a, b) => {
    const ai = FOLDER_ORDER.indexOf(a.path);
    const bi = FOLDER_ORDER.indexOf(b.path);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    if (a.specialUse === "\\Inbox") return -1;
    if (b.specialUse === "\\Inbox") return 1;
    return a.path.localeCompare(b.path, "ru");
  });
}
