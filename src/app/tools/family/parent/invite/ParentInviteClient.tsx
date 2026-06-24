"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FamilyShell } from "../../components/FamilyShell";
import { BindQr } from "../../components/BindQr";
import { createParentInviteApi } from "@/lib/family/client";
import { loadParentSession } from "@/lib/family/session";

export function ParentInviteClient() {
  const router = useRouter();
  const [bindUrl, setBindUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = loadParentSession();
    if (!session) {
      router.replace("/tools/family/parent");
      return;
    }
    if (session.role !== "owner") {
      router.replace(`/tools/family/parent/room/${session.roomId}`);
      return;
    }
    void (async () => {
      try {
        const result = await createParentInviteApi(session);
        setBindUrl(result.bindUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const session = loadParentSession();
  const backHref = session ? `/tools/family/parent/room/${session.roomId}` : "/tools/family/parent";

  return (
    <FamilyShell title="Пригласить родителя" subtitle="Второй родитель в семье" backHref={backHref}>
      {loading && <p className="p-4 text-center text-sm text-gray-500">Создание приглашения…</p>}
      {error && (
        <div className="p-4 space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <Link href={backHref} className="block text-center text-sm underline">
            Назад
          </Link>
        </div>
      )}
      {bindUrl && !error && (
        <>
          <BindQr bindUrl={bindUrl} roleLabel="Приглашение для второго родителя" />
          <p className="px-6 pb-8 text-xs text-gray-500 text-center leading-relaxed">
            Ссылка одноразовая и действует ограниченное время. В семье может быть один дополнительный родитель.
          </p>
        </>
      )}
    </FamilyShell>
  );
}
