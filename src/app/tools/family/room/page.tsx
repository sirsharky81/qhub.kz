"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parentRoomUrl } from "@/lib/app-routes";

function LegacyFamilyRoomRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  useEffect(() => {
    if (id) router.replace(parentRoomUrl(id));
    else router.replace("/tools/family/parent");
  }, [router, id]);

  return <div className="p-6 text-center text-gray-500 text-sm">Перенаправление…</div>;
}

export default function LegacyFamilyRoomRedirect() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500 text-sm">Загрузка…</div>}>
      <LegacyFamilyRoomRedirectInner />
    </Suspense>
  );
}
