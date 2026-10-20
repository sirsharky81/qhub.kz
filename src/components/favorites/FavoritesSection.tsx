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
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
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
    transition: isDragging ? transition : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`relative ${APP_CARD_HEIGHT}`}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 shadow-sm"
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

function TouchFavoriteCard({
  app,
  index,
  total,
  onMoveUp,
  onMoveDown,
}: {
  app: App;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className={`relative ${APP_CARD_HEIGHT}`}>
      {total > 1 ? (
        <div className="absolute left-3 top-3 z-30 flex flex-col gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm disabled:opacity-30"
            aria-label="Выше в списке"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm disabled:opacity-30"
            aria-label="Ниже в списке"
          >
            ↓
          </button>
        </div>
      ) : null}
      <AppCard app={app} showPin />
    </div>
  );
}

function FavoritesHeader({ touchUi }: { touchUi: boolean }) {
  return (
    <div className="mb-8">
      <p className="text-xs uppercase tracking-widest text-gray-900 mb-3 font-mono flex items-center gap-1.5">
        <span className="text-gray-900">★</span> Избранное
      </p>
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
        Ваши основные инструменты
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        {touchUi
          ? "Кнопки ↑↓ слева меняют порядок. Свайп по странице — только вертикально."
          : "Перетащите за значок ⋮⋮ слева, чтобы изменить порядок."}
      </p>
    </div>
  );
}

function DesktopDndFavorites({
  pinnedApps,
  pinnedIds,
  reorderPinned,
}: {
  pinnedApps: App[];
  pinnedIds: string[];
  reorderPinned: (from: number, to: number) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 14 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 320, tolerance: 12 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeApp = pinnedApps.find((a) => a.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={false}
      onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
      onDragEnd={(event: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = pinnedIds.indexOf(String(active.id));
        const newIndex = pinnedIds.indexOf(String(over.id));
        if (oldIndex >= 0 && newIndex >= 0) reorderPinned(oldIndex, newIndex);
      }}
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
  );
}

export function FavoritesSection() {
  const { pinnedApps, pinnedIds, hydrated, reorderPinned } = useFavorites();
  const coarsePointer = useCoarsePointer();

  if (!hydrated || pinnedApps.length === 0) return null;

  return (
    <section id="favorites" className="py-12 px-4 sm:px-6 max-w-6xl mx-auto w-full">
      <FavoritesHeader touchUi={coarsePointer} />
      {coarsePointer ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
          {pinnedApps.map((app, index) => (
            <TouchFavoriteCard
              key={app.id}
              app={app}
              index={index}
              total={pinnedApps.length}
              onMoveUp={() => reorderPinned(index, index - 1)}
              onMoveDown={() => reorderPinned(index, index + 1)}
            />
          ))}
        </div>
      ) : (
        <DesktopDndFavorites
          pinnedApps={pinnedApps}
          pinnedIds={pinnedIds}
          reorderPinned={reorderPinned}
        />
      )}
    </section>
  );
}
