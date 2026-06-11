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
import { useState } from "react";
import { useFavorites } from "@/contexts/FavoritesContext";
import { APP_CARD_HEIGHT, AppCard } from "@/components/home/AppCard";
import type { App } from "@/data/apps";

function SortableFavoriteCard({ app }: { app: App }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: app.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={APP_CARD_HEIGHT}>
      <AppCard app={app} showPin draggable />
    </div>
  );
}

export function FavoritesSection() {
  const { pinnedApps, pinnedIds, reorderPinned } = useFavorites();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    <section
      id="favorites"
      className="py-12 px-4 sm:px-6 max-w-6xl mx-auto w-full transition-opacity duration-300"
    >
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-gray-900 dark:text-gray-100 mb-3 font-mono flex items-center gap-1.5">
          <span className="text-gray-900 dark:text-gray-100">★</span> Избранное
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Ваши основные инструменты
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Перетащите карточки, чтобы изменить порядок
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={pinnedIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
            {pinnedApps.map((app) => (
              <SortableFavoriteCard key={app.id} app={app} />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeApp ? (
            <div className="opacity-90 rotate-1 scale-105">
              <AppCard app={activeApp} showPin />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
