import { fisherYatesShuffle, getSecureRandomInt, pickRandomMany } from "./crypto";

export const LOTTO_TICKET_ROWS = 3;
export const LOTTO_TICKET_COLS = 9;
export const LOTTO_MIN_PLAYERS = 2;
export const LOTTO_MAX_PLAYERS = 8;

/** Допустимые распределения чисел по столбцам (сумма = 15, в каждом столбце 1–3 числа). */
const COLUMN_HEIGHT_PRESETS: readonly (readonly number[])[] = [
  [1, 1, 1, 2, 2, 2, 2, 2, 2],
  [1, 1, 1, 1, 2, 2, 2, 2, 3],
  [1, 1, 1, 1, 1, 2, 2, 3, 3],
  [1, 1, 1, 1, 1, 1, 2, 2, 3],
  [1, 1, 1, 1, 1, 1, 3, 3, 3],
];

export type LottoWinType = "oneLine" | "twoLines" | "fullCard";

export interface LottoTicket {
  /** 3×9 сетка: число или пустая ячейка */
  rows: (number | null)[][];
}

export interface LottoPlayer {
  id: string;
  name: string;
  ticket: LottoTicket | null;
  /** Уже зафиксированные типы выигрыша в текущей партии */
  wins: LottoWinType[];
  /** Сетевая игра: код для присоединения */
  joinCode?: string;
  joinToken?: string;
  joined?: boolean;
  left?: boolean;
}

export interface LottoWinRules {
  oneLine: boolean;
  twoLines: boolean;
  fullCard: boolean;
  /** Пауза при выигрыше — продолжение только по кнопке ведущего */
  pauseOnWin: boolean;
}

export interface LottoWinAlert {
  playerId: string;
  playerName: string;
  winType: LottoWinType;
  ticket: LottoTicket;
  winningRowIndices: number[];
}

export const DEFAULT_LOTTO_WIN_RULES: LottoWinRules = {
  oneLine: true,
  twoLines: true,
  fullCard: true,
  pauseOnWin: true,
};

export const LOTTO_WIN_LABELS: Record<LottoWinType, string> = {
  oneLine: "Одна линия",
  twoLines: "Две линии",
  fullCard: "Полная карточка",
};

function columnRange(col: number): { min: number; max: number } {
  if (col === 0) return { min: 1, max: 9 };
  if (col === 8) return { min: 80, max: 90 };
  return { min: col * 10, max: col * 10 + 9 };
}

function createEmptyGrid(): (number | null)[][] {
  return Array.from({ length: LOTTO_TICKET_ROWS }, () =>
    Array<number | null>(LOTTO_TICKET_COLS).fill(null),
  );
}

function tryPlaceGrid(heights: readonly number[]): (number | null)[][] | null {
  const grid = createEmptyGrid();
  const rowCounts = [0, 0, 0];

  function combinations(rows: number[], count: number): number[][] {
    if (count === 0) return [[]];
    if (rows.length < count) return [];
    if (count === 1) return rows.map((row) => [row]);
    const [first, ...rest] = rows;
    return [
      ...combinations(rest, count - 1).map((combo) => [first!, ...combo]),
      ...combinations(rest, count),
    ];
  }

  function placeColumn(col: number): boolean {
    if (col === LOTTO_TICKET_COLS) {
      return rowCounts.every((count) => count === 5);
    }

    const height = heights[col]!;
    const availableRows = [0, 1, 2].filter((row) => rowCounts[row]! < 5);
    if (availableRows.length < height) return false;

    const options = fisherYatesShuffle(combinations(availableRows, height));
    for (const chosenRows of options) {
      for (const row of chosenRows) {
        grid[row]![col] = -1;
        rowCounts[row]!++;
      }

      if (placeColumn(col + 1)) return true;

      for (const row of chosenRows) {
        grid[row]![col] = null;
        rowCounts[row]!--;
      }
    }

    return false;
  }

  return placeColumn(0) ? grid : null;
}

function fillGridNumbers(grid: (number | null)[][]): void {
  for (let col = 0; col < LOTTO_TICKET_COLS; col++) {
    const { min, max } = columnRange(col);
    const slots: number[] = [];
    for (let row = 0; row < LOTTO_TICKET_ROWS; row++) {
      if (grid[row]![col] !== null) slots.push(row);
    }
    const nums = pickRandomMany(
      Array.from({ length: max - min + 1 }, (_, i) => i + min),
      slots.length,
    );
    slots.forEach((row, i) => {
      grid[row]![col] = nums[i]!;
    });
  }
}

/** Генерирует классический билет 3×9 (15 чисел, по 5 в строке). */
export function generateLottoTicket(): LottoTicket {
  for (let attempt = 0; attempt < 300; attempt++) {
    const preset =
      COLUMN_HEIGHT_PRESETS[getSecureRandomInt(0, COLUMN_HEIGHT_PRESETS.length - 1)]!;
    const heights = fisherYatesShuffle([...preset]);
    const grid = tryPlaceGrid(heights);
    if (!grid) continue;
    fillGridNumbers(grid);
    return { rows: grid };
  }

  throw new Error("Не удалось сформировать билет");
}

