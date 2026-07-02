"use client";

interface Props {
  phase: string;
  errorMessage?: string | null;
  variant?: "light" | "dark";
}

export function CallStatusText({ phase, errorMessage, variant = "light" }: Props) {
  if (errorMessage) {
    return (
      <span className={`text-sm ${variant === "dark" ? "text-red-300" : "text-red-600"}`}>
        {errorMessage}
      </span>
    );
  }

  const labels: Record<string, string> = {
    outgoing: "Звоним…",
    incoming: "Входящий звонок",
    connecting: "Соединение…",
    active: "Разговор",
    ended: "Звонок завершён",
  };

  return (
    <span className={`text-sm ${variant === "dark" ? "text-gray-300" : "text-gray-600"}`}>
      {labels[phase] ?? ""}
    </span>
  );
}
