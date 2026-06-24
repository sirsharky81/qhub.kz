"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FamilyShell } from "../components/FamilyShell";
import { createFamilyRoomApi } from "@/lib/family/client";
import { clearParentSession, loadParentSession, saveParentSession } from "@/lib/family/session";

export function ParentHomeClient() {
  const router = useRouter();
  const [name, setName] = useState("Семья");
  const [parentName, setParentName] = useState("Родитель");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = loadParentSession();
    if (session?.roomId) {
      router.replace(`/tools/family/parent/room/${session.roomId}`);
    }
  }, [router]);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const session = await createFamilyRoomApi(name, parentName.trim() || "Родитель");
      saveParentSession(session);
      router.replace(`/tools/family/parent/room/${session.roomId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setLoading(false);
    }
  }

  return (
    <FamilyShell title="Родитель" subtitle="Создайте семейную комнату" backHref="/tools/family">
      <div className="p-4 space-y-4">
        <label className="block text-sm font-medium text-gray-700">Ваше имя</label>
        <input
          value={parentName}
          onChange={(e) => setParentName(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
          placeholder="Родитель"
        />
        <label className="block text-sm font-medium text-gray-700">Название семьи</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
          placeholder="Семья"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          className="w-full rounded-xl bg-gray-900 text-white py-3 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Создание…" : "Создать семью"}
        </button>
        <Link
          href="/tools/family/parent/join"
          className="block w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-semibold"
        >
          Присоединиться по приглашению
        </Link>
        <button
          type="button"
          onClick={() => {
            clearParentSession();
            router.replace("/tools/family");
          }}
          className="w-full text-sm text-gray-500 underline"
        >
          Назад к выбору роли
        </button>
      </div>
    </FamilyShell>
  );
}
