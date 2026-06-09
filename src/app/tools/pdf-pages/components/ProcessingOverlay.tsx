"use client";

import { useTranslations } from "next-intl";

interface ProcessingOverlayProps {
  visible: boolean;
  message?: string;
}

export function ProcessingOverlay({ visible, message }: ProcessingOverlayProps) {
  const t = useTranslations("processing");

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex flex-col items-center gap-4 max-w-xs mx-4">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
        <p className="text-sm font-medium text-gray-800 text-center">
          {message ?? t("default")}
        </p>
      </div>
    </div>
  );
}
