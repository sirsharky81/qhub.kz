export type ToolCategory = "documents" | "images" | "audio" | "utilities";

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: ToolCategory;
  href: string;
  isNew?: boolean;
}

export const tools: Tool[] = [
  {
    id: "obd-diag",
    name: "Subaru Diagnostics",
    description:
      "vLinker BLE: диагностика Subaru (SSM4 — 40 систем, ошибки, Data Monitor, калибровки .srp), OBD2 Live и CAN/UDS.",
    icon: "Gauge",
    category: "utilities",
    href: "/tools/obd-diag",
    isNew: true,
  },
  {
    id: "subaru-coding",
    name: "Subaru Coding & Immobilizer",
    description:
      "Перевод приборной панели Subaru (°F → °C, 12-колоночный код) и иммобилайзер F2: чтение ключей, прописка ключей и RES.",
    icon: "KeyRound",
    category: "utilities",
    href: "/tools/subaru-coding",
    isNew: true,
  },
  {
    id: "mitsubishi-diag",
    name: "Mitsubishi Diagnostics",
    description:
      "vLinker BLE: диагностика Mitsubishi (MUT-III блоки, ошибки, угол руля SAS, TPMS), OBD2 Live и выгрузка/запись Mitsubishi ETACS (.kon / .cuf).",
    icon: "Gauge",
    category: "utilities",
    href: "/tools/mitsubishi-diag",
    isNew: true,
  },
  {
    id: "etacs-coding",
    name: "ETACS Coding",
    description:
      "Редактор и сравнение .kon / .cuf Mitsubishi ETACS по серверному справочнику MUT (после выгрузки с блока или из MMCodingWriter).",
    icon: "Settings2",
    category: "utilities",
    href: "/tools/etacs-coding",
    isNew: true,
  },
  {
    id: "random-picker",
    name: "Генератор случайных чисел",
    description:
      "Случайный выбор участников, жеребьёвка, колесо, группы и генератор чисел — локально в браузере.",
    icon: "Dices",
    category: "utilities",
    href: "/tools/random-picker",
    isNew: true,
  },
  {
    id: "file-converter",
    name: "QHub Smart File Converter",
    description:
      "Умный конвертер файлов: изображения, видео, аудио, PDF, таблицы — всё локально в браузере.",
    icon: "RefreshCw",
    category: "utilities",
    href: "/tools/file-converter",
    isNew: true,
  },
  {
    id: "music-editor",
    name: "Music Editor",
    description:
      "Подготовка музыки для фигурного катания, танцев и выступлений — обрезка, скорость, эквалайзер, склейка, fade и экспорт.",
    icon: "Music",
    category: "audio",
    href: "/tools/music-editor",
    isNew: true,
  },
  {
    id: "audio-extractor",
    name: "Audio Extractor",
    description:
      "Извлечение аудиодорожки из YouTube — waveform и MP3/WAV.",
    icon: "Mic",
    category: "audio",
    href: "/tools/audio-extractor",
    isNew: true,
  },
  {
    id: "code-scanner",
    name: "Code Scanner",
    description:
      "Распознавание QR и штрих-кодов. Инвентаризация ОС по базе 1С — отчёты по излишкам и недостачам — локально в браузере.",
    icon: "ScanLine",
    category: "utilities",
    href: "/tools/code-scanner",
    isNew: true,
  },
  {
    id: "document-scanner",
    name: "Document Scanner",
    description:
      "Сканируйте документы с камеры или файла. Автообрезка, OCR в Word (русский, казахский, English) и многостраничный PDF — локально в браузере.",
    icon: "Scan",
    category: "documents",
    href: "/tools/document-scanner",
    isNew: true,
  },
  {
    id: "pdf-pages",
    name: "PDF Pages",
    description:
      "Удаляйте, переставляйте, поворачивайте, объединяйте и разделяйте PDF прямо в браузере.",
    icon: "FileText",
    category: "documents",
    href: "/tools/pdf-pages",
    isNew: true,
  },
];

export const documentTools = tools.filter((t) => t.category === "documents");
