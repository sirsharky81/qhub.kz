import { Suspense } from "react";
import { ParentScanClient } from "./ParentScanClient";

export default function ParentScanPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500">Загрузка…</div>}>
      <ParentScanClient />
    </Suspense>
  );
}
