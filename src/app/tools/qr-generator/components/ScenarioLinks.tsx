"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { QrType } from "@/lib/qr-generator/types";
import { typeLabel, useQrTranslations } from "@/lib/qr-generator/i18n";

const SCENARIO_PAGES: { type: QrType; href: string }[] = [
  { type: "wifi", href: "/tools/qr-generator/wifi" },
  { type: "payment", href: "/tools/qr-generator/payment" },
  { type: "vcard", href: "/tools/qr-generator/vcard" },
  { type: "whatsapp", href: "/tools/qr-generator/whatsapp" },
  { type: "telegram", href: "/tools/qr-generator/telegram" },
  { type: "geo", href: "/tools/qr-generator/geo" },
  { type: "event", href: "/tools/qr-generator/event" },
];

export function ScenarioLinks() {
  const { t } = useQrTranslations();
  const pathname = usePathname();

  return (
    <nav aria-label={t("seoScenarios")} className="flex flex-wrap gap-1.5">
      {SCENARIO_PAGES.map(({ type, href }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors touch-manipulation ${
              active
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
            }`}
          >
            {typeLabel(type, t)}
          </Link>
        );
      })}
    </nav>
  );
}
