"use client";

type Status = "online" | "reconnecting" | "offline";

interface Props {
  status: Status;
}

const LABELS: Record<Status, string> = {
  online: "онлайн",
  reconnecting: "переподключение…",
  offline: "оффлайн",
};

const COLORS: Record<Status, string> = {
  online: "bg-emerald-500",
  reconnecting: "bg-amber-400 animate-pulse",
  offline: "bg-gray-400",
};

export function ConnectionStatus({ status }: Props) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`w-1.5 h-1.5 rounded-full ${COLORS[status]}`} />
      {LABELS[status]}
    </span>
  );
}
