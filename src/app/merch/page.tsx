import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Merch — QHub.kz",
  description: "Первая коллекция фирменного мерча QHub.kz. Для всех, кто любит полезные вещи.",
};

export default function MerchPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900">
      {/* Thin top bar */}
      <div className="flex-shrink-0 h-11 border-b border-gray-200 bg-white flex items-center px-4 gap-3">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png?v=4" alt="QHub" className="w-full h-full object-cover" />
          </div>
          <span className="text-sm font-medium text-gray-900 group-hover:text-gray-600 transition-colors">
            QHub.kz
          </span>
        </Link>
        <span className="text-gray-300 select-none">/</span>
        <span className="text-sm font-medium text-gray-800">Merch</span>
        <Link
          href="/"
          className="ml-auto text-xs text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← На главную
        </Link>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden flex flex-col items-center text-center px-4 pt-24 pb-16 bg-dot-grid">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% -5%, rgba(10,10,10,0.04) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-28"
          style={{ background: "linear-gradient(to bottom, transparent, #ffffff)" }}
        />

        {/* Coming soon badge */}
        <div className="relative mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-white text-xs text-gray-500 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Первая коллекция — скоро
        </div>

        {/* Headline */}
        <h1 className="relative text-6xl sm:text-7xl md:text-8xl font-bold tracking-tight leading-none mb-4 text-gray-900">
          Скоро.
        </h1>

        {/* Tagline */}
        <p className="relative text-sm sm:text-base text-gray-400 tracking-widest uppercase font-medium mb-2">
          Build useful.
        </p>
        <p className="relative text-base sm:text-lg font-semibold text-gray-900 mb-6">
          QHub.kz
        </p>

        {/* Sub-headline */}
        <p className="relative max-w-md text-base sm:text-lg text-gray-500 leading-relaxed">
          Для всех, кто любит <span className="text-gray-900 font-medium">полезные вещи</span>.
        </p>
      </section>

      {/* Merch render */}
      <section className="flex flex-col items-center px-4 pb-8">
        <div className="w-full max-w-3xl rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
          <Image
            src="/merch-collection.png"
            alt="QHub.kz merch collection — hoodie, cap, t-shirt, tote bag, bottle, mug, notebook"
            width={1080}
            height={1080}
            className="w-full h-auto object-cover"
            priority
          />
        </div>

        {/* Caption */}
        <p className="mt-5 text-sm text-gray-400 text-center">
          Первая коллекция фирменного мерча QHub.kz
        </p>
      </section>

      {/* Footer spacing */}
      <div className="mt-auto py-10 flex justify-center">
        <Link
          href="/"
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Вернуться на главную
        </Link>
      </div>
    </div>
  );
}
