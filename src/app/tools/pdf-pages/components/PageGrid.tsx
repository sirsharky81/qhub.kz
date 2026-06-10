"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PdfPage } from "../types";
import { PageCard } from "./PageCard";

const ACTIVATION_CONSTRAINT = { delay: 200, tolerance: 5 } as const;

interface SortablePageCardProps {
  page: PdfPage;
  displayNumber: number;
  pageIndex: number;
  totalPages: number;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onRequestThumbnail: (id: string) => void;
  showMoveButtons: boolean;
  onMovePage: (pageId: string, direction: "up" | "down") => void;
}

function SortablePageCard({
  page,
  displayNumber,
  pageIndex,
  totalPages,
  scrollRoot,
  onSelect,
  onRequestThumbnail,
  showMoveButtons,
  onMovePage,
}: SortablePageCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      cardRef.current = node;
    },
    [setNodeRef],
  );

  useEffect(() => {
    const element = cardRef.current;
    const root = scrollRoot.current;
    if (!element || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
        }
      },
      { root, rootMargin: "200px", threshold: 0 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRoot]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setRefs} style={style} className="relative">
      <button
        type="button"
        className="absolute z-20 flex items-center justify-center w-7 h-7 rounded-md bg-white/90 border border-gray-200 text-gray-500 shadow-sm cursor-grab active:cursor-grabbing touch-none bottom-8 left-1.5 sm:bottom-auto sm:left-auto sm:top-1.5 sm:right-1.5"
        style={{ touchAction: "none" }}
        aria-label={`Drag page ${displayNumber}`}
        {...attributes}
        {...listeners}
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M7 4a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 9a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 14a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2z" />
        </svg>
      </button>

      <PageCard
        page={page}
        displayNumber={displayNumber}
        onSelect={onSelect}
        onRequestThumbnail={onRequestThumbnail}
        isVisible={isVisible}
        showMoveButtons={showMoveButtons}
        canMoveUp={pageIndex > 0}
        canMoveDown={pageIndex < totalPages - 1}
        onMoveUp={() => onMovePage(page.id, "up")}
        onMoveDown={() => onMovePage(page.id, "down")}
      />
    </div>
  );
}

interface PageGridProps {
  pages: PdfPage[];
  onReorder: (pages: PdfPage[]) => void;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onRequestThumbnail: (id: string) => void;
  columns: number;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function PageGrid({
  pages,
  onReorder,
  onSelect,
  onRequestThumbnail,
  columns,
}: PageGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(pages.length / columns);
  const isMobile = useIsMobile();

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: 2,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: ACTIVATION_CONSTRAINT }),
    useSensor(TouchSensor, { activationConstraint: ACTIVATION_CONSTRAINT }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = pages.findIndex((p) => p.id === active.id);
      const newIndex = pages.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      onReorder(arrayMove(pages, oldIndex, newIndex));
    },
    [onReorder, pages],
  );

  const handleMovePage = useCallback(
    (pageId: string, direction: "up" | "down") => {
      const index = pages.findIndex((p) => p.id === pageId);
      if (index === -1) return;

      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= pages.length) return;

      onReorder(arrayMove(pages, index, newIndex));
    },
    [onReorder, pages],
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div
          ref={parentRef}
          className="flex-1 overflow-y-auto px-4 pb-24 sm:pb-4"
          style={{ touchAction: "pan-y" }}
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const startIdx = virtualRow.index * columns;
              const rowPages = pages.slice(startIdx, startIdx + columns);

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="grid gap-3"
                  data-columns={columns}
                  ref={(el) => {
                    if (el) {
                      el.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
                    }
                  }}
                >
                  {rowPages.map((page, colIdx) => {
                    const pageIndex = startIdx + colIdx;
                    return (
                      <SortablePageCard
                        key={page.id}
                        page={page}
                        displayNumber={pageIndex + 1}
                        pageIndex={pageIndex}
                        totalPages={pages.length}
                        scrollRoot={parentRef}
                        onSelect={onSelect}
                        onRequestThumbnail={onRequestThumbnail}
                        showMoveButtons={isMobile}
                        onMovePage={handleMovePage}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}

export function useGridColumns(): number {
  const [columns, setColumns] = useState(5);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setColumns(2);
      else if (w < 1024) setColumns(4);
      else setColumns(6);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return columns;
}
