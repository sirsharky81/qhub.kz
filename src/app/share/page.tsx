import { Suspense } from "react";
import { ShareHomeClient } from "./ShareHomeClient";

export default function SharePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-500">Загрузка…</div>}>
      <ShareHomeClient />
    </Suspense>
  );
}
