"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PageOrientation, ScanPage } from "@/lib/document-scanner/types";
import { renderPageThumbnail } from "@/lib/document-scanner/a4-layout";
import { getPageAspectClass, resolveOrientation } from "@/lib/document-scanner/page-size";
import {
  btnOutline,
  btnPrimary,
  btnSecondary,
  IconChevronLeft,
  IconLayers,
  IconPageAdd,
  IconPrint,
  IconSave,
  IconTextRecognize,
} from "./ScannerIcons";

interface Props {
  pages: ScanPage[];
  activePageId: string | null;
  onSelectPage: (id: string) => void;
  onReorder: (pages: ScanPage[]) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onEdit: (id: string) => void;
  onSetOrientation: (id: string, orientation: PageOrientation) => void;
  onAddPage: () => void;
  onAddToPage: () => void;
  onExport: () => void;
  onOcrExport: () => void;
  ocrExporting?: boolean;
  onPrint: () => void;
  printing?: boolean;
  onBack: () => void;
}

function computeMenuPosition(
  anchor: DOMRect,
  menuW: number,
  menuH: number,
): { top: number; left: number } {
  const pad = 8;
  let left = anchor.right - menuW;
  let top = anchor.bottom + 4;

  if (left < pad) left = pad;
  if (left + menuW > window.innerWidth - pad) left = window.innerWidth - menuW - pad;
  if (top + menuH > window.innerHeight - pad) top = anchor.top - menuH - 4;
  if (top < pad) top = pad;

  return { top, left };
}

