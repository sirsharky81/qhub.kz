"use client";

import Link from "next/link";
import { IconSettings } from "@/components/PlatformIcons";

const baseClass =
  "flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-100 touch-manipulation";

interface ButtonProps {
  onClick: () => void;
  active?: boolean;
}

export function SettingsHeaderButton({ onClick, active = false }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Настройки"
      aria-expanded={active}
      title="Настройки"
      className={
        active
          ? "flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors bg-gray-900 text-white shadow-sm touch-manipulation"
          : baseClass
      }
    >
      <IconSettings />
    </button>
  );
}

export function SettingsHeaderLink({ href }: { href: string }) {
  return (
    <Link href={href} className={baseClass} aria-label="Настройки" title="Настройки">
      <IconSettings />
    </Link>
  );
}
