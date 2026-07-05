import { Suspense } from "react";
import { RoomSettingsPageClient } from "./RoomSettingsPageClient";

export default function MessengerRoomSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center text-sm text-gray-500">
          Загрузка…
        </div>
      }
    >
      <RoomSettingsPageClient />
    </Suspense>
  );
}
