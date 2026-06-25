"use client";

type Status = "online" | "reconnecting" | "offline";

interface Props {
  status: Status;
  /** Peer presence in DM; default shows connection state labels. */
  variant?: "peer" | "connection";
}

const PEER_LABELS: Record<"online" | "offline", string> = {
  online: "в сети",
  offline: "не в сети",
};

const CONNECTION_LABELS: Record<Status, string> = {
  online: "онлайн",
  reconnecting: "переподключение…",
  offline: "нет связи",
};

const COLORS: Record<Status, string> = {
  online: "bg-emerald-500",
  reconnecting: "bg-amber-400 animate-pulse",
  offline: "bg-gray-400",
};

export function ConnectionStatus({ status, variant = "connection" }: Props) {
  const label =
    variant === "peer"
      ? PEER_LABELS[status === "online" ? "online" : "offline"]
      : CONNECTION_LABELS[status];

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`w-1.5 h-1.5 rounded-full ${COLORS[status]}`} />
      {label}
    </span>
  );
}
