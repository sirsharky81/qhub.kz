"use client";

import Link from "next/link";
import { ActiveFamilySessions } from "./components/ActiveFamilySessions";
import { FamilyShell } from "./components/FamilyShell";

export function RoleChooserClient() {
  return (
    <FamilyShell title="Семья" subtitle="Геолокация и SOS" backHref="/">
      <div className="p-4 flex flex-col gap-4 pb-6">
        <ActiveFamilySessions />

        <p className="text-sm text-gray-600 leading-relaxed">
          Родители видят участников на карте. Участники передают геолокацию со своего телефона и могут
          позвонить по SOS-номеру семьи.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Родитель</p>
          <Link
            href="/tools/family/parent"
            className="block w-full rounded-xl bg-gray-900 text-white py-3.5 text-center text-sm font-semibold touch-manipulation active:opacity-90"
          >
            Создать семью
          </Link>
          <p className="text-xs text-gray-500 leading-relaxed px-1">
            1. Задайте название семьи
            <br />
            2. Добавьте участника — отсканируйте его QR
            <br />
            3. Следите на карте, настройте SOS-номер
          </p>
          <Link
            href="/tools/family/parent/join"
            className="block w-full rounded-xl border border-gray-300 bg-white text-gray-900 py-3.5 text-center text-sm font-semibold touch-manipulation active:bg-gray-50"
          >
            Присоединиться к семье
            <span className="block text-xs font-normal text-gray-500 mt-1">второй родитель</span>
          </Link>
          <p className="text-xs text-gray-500 leading-relaxed px-1">
            Создатель приглашает QR или ссылкой — вы видите участников и карту наравне с ним.
          </p>
        </div>

        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Участник</p>
          <Link
            href="/tools/family/child"
            className="block w-full rounded-xl border-2 border-rose-200 bg-rose-50 text-rose-900 py-3.5 text-center text-sm font-semibold touch-manipulation active:bg-rose-100"
          >
            Я участник
            <span className="block text-xs font-normal text-rose-700/80 mt-1">ребёнок, подопечный и др.</span>
          </Link>
          <p className="text-xs text-gray-500 leading-relaxed px-1">
            1. Введите имя и покажите QR родителю
            <br />
            2. Включите «Делиться геолокацией»
            <br />
            3. SOS — звонок на доверенный номер семьи
          </p>
        </div>

        <Link
          href="/tools/family/child"
          className="text-center text-xs text-sky-600 underline pt-1 touch-manipulation"
        >
          Установить PWA для участника
        </Link>
      </div>
    </FamilyShell>
  );
}
