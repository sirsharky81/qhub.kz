import { describe, expect, it } from "vitest";
import { folderLabel, sortFolders } from "./folders";

describe("mail folders", () => {
  it("maps system folder names to Russian labels", () => {
    expect(folderLabel("INBOX", "\\Inbox")).toBe("Входящие");
    expect(folderLabel("Sent Items", "\\Sent")).toBe("Отправленные");
    expect(folderLabel("custom")).toBe("custom");
  });

  it("sorts system folders first", () => {
    const sorted = sortFolders([
      { path: "family", specialUse: undefined },
      { path: "INBOX", specialUse: "\\Inbox" },
      { path: "Sent Items", specialUse: "\\Sent" },
    ]);
    expect(sorted.map((f) => f.path)).toEqual(["INBOX", "Sent Items", "family"]);
  });
});
