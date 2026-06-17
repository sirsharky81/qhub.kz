"use client";

import { useState } from "react";
import type { QrFormData, QrHistoryEntry } from "@/lib/qr-generator/types";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { PickerButton } from "../../random-picker/components/PickerButton";

interface HistoryPanelProps {
  entries: QrHistoryEntry[];
  onLoad: (entry: QrHistoryEntry) => void;
  onClear: () => void;
}

export function HistoryPanel({ entries, onLoad, onClear }: HistoryPanelProps) {
  const { t } = useQrTranslations();

  if (entries.length === 0) {
    return <p className="text-xs text-gray-500">{t("noHistory")}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <PickerButton variant="ghost" onClick={onClear}>
          {t("clearHistory")}
        </PickerButton>
      </div>
      <ul className="space-y-1.5 max-h-40 overflow-y-auto">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onLoad(entry)}
              className="w-full text-left px-3 py-2 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 text-xs"
            >
              <span className="font-medium text-gray-800">{entry.label}</span>
              <span className="text-gray-400 ml-2">{entry.type}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TemplatesPanelProps {
  templates: { id: string; name: string; type: QrFormData["type"] }[];
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: (name: string) => void;
}

export function TemplatesPanel({ templates, onLoad, onDelete, onSave }: TemplatesPanelProps) {
  const { t } = useQrTranslations();
  const [name, setName] = useState("");

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
          placeholder={t("templateName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <PickerButton
          variant="secondary"
          disabled={!name.trim()}
          onClick={() => {
            onSave(name.trim());
            setName("");
          }}
        >
          {t("saveTemplate")}
        </PickerButton>
      </div>

      {templates.length === 0 ? (
        <p className="text-xs text-gray-500">{t("noTemplates")}</p>
      ) : (
        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
          {templates.map((tpl) => (
            <li
              key={tpl.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 text-xs"
            >
              <button
                type="button"
                className="flex-1 text-left font-medium text-gray-800 hover:underline"
                onClick={() => onLoad(tpl.id)}
              >
                {tpl.name}
              </button>
              <PickerButton variant="ghost" onClick={() => onDelete(tpl.id)}>
                {t("delete")}
              </PickerButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
