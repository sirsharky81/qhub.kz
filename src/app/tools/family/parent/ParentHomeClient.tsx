"use client";

import Link from "next/link";
import { parentRoomUrl } from "@/lib/app-routes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FamilyShell } from "../components/FamilyShell";
import { createFamilyRoomApi } from "@/lib/family/client";
import { clearParentSession, loadParentSession, saveParentSession } from "@/lib/family/session";

const inputClass = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm";
const btnPrimary = "w-full rounded-lg bg-gray-900 text-white py-2 text-xs font-medium disabled:opacity-50";
const btnSecondary =
  "block w-full rounded-lg border border-gray-200 py-2 text-center text-xs font-medium";

export function ParentHomeClient() {
  const router = useRouter();
  const [name, setName] = useState("Семья");
  const [parentName, setParentName] = useState("Родитель");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = loadParentSession();
    if (session?.roomId) {
      router.replace(parentRoomUrl(session.roomId));
    }
  }, [router]);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const session = await createFamilyRoomApi(name, parentName.trim() || "Родитель");
      saveParentSession(session);
      router.replace(parentRoomUrl(session.roomId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setLoading(false);
    }
  }

  return (
    <FamilyShell title="Родитель" subtitle="Создайте семейную комнату" backHref="/tools/family">
      <div className="p-3 space-y-3">
        <label className="block text-xs font-medium text-gray-700">Ваше имя</label>
        <input
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
          className={inputClass}
          placeholder="Родитель"
        />
        <label className="block text-xs font-medium text-gray-700">Название семьи</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Семья"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={handleCreate} disabled={loading} className={btnPrimary}>
          {loading ? "Создание…" : "Создать семью"}
        </button>
        <Link href="/tools/family/parent/join" className={btnSecondary}>
          Присоединиться по приглашению
        </Link>
        <button
          type="button"
          onClick={() => {
            clearParentSession();
            router.replace("/tools/family");
          }}
          className="w-full text-xs text-gray-500 underline"
        >
          Назад к выбору роли
        </button>
      </div>
    </FamilyShell>
  );
}
