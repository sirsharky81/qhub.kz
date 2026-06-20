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
    id: "random-picker",
    name: "QHub Random Picker",
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
      "Подготовка музыки для фигурного катания, танцев и выступлений — обрезка, склейка, fade и экспорт.",
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
