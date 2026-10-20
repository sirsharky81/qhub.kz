"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import { useFavorites } from "@/contexts/FavoritesContext";
import { APP_CARD_HEIGHT, AppCard } from "@/components/home/AppCard";
import type { App } from "@/data/apps";

function SortableFavoriteCard({ app }: { app: App }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: app.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative ${APP_CARD_HEIGHT} touch-pan-y`}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white/95 text-gray-400 shadow-sm touch-manipulation active:bg-gray-50"
        aria-label={`Перетащить «${app.title}»`}
        {...attributes}
        {...listeners}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="5" cy="4" r="1.25" />
          <circle cx="11" cy="4" r="1.25" />
          <circle cx="5" cy="8" r="1.25" />
          <circle cx="11" cy="8" r="1.25" />
          <circle cx="5" cy="12" r="1.25" />
          <circle cx="11" cy="12" r="1.25" />
        </svg>
      </button>
      <AppCard app={app} showPin draggable />
    </div>
  );
}

export function FavoritesSection() {
  const { pinnedApps, pinnedIds, reorderPinned } = useFavorites();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 14 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 320, tolerance: 12 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!mounted) {
    return <section id="favorites" className="py-12 px-4 sm:px-6 max-w-6xl mx-auto w-full min-h-[8rem]" aria-hidden />;
  }

  if (pinnedApps.length === 0) return null;

  const activeApp = pinnedApps.find((a) => a.id === activeId);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pinnedIds.indexOf(String(active.id));
    const newIndex = pinnedIds.indexOf(String(over.id));
    if (oldIndex >= 0 && newIndex >= 0) {
      reorderPinned(oldIndex, newIndex);
    }
  };

  return (
    <section id="favorites" className="py-12 px-4 sm:px-6 max-w-6xl mx-auto w-full">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-gray-900 mb-3 font-mono flex items-center gap-1.5">
          <span className="text-gray-900">★</span> Избранное
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Ваши основные инструменты
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Удерживайте значок ⋮⋮ слева и перетащите карточку, чтобы изменить порядок
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        autoScroll={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={pinnedIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 touch-pan-y sm:grid-cols-2 gap-4 items-stretch">
            {pinnedApps.map((app) => (
              <SortableFavoriteCard key={app.id} app={app} />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeApp ? (
            <div className="opacity-90 rotate-1 scale-105 touch-none">
              <AppCard app={activeApp} showPin />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
