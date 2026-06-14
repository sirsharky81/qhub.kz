"use client";

import Link from "next/link";
import { useState } from "react";
import IdeaModal from "./IdeaModal";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [ideaOpen, setIdeaOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
        <nav className="mx-auto max-w-6xl px-4 sm:px-6 flex items-center justify-between h-14">

          {/* Logo + tagline */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon-192.png?v=4"
                alt="QHub"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-semibold text-gray-900 tracking-tight text-sm">
                QHub<span className="text-gray-400">.kz</span>
              </span>
              <span className="text-[9px] text-gray-400 tracking-wide hidden sm:block">
                Первый казахский хаб полезных приложений
              </span>
            </div>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/#about" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              О проекте
            </Link>
            <Link href="/#apps" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Приложения
            </Link>
            <Link href="/#submit" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Для разработчиков
            </Link>
            <Link href="/merch" className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1.5">
              Merch
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-900 text-white font-medium leading-none tracking-wide">
                скоро
              </span>
            </Link>
          </div>

          {/* CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => setIdeaOpen(true)}
              className="text-sm px-4 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-all"
            >
              Предложить идею
            </button>
            <Link
              href="/apps/credit-calculator"
              className="text-sm px-4 py-1.5 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
            >
              Попробовать →
            </Link>
          </div>

          {/* Mobile burger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-md text-gray-400 hover:text-gray-700"
            aria-label="Меню"
          >
            <div className="w-5 flex flex-col gap-1.5">
              <span className={`block h-px bg-current transition-all ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <span className={`block h-px bg-current transition-all ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block h-px bg-current transition-all ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </div>
          </button>
        </nav>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-3">
            <Link href="/#about" onClick={() => setMenuOpen(false)} className="text-sm text-gray-600 hover:text-gray-900 py-1">О проекте</Link>
            <Link href="/#apps" onClick={() => setMenuOpen(false)} className="text-sm text-gray-600 hover:text-gray-900 py-1">Приложения</Link>
            <Link href="/#submit" onClick={() => setMenuOpen(false)} className="text-sm text-gray-600 hover:text-gray-900 py-1">Для разработчиков</Link>
            <Link href="/merch" onClick={() => setMenuOpen(false)} className="text-sm text-gray-600 hover:text-gray-900 py-1 flex items-center gap-1.5">
              Merch
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-900 text-white font-medium leading-none tracking-wide">
                скоро
              </span>
            </Link>
            <button
              onClick={() => { setMenuOpen(false); setIdeaOpen(true); }}
              className="text-sm text-left text-gray-600 hover:text-gray-900 py-1"
            >
              Предложить идею
            </button>
            <Link
              href="/apps/credit-calculator"
              className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white font-medium text-center mt-1"
            >
              Попробовать →
            </Link>
          </div>
        )}
      </header>

      <IdeaModal open={ideaOpen} onClose={() => setIdeaOpen(false)} />
    </>
  );
}
