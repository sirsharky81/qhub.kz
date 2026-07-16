import type { SplitRoomSnapshot } from "../types";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function exportSnapshotCsv(snapshot: SplitRoomSnapshot): string {
  const lines: string[] = [];
  lines.push(`room,${csvEscape(snapshot.room.roomId)},${csvEscape(snapshot.room.name)},${snapshot.room.baseCurrency}`);
  lines.push("");
  lines.push("balances,memberId,displayName,paid,share,net");
  for (const b of snapshot.balances) {
    const name = snapshot.members.find((m) => m.memberId === b.memberId)?.displayName ?? "";
    lines.push(
      ["balance", b.memberId, csvEscape(name), b.paidBase, b.shareBase, b.netBase].join(","),
    );
  }
  lines.push("");
  lines.push(
    "expenses,id,description,amountOriginal,currency,rate,amountBase,paidBy,method,category,personal",
  );
  for (const e of snapshot.expenses) {
    lines.push(
      [
        "expense",
        e.id,
        csvEscape(e.description),
        e.amountOriginal,
        e.currencyOriginal,
        e.exchangeRate,
        e.amountBase,
        e.paidByMemberId,
        e.splitMethod,
        e.categoryId,
        e.personal ? "1" : "0",
      ].join(","),
    );
  }
  lines.push("");
  lines.push("settlements,id,from,to,amountBase,date,status");
  for (const s of snapshot.settlements) {
    lines.push(
      ["settlement", s.id, s.fromMemberId, s.toMemberId, s.amountBase, s.date, s.status].join(","),
    );
  }
  lines.push("");
  lines.push("suggestions,from,to,amountBase");
  for (const s of snapshot.suggestions) {
    lines.push(["suggestion", s.fromMemberId, s.toMemberId, s.amountBase].join(","));
  }
  return lines.join("\n");
}