export function generateTicketsForPlayers(players: readonly LottoPlayer[]): LottoPlayer[] {
  return players.map((p) => ({
    ...p,
    ticket: generateLottoTicket(),
    wins: [],
  }));
}

export function createPlayer(name: string): LottoPlayer {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `player-${Date.now()}-${getSecureRandomInt(1, 1_000_000_000)}`;

  return {
    id,
    name: name.trim(),
    ticket: null,
    wins: [],
  };
}

export function getTicketNumbers(ticket: LottoTicket): number[] {
  const nums: number[] = [];
  for (const row of ticket.rows) {
    for (const cell of row) {
      if (cell !== null) nums.push(cell);
    }
  }
  return nums;
}

export function getCompletedLineIndices(ticket: LottoTicket, drawn: readonly number[]): number[] {
  const drawnSet = new Set(drawn);
  const completed: number[] = [];
  ticket.rows.forEach((row, idx) => {
    const nums = row.filter((n): n is number => n !== null);
    if (nums.length === 5 && nums.every((n) => drawnSet.has(n))) {
      completed.push(idx);
    }
  });
  return completed;
}

export function isFullCardComplete(ticket: LottoTicket, drawn: readonly number[]): boolean {
  const drawnSet = new Set(drawn);
  return getTicketNumbers(ticket).every((n) => drawnSet.has(n));
}

export function detectNewWin(
  player: LottoPlayer,
  drawn: readonly number[],
  rules: LottoWinRules,
): Omit<LottoWinAlert, "playerId" | "playerName"> | null {
  if (!player.ticket) return null;

  const completedLines = getCompletedLineIndices(player.ticket, drawn);
  const hasWin = (type: LottoWinType) => player.wins.includes(type);

  if (
    rules.fullCard &&
    !hasWin("fullCard") &&
    isFullCardComplete(player.ticket, drawn)
  ) {
    return {
      winType: "fullCard",
      ticket: player.ticket,
      winningRowIndices: [0, 1, 2],
    };
  }

  if (
    rules.twoLines &&
    !hasWin("twoLines") &&
    completedLines.length >= 2
  ) {
    return {
      winType: "twoLines",
      ticket: player.ticket,
      winningRowIndices: completedLines.slice(0, 2),
    };
  }

  if (
    rules.oneLine &&
    !hasWin("oneLine") &&
    completedLines.length >= 1
  ) {
    return {
      winType: "oneLine",
      ticket: player.ticket,
      winningRowIndices: [completedLines[0]!],
    };
  }

  return null;
}

export function detectWinsAmongPlayers(
  players: readonly LottoPlayer[],
  drawn: readonly number[],
  rules: LottoWinRules,
): { alert: LottoWinAlert | null; players: LottoPlayer[] } {
  if (players.length < 2 || !players.every((p) => p.ticket)) {
    return { alert: null, players: [...players] };
  }

  const priority: LottoWinType[] = ["fullCard", "twoLines", "oneLine"];
  let best: LottoWinAlert | null = null;
  let bestPriority = -1;

  const updated = players.map((player) => {
    const win = detectNewWin(player, drawn, rules);
    if (!win) return player;

    const priorityIdx = priority.indexOf(win.winType);
    if (priorityIdx > bestPriority) {
      bestPriority = priorityIdx;
      best = {
        playerId: player.id,
        playerName: player.name,
        ...win,
      };
    }

    return {
      ...player,
      wins: player.wins.includes(win.winType)
        ? player.wins
        : [...player.wins, win.winType],
    };
  });

  return { alert: best, players: updated };
}

export function formatTicketText(playerName: string, ticket: LottoTicket): string {
  const lines = ticket.rows.map((row, i) => {
    const nums = row.filter((n): n is number => n !== null);
    return `Строка ${i + 1}: ${nums.join("  ")}`;
  });
  return `Русское лото — билет: ${playerName}\n\n${lines.join("\n")}\n\nqhub.kz`;
}

export function ticketToPrintHtml(playerName: string, ticket: LottoTicket): string {
  const rowsHtml = ticket.rows
    .map((row) => {
      const cells = row
        .map((cell) => {
          if (cell === null) {
            return `<td class="empty"></td>`;
          }
          return `<td class="num">${cell}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Билет — ${playerName}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 16px; }
    table { border-collapse: collapse; width: 100%; max-width: 520px; }
    td { border: 1px solid #333; text-align: center; height: 36px; width: 11%; }
    td.num { font-weight: 700; font-size: 16px; }
    td.empty { background: #f3f4f6; }
    .foot { margin-top: 12px; font-size: 11px; color: #666; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <h1>Русское лото — ${playerName}</h1>
  <table>${rowsHtml}</table>
  <p class="foot">qhub.kz · Генератор случайных чисел</p>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
</body>
</html>`;
}

export function printTicket(playerName: string, ticket: LottoTicket): void {
  const html = ticketToPrintHtml(playerName, ticket);
  const w = window.open("", "_blank", "noopener,noreferrer,width=640,height=480");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export async function shareTicket(playerName: string, ticket: LottoTicket): Promise<void> {
  const text = formatTicketText(playerName, ticket);
  if (navigator.share) {
    try {
      await navigator.share({ title: `Билет — ${playerName}`, text });
      return;
    } catch {
      /* fallback */
    }
  }
  await navigator.clipboard.writeText(text);
}
