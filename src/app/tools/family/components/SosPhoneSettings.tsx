"use client";

import { useEffect, useState } from "react";
import { updateSosPhoneApi } from "@/lib/family/client";
import { normalizeSosPhone } from "@/lib/family/phone";
import type { FamilySession } from "@/lib/family/types";

interface Props {
  session: FamilySession;
  sosPhone?: string | null;
  onSaved: () => void;
}

export function SosPhoneSettings({ session, sosPhone, onSaved }: Props) {
  const [value, setValue] = useState(sosPhone ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(sosPhone ?? "");
  }, [sosPhone]);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const trimmed = value.trim();
      await updateSosPhoneApi(session, trimmed ? normalizeSosPhone(trimmed) : null);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-gray-200 p-4">
      <p className="text-sm font-medium text-gray-800">Доверенный номер SOS</p>
      <p className="text-xs text-gray-500 leading-relaxed">
        Участник нажимает кнопку SOS и сразу звонит на этот номер. Указывает только создатель семьи.
      </p>
      <input
        type="tel"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="+7 700 123 45 67"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && <p className="text-xs text-emerald-600">Сохранено</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={loading}
        className="w-full rounded-lg bg-gray-900 text-white py-2 text-sm font-medium disabled:opacity-50"
      >
        {loading ? "Сохранение…" : "Сохранить номер"}
      </button>
    </div>
  );
}
