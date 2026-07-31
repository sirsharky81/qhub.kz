"use client";

import type { NearbyShareRoom } from "@/lib/share/client";

interface Props {
  rooms: NearbyShareRoom[];
  onJoin: (roomCode: string) => void;
  loading?: boolean;
}

export function NearbyRoomsPanel({ rooms, onJoin, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 p-3 text-sm text-gray-500">
        Поиск устройств в локальной сети…
      </div>
    );
  }
  if (!rooms.length) return null;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2">
      <p className="text-sm font-medium text-violet-900">Рядом в сети</p>
      <ul className="space-y-1">
        {rooms.map((room) => (
          <li key={room.roomId}>
            <button
              type="button"
              onClick={() => onJoin(room.roomCode)}
              className="w-full text-left rounded-lg bg-white/80 px-3 py-2 text-sm hover:bg-white"
            >
              <span className="font-mono font-medium">{room.roomCode}</span>
              <span className="text-gray-500"> · {room.deviceName}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
