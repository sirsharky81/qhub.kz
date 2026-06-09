"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PdfPage } from "../types";
import { PageCard } from "./PageCard";

interface SortablePageCardProps {
  page: PdfPage;
  displayNumber: number;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onRequestThumbnail: (id: string) => void;
}

function SortablePageCard({
  page,
  displayNumber,
  onSelect,
  onRequestThumbnail,
}: SortablePageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PageCard
        page={page}
        displayNumber={displayNumber}
        onSelect={onSelect}
        onRequestThumbnail={onRequestThumbnail}
        isVisible
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

export function PageGrid({
  pages,
  onReorder,
  onSelect,
  onRequestThumbnail,
  columns,
}: PageGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(pages.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: 2,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div ref={parentRef} className="flex-1 overflow-y-auto px-4 pb-24 sm:pb-4">
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
                  className={`grid gap-3`}
                  data-columns={columns}
                  ref={(el) => {
                    if (el) {
                      el.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
                    }
                  }}
                >
                  {rowPages.map((page, colIdx) => (
                    <SortablePageCard
                      key={page.id}
                      page={page}
                      displayNumber={startIdx + colIdx + 1}
                      onSelect={onSelect}
                      onRequestThumbnail={onRequestThumbnail}
                    />
                  ))}
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
