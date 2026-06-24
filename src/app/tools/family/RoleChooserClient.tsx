"use client";

import Link from "next/link";
import { ActiveFamilySessions } from "./components/ActiveFamilySessions";
import { FamilyShell } from "./components/FamilyShell";

const btnPrimary =
  "block w-full rounded-lg bg-gray-900 text-white py-2 text-center text-xs font-medium touch-manipulation active:opacity-90";
const btnSecondary =
  "block w-full rounded-lg border border-gray-200 bg-white text-gray-900 py-2 text-center text-xs font-medium touch-manipulation active:bg-gray-50";

export function RoleChooserClient() {
  return (
    <FamilyShell title="Семья" subtitle="Геолокация и SOS" backHref="/">
      <div className="p-3 flex flex-col gap-3 pb-5">
        <ActiveFamilySessions />

        <p className="text-[11px] text-gray-600 leading-relaxed">
          Родители видят участников на карте. Участники передают геолокацию со своего телефона и могут
          позвонить по SOS-номеру семьи.
        </p>

        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Родитель</p>
          <Link href="/tools/family/parent" className={btnPrimary}>
            Создать семью
          </Link>
          <p className="text-[11px] text-gray-500 leading-relaxed px-0.5">
            1. Задайте название семьи
            <br />
            2. Добавьте участника — отсканируйте его QR
            <br />
            3. Следите на карте, настройте SOS-номер
          </p>
          <Link href="/tools/family/parent/join" className={btnSecondary}>
            Присоединиться к семье
            <span className="block text-[10px] font-normal text-gray-500 mt-0.5">второй родитель</span>
          </Link>
          <p className="text-[11px] text-gray-500 leading-relaxed px-0.5">
            Создатель приглашает QR или ссылкой — вы видите участников и карту наравне с ним.
          </p>
        </div>

        <div className="space-y-1.5 pt-0.5">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Участник</p>
          <Link
            href="/tools/family/child"
            className="block w-full rounded-lg border border-rose-200 bg-rose-50 text-rose-900 py-2 text-center text-xs font-medium touch-manipulation active:bg-rose-100"
          >
            Я участник
            <span className="block text-[10px] font-normal text-rose-700/80 mt-0.5">ребёнок, подопечный и др.</span>
          </Link>
          <p className="text-[11px] text-gray-500 leading-relaxed px-0.5">
            1. Введите имя и покажите QR родителю
            <br />
            2. Включите «Делиться геолокацией»
            <br />
            3. SOS — звонок на доверенный номер семьи
          </p>
        </div>

        <Link
          href="/tools/family/child"
          className="text-center text-[11px] text-sky-600 underline touch-manipulation"
        >
          Установить PWA для участника
        </Link>
      </div>
    </FamilyShell>
  );
}
