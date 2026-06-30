"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LegacyJoinRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    if (token) {
      router.replace(`/tools/family/parent/join?token=${encodeURIComponent(token)}`);
    } else {
      router.replace("/tools/family/child");
    }
  }, [router, token]);

  return <div className="p-6 text-center text-gray-500 text-sm">Перенаправление…</div>;
}

export default function LegacyJoinRedirect() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500 text-sm">Загрузка…</div>}>
      <LegacyJoinRedirectInner />
    </Suspense>
  );
}
