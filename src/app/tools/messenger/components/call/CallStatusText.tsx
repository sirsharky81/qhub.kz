"use client";

interface Props {
  phase: string;
  errorMessage?: string | null;
}

export function CallStatusText({ phase, errorMessage }: Props) {
  if (errorMessage) {
    return <span className="text-sm text-red-600">{errorMessage}</span>;
  }

  const labels: Record<string, string> = {
    outgoing: "Звоним…",
    incoming: "Входящий звонок",
    connecting: "Соединение…",
    active: "Разговор",
    ended: "Звонок завершён",
  };

  return (
    <span className="text-sm text-gray-600">
      {labels[phase] ?? ""}
    </span>
  );
}
