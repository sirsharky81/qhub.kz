import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QHub Games — карточные игры",
  description: "Игровой раздел QHub. MVP включает игру Червы (Hearts).",
};

export default function GamesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">QHub Games</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Игровой раздел платформы QHub. Сейчас доступна MVP-версия игры «Червы».
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Карточные игры</h2>
        <div className="mt-3">
          <Link
            href="/tools/games/hearts"
            className="inline-flex rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2"
          >
            Открыть «Червы» (Hearts)
          </Link>
        </div>
      </section>
    </main>
  );
}
