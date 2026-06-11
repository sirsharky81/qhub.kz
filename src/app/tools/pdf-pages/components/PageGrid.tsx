"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PdfPage } from "../types";
import { PageCard } from "./PageCard";

interface SortablePageCardProps {
  page: PdfPage;
  displayNumber: number;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onRotate: (id: string) => void;
  onRequestThumbnail: (id: string) => void;
}

function SortablePageCard({
  page,
  displayNumber,
  scrollRoot,
  onSelect,
  onRotate,
  onRequestThumbnail,
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
      { root, rootMargin: "120px", threshold: 0 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRoot, page.id]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setRefs}
      style={style}
      className="touch-manipulation cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <PageCard
        page={page}
        displayNumber={displayNumber}
        onSelect={onSelect}
        onRotate={onRotate}
        onRequestThumbnail={onRequestThumbnail}
        isVisible={isVisible}
      />
    </div>
  );
}

interface PageGridProps {
  pages: PdfPage[];
  onReorder: (pages: PdfPage[]) => void;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onRotate: (id: string) => void;
  onRequestThumbnail: (id: string) => void;
  columns: number;
  reorderHint: string;
}

export function PageGrid({
  pages,
  onReorder,
  onSelect,
  onRotate,
  onRequestThumbnail,
  columns,
  reorderHint,
}: PageGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activePage = activeId ? pages.find((p) => p.id === activeId) : null;
  const activeDisplayNumber = activePage
    ? pages.findIndex((p) => p.id === activeId) + 1
    : 0;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;

      const oldIndex = pages.findIndex((p) => p.id === active.id);
      const newIndex = pages.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      onReorder(arrayMove(pages, oldIndex, newIndex));
    },
    [onReorder, pages],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-gray-50/80">
        <p className="text-xs text-gray-500 text-center sm:text-left">{reorderHint}</p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div
            ref={parentRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 pb-28 sm:pb-4"
          >
            <div
              className="grid gap-3 sm:gap-4 py-3 items-start"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {pages.map((page, pageIndex) => (
                <SortablePageCard
                  key={page.id}
                  page={page}
                  displayNumber={pageIndex + 1}
                  scrollRoot={parentRef}
                  onSelect={onSelect}
                  onRotate={onRotate}
                  onRequestThumbnail={onRequestThumbnail}
                />
              ))}
            </div>
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
          {activePage ? (
            <PageCard
              page={activePage}
              displayNumber={activeDisplayNumber}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export function useGridColumns(): number {
  const [columns, setColumns] = useState(6);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setColumns(2);
      else if (w < 1280) setColumns(4);
      else setColumns(6);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return columns;
}
