import Link from "next/link";
import Navbar from "@/components/Navbar";
import { HomePageExtras } from "@/components/home/HomePageExtras";
import { AppsGrid } from "@/components/home/AppsGrid";
import { sortedApps } from "@/data/apps";

const liveCount = sortedApps.filter((a) => !a.comingSoon).length;
const comingSoonCount = sortedApps.filter((a) => a.comingSoon).length;

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-900 pb-16">
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-32 pb-24 px-4 sm:px-6 flex flex-col items-center text-center bg-white bg-dot-grid">
        {/* Subtle top gradient fade */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(37,99,235,0.06) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-32"
          style={{ background: "linear-gradient(to bottom, transparent, #ffffff)" }}
        />

        {/* Badge */}
        <div className="relative mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 bg-white text-xs text-gray-500 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Первый казахский хаб полезных приложений
        </div>

        {/* Headline */}
        <h1 className="relative max-w-3xl text-4xl sm:text-5xl md:text-[3.5rem] font-bold tracking-tight leading-[1.1] mb-6 text-gray-900">
          Умные инструменты
          <br />
          <span className="gradient-text-accent">для жизни и работы</span>
        </h1>

        <p className="relative max-w-xl text-base sm:text-lg text-gray-500 mb-10 leading-relaxed">
          QHub.kz — платформа, где собраны действительно нужные приложения.
          Без лишнего шума, без рекламы. Сделано в Казахстане с душой —
          в стиле{" "}
          <span className="text-gray-800 font-medium">vibe coding</span>.
        </p>

        <div className="relative flex flex-col sm:flex-row gap-3">
          <Link
            href="/#apps"
            className="px-6 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm"
          >
            Смотреть приложения
          </Link>
          <Link
            href="/#submit"
            className="px-6 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 transition-all"
          >
            Добавить своё →
          </Link>
        </div>

        {/* Stats row */}
        <div className="relative mt-16 flex flex-wrap justify-center gap-8 sm:gap-16">
          {[
            { value: String(liveCount), label: liveCount === 1 ? "Запущенное приложение" : "Запущенных приложения" },
            { value: `${comingSoonCount}+`, label: "Скоро на платформе" },
            { value: "100%", label: "Бесплатно" },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">{s.value}</span>
              <span className="text-xs text-gray-400 text-center max-w-[120px]">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      <HomePageExtras />

      {/* ── APPS GRID ────────────────────────────────────────── */}
      <section id="apps" className="py-20 px-4 sm:px-6 max-w-6xl mx-auto w-full">
        <div className="mb-12">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-3 font-mono">
            Приложения
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            Всё, что нужно — в одном месте
          </h2>
          <p className="mt-3 text-gray-500 max-w-lg text-sm leading-relaxed">
            Каждое приложение решает реальную задачу. Никакой воды — только то,
            чем реально пользуются.
          </p>
        </div>

        <AppsGrid />
      </section>

      {/* ── ABOUT / VIBE CODING ─────────────────────────────── */}
      <section id="about" className="py-20 px-4 sm:px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400 mb-3 font-mono">
              О проекте
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-5 leading-snug text-gray-900">
              Сделано с умом.
              <br />
              <span className="gradient-text-accent">Vibe coded.</span>
            </h2>
            <div className="space-y-4 text-sm text-gray-500 leading-relaxed">
              <p>
                QHub.kz — это хаб, где собраны реально полезные инструменты для
                повседневной жизни, работы и бизнеса. Мы делаем то, что давно
                нужно было сделать в Казахстане — просто, быстро, без мусора.
              </p>
              <p>
                Наши приложения создаются в духе{" "}
                <span className="text-gray-800 font-medium">vibe coding</span> —
                это когда идея, дизайн и код рождаются вместе, быстро и с
                ощущением правильности. Никаких бесконечных согласований — только
                результат.
              </p>
              <p>
                И мы открыты для сообщества: если вы разработали полезное
                приложение и хотите разместить его на платформе — мы рассмотрим
                его.
              </p>
            </div>
          </div>

          {/* Feature pills */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "⚡", title: "Быстро", text: "Без регистрации, без загрузок" },
              { icon: "🇰🇿", title: "Для Казахстана", text: "Учитываем местные реалии" },
              { icon: "🆓", title: "Бесплатно", text: "Всегда и для всех" },
              { icon: "🔒", title: "Приватно", text: "Данные не покидают браузер" },
              { icon: "✨", title: "Vibe coded", text: "Сделано с душой и вкусом" },
              { icon: "🤝", title: "Open platform", text: "Принимаем чужие разработки" },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col gap-2"
              >
                <span className="text-xl">{f.icon}</span>
                <span className="text-sm font-semibold text-gray-900">{f.title}</span>
                <span className="text-xs text-gray-500 leading-relaxed">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SUBMIT CTA ───────────────────────────────────────── */}
      <section id="submit" className="py-20 px-4 sm:px-6 border-t border-gray-100">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative rounded-3xl border border-gray-200 bg-gray-50 px-8 py-14 overflow-hidden">
            {/* Accent glow */}
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
              Если вы создали что-то полезное в стиле vibe coding — мы рассмотрим
              размещение на QHub.kz. Платформа открыта для казахстанских
              разработчиков и энтузиастов.
            </p>
            <div className="relative flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="mailto:hello@qhub.kz"
                className="px-6 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors shadow-sm"
              >
                Написать нам
              </a>
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

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-gray-100 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gray-900 flex items-center justify-center">
              <span className="text-white font-bold text-xs leading-none">Q</span>
            </div>
            <span className="text-sm font-medium text-gray-500">
              QHub<span className="text-gray-300">.kz</span>
            </span>
          </div>
          <p className="text-xs text-gray-400 text-center">
            © {new Date().getFullYear()} QHub.kz — Первый казахский хаб полезных приложений.
            Сделано с ❤️ в Казахстане.
          </p>
          <div className="flex gap-4">
            <a
              href="mailto:hello@qhub.kz"
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              Контакты
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
