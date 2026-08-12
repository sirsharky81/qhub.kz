import { Suspense } from "react";
import { CastHomeClient } from "./CastHomeClient";

export default function CastPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-500">Загрузка…</div>}>
      <CastHomeClient />
    </Suspense>
  );
}
