import Link from "next/link";
import type { Metadata } from "next";
import { PdfToolLayout } from "../_pdf-shared/PdfToolLayout";

export const metadata: Metadata = {
  title: "QHub Games — карточные игры и лото",
  description: "Игровой раздел QHub: Червы (Hearts) и Русское лото.",
};

export default function GamesPage() {
  return (
    <PdfToolLayout
      title="QHub Games"
      iconSrc="/tools/games/icon.svg"
      shellClassName="min-h-[100dvh] flex flex-col bg-gray-50 dark:bg-gray-950"
      badge={false}
    >
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-5 space-y-4">
          <header className="rounded-2xl border border-violet-200/70 dark:border-violet-900/70 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/10 to-indigo-500/10 p-4">
            <p className="text-[11px] uppercase tracking-wider text-violet-700 dark:text-violet-300 font-semibold">
              QHub ecosystem
            </p>
            <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">Игры QHub</h1>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              Игровой раздел с карточными играми и классическим русским лото.
            </p>
          </header>

          <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                Карточные игры
              </h2>
            </div>
            <div className="p-3">
              <article className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gradient-to-br from-white to-violet-50/50 dark:from-gray-900 dark:to-violet-950/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Червы (Hearts)</h3>
                    <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                      Классическая партия на 4 игроков: офлайн против ИИ и онлайн-комнаты.
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    MVP
                  </span>
                </div>
                <div className="mt-3 grid sm:grid-cols-3 gap-2">
                  <Link
                    href="/tools/games/hearts?mode=offline"
                    className="inline-flex rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold px-3 py-2"
                  >
                    Новая игра против ИИ
                  </Link>
                  <Link
                    href="/tools/games/hearts?mode=create-online"
                    className="inline-flex rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Создать онлайн игру
                  </Link>
                  <Link
                    href="/tools/games/hearts?mode=join-online"
                    className="inline-flex rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Присоединиться к онлайн игре
                  </Link>
                </div>
              </article>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/50">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                Настольные игры
              </h2>
            </div>
            <div className="p-3">
              <article className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gradient-to-br from-white to-amber-50/60 dark:from-gray-900 dark:to-amber-950/20">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Русское лото</h3>
                    <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                      Электронный ведущий: бочки 1–90 без повторений, карточки игроков, онлайн-подключение.
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    Classic
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/tools/random-picker/loto"
                    className="inline-flex rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold px-3 py-2"
                  >
                    Открыть Русское лото
                  </Link>
                </div>
              </article>
            </div>
          </section>
        </div>
      </main>
    </PdfToolLayout>
  );
}
