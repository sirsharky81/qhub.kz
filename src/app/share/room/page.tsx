import { Suspense } from "react";
import { ShareRoomClient } from "./ShareRoomClient";

export default function ShareRoomPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-500">Загрузка…</div>}>
      <ShareRoomClient />
    </Suspense>
  );
}
