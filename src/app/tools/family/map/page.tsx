"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parentMapUrl } from "@/lib/app-routes";

function LegacyFamilyMapRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id");

  useEffect(() => {
    if (id) router.replace(parentMapUrl(id));
    else router.replace("/tools/family/parent");
  }, [router, id]);

  return <div className="p-6 text-center text-gray-500 text-sm">Перенаправление…</div>;
}

export default function LegacyFamilyMapRedirect() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500 text-sm">Загрузка…</div>}>
      <LegacyFamilyMapRedirectInner />
    </Suspense>
  );
}
