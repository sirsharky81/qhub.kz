import { Suspense } from "react";
import { CastWatchClient } from "./CastWatchClient";

export default function CastWatchPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-500">Загрузка…</div>}>
      <CastWatchClient />
    </Suspense>
  );
}
