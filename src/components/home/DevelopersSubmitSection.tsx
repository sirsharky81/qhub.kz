"use client";

import Link from "next/link";
import { useState } from "react";
import DeveloperModal from "@/components/DeveloperModal";

export function DevelopersSubmitSection() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section id="submit" className="py-20 px-4 sm:px-6 border-t border-gray-100">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative rounded-3xl border border-gray-200 bg-gray-50 px-8 py-14 overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] opacity-30"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(124,58,237,0.15) 0%, transparent 70%)",
              }}
            />

            <p className="relative text-xs uppercase tracking-widest text-gray-400 mb-4 font-mono">
              Для разработчиков
            </p>
            <h2 className="relative text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-gray-900">
              У вас есть полезное приложение?
            </h2>
            <p className="relative text-sm text-gray-500 mb-8 leading-relaxed max-w-lg mx-auto">
              Если вы создали что-то полезное в стиле vibe coding — мы рассмотрим размещение на
              QHub.kz. Платформа открыта для казахстанских разработчиков и энтузиастов.
            </p>
            <div className="relative flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="px-6 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm"
              >
                Написать нам
              </button>
              <Link
                href="/#apps"
                className="px-6 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:text-gray-900 hover:border-gray-300 hover:bg-white transition-all"
              >
                Смотреть приложения
              </Link>
            </div>
          </div>
        </div>
      </section>

      <DeveloperModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