function SortableThumb({
  page,
  thumb,
  isActive,
  onSelect,
  onDuplicate,
  onDelete,
  onRename,
  onEdit,
  onSetOrientation,
}: {
  page: ScanPage;
  thumb?: string;
  isActive: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onEdit: () => void;
  onSetOrientation: (orientation: PageOrientation) => void;
}) {
  const pageOrientation = resolveOrientation(page);
  const aspectClass = getPageAspectClass(pageOrientation);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(page.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useLayoutEffect(() => {
    if (!menuOpen || !menuBtnRef.current) {
      setMenuPos(null);
      return;
    }

    function updatePosition() {
      const btn = menuBtnRef.current;
      const menu = menuRef.current;
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const menuW = menu?.offsetWidth ?? 160;
      const menuH = menu?.offsetHeight ?? 200;
      setMenuPos(computeMenuPosition(rect, menuW, menuH));
    }

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (menuBtnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0 relative">
      <button
        type="button"
        onClick={onSelect}
        className={`block w-24 rounded-xl overflow-hidden border-2 transition-colors bg-white ${
          isActive
            ? "border-gray-900 shadow-md ring-2 ring-gray-900/10"
            : "border-gray-200 hover:border-gray-400"
        }`}
        {...attributes}
        {...listeners}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={page.name} className={`w-full ${aspectClass} object-cover bg-white`} />
        ) : (
          <div
            className={`w-full ${aspectClass} bg-gray-100 animate-pulse`}
            aria-hidden
          />
        )}
        <p className="text-[10px] font-medium text-gray-700 dark:text-gray-300 px-1 py-1 truncate">
          {page.name}
        </p>
      </button>

      <button
        ref={menuBtnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!menuOpen && menuBtnRef.current) {
            const rect = menuBtnRef.current.getBoundingClientRect();
            setMenuPos(computeMenuPosition(rect, 160, 200));
          }
          setMenuOpen((open) => !open);
        }}
        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center z-10"
        aria-label="Меню страницы"
        aria-expanded={menuOpen}
      >
        ⋮
      </button>

      {menuOpen &&
        menuPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[160px] text-xs"
            style={{ top: menuPos.top, left: menuPos.left }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => {
                setRenaming(true);
                setMenuOpen(false);
              }}
            >
              Переименовать
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => {
                onEdit();
                setMenuOpen(false);
              }}
            >
              Редактировать
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => {
                onSetOrientation(pageOrientation === "landscape" ? "portrait" : "landscape");
                setMenuOpen(false);
              }}
            >
              {pageOrientation === "landscape" ? "Книжная ориентация" : "Альбомная ориентация"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => {
                onDuplicate();
                setMenuOpen(false);
              }}
            >
              Дублировать
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => {
                onDelete();
                setMenuOpen(false);
              }}
            >
              Удалить
            </button>
          </div>,
          document.body,
        )}

      {renaming && (
        <div className="absolute inset-0 z-30 bg-white/95 dark:bg-gray-900/95 rounded-xl p-2 flex flex-col justify-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xs border rounded px-2 py-1 mb-1 dark:bg-gray-800 dark:border-gray-700"
            autoFocus
          />
          <button
            type="button"
            className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded py-1"
            onClick={() => {
              onRename(name);
              setRenaming(false);
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}

export default function PagesView({
  pages,
  activePageId,
  onSelectPage,
  onReorder,
  onDuplicate,
  onDelete,
  onRename,
  onEdit,
  onSetOrientation,
  onAddPage,
  onAddToPage,
  onExport,
  onOcrExport,
  ocrExporting = false,
  onPrint,
  printing = false,
  onBack,
}: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const page of pages) {
        next[page.id] = await renderPageThumbnail(page);
      }
      if (!cancelled) setThumbs(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [pages]);

  const activePage = pages.find((p) => p.id === activePageId) ?? pages[0];

  useEffect(() => {
    if (activePage && thumbs[activePage.id]) {
      setPreviewUrl(thumbs[activePage.id]!);
    }
  }, [activePage, thumbs]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex((p) => p.id === active.id);
    const newIndex = pages.findIndex((p) => p.id === over.id);
    onReorder(arrayMove(pages, oldIndex, newIndex));
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onBack} className={btnOutline("px-2.5 py-1.5 text-xs")}>
            <IconChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Назад</span>
          </button>
          <button
            type="button"
            onClick={onAddPage}
            className={btnSecondary("px-2 py-1.5 text-xs")}
            title="Добавить страницу"
          >
            <IconPageAdd className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Страница</span>
          </button>
          <button
            type="button"
            onClick={onAddToPage}
            className={btnOutline("px-2 py-1.5 text-xs")}
            title="Добавить на текущую страницу"
          >
            <IconLayers className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">На текущую</span>
          </button>
        </div>

        <h2 className="flex-1 text-center text-xs sm:text-sm font-semibold text-gray-900 truncate px-1">
          {pages.length} {pages.length === 1 ? "страница" : "страниц"}
        </h2>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOcrExport}
            disabled={ocrExporting || printing}
            className={btnOutline("px-2 py-1.5 text-xs")}
            title="Распознать текст и сохранить в Word"
          >
            <IconTextRecognize className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">В Word</span>
          </button>
          <button
            type="button"
            onClick={onPrint}
            disabled={printing || ocrExporting}
            className={btnOutline("px-2 py-1.5 text-xs")}
            title="Печать A4"
          >
            <IconPrint className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Печать</span>
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={ocrExporting}
            className={btnPrimary("px-2 py-1.5 text-xs")}
          >
            <IconSave className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Сохранить</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 min-h-0 bg-gray-50">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Предпросмотр"
            className="max-h-full max-w-full object-contain rounded-xl shadow-sm border border-gray-200 bg-white"
          />
        ) : (
          <div className="text-gray-400 text-sm">Загрузка…</div>
        )}
      </div>

      <div className="border-t border-gray-200 px-4 py-3 bg-white">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pages.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {pages.map((page) => (
                <SortableThumb
                  key={page.id}
                  page={page}
                  thumb={thumbs[page.id]}
                  isActive={page.id === activePage?.id}
                  onSelect={() => onSelectPage(page.id)}
                  onDuplicate={() => onDuplicate(page.id)}
                  onDelete={() => onDelete(page.id)}
                  onRename={(name) => onRename(page.id, name)}
                  onEdit={() => onEdit(page.id)}
                  onSetOrientation={(orientation) => onSetOrientation(page.id, orientation)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
