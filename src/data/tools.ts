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
