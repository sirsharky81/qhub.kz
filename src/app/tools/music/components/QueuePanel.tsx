"use client";

import { useCallback, useRef, useState } from "react";
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SwipeableRow } from "@/components/music/SwipeableRow";
import { TrackArtwork } from "@/components/music/TrackArtwork";
import { NameInputDialog } from "@/components/music/NameInputDialog";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import type { Track } from "@/lib/music/types";
import { formatTime } from "@/lib/music/types";

interface QueuePanelProps {
  onNavigate?: (tab: "library" | "playlists") => void;
}

function DragHandleIcon() {
  return (
    <span className="text-gray-400 text-sm leading-none select-none" aria-hidden>
      ≡
    </span>
  );
}

interface QueueRowProps {
  index: number;
  track: Track;
  isActive: boolean;
  unavailable: boolean;
  onPlay: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
}

function QueueRowContent({
  index,
  track,
  isActive,
  unavailable,
  onPlay,
  dragHandleProps,
  isDragging,
}: QueueRowProps) {
  const rowBg = isActive ? "bg-gray-100 dark:bg-gray-800" : "bg-white dark:bg-gray-900";

  return (
    <div
      className={`group flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors ${rowBg} ${
        unavailable ? "opacity-50" : ""
      } ${isDragging ? "shadow-md ring-1 ring-violet-200 dark:ring-violet-800" : ""}`}
    >
      <span className="text-[9px] text-gray-400 font-mono w-4 text-center shrink-0">
        {isActive ? "▶" : index + 1}
      </span>

      <button
        type="button"
        onClick={onPlay}
        className="flex items-center gap-2 flex-1 min-w-0 min-h-[32px] text-left"
      >
        <TrackArtwork coverArtUrl={track.coverArtUrl} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-gray-900 dark:text-gray-100 truncate leading-tight flex items-center gap-1">
            {unavailable ? (
              <>
                <span className="text-amber-500 shrink-0" title="Файл недоступен">
                  ⚠
                </span>
                <span className="truncate">{track.title}</span>
              </>
            ) : (
              track.title
            )}
          </p>
          <p className="text-[10px] text-gray-400 truncate">
            {unavailable ? "Файл недоступен" : track.artist}
          </p>
        </div>
      </button>

      <span className="text-[9px] text-gray-400 font-mono tabular-nums shrink-0 pointer-events-none">
        {formatTime(track.duration)}
      </span>

      {dragHandleProps ? (
        <button
          type="button"
          className="flex items-center justify-center w-8 h-8 shrink-0 rounded cursor-grab active:cursor-grabbing touch-none text-gray-400 hover:text-gray-600 hover:bg-gray-100/80 dark:hover:bg-gray-800"
          aria-label="Перетащить"
          {...dragHandleProps}
        >
          <DragHandleIcon />
        </button>
      ) : null}
    </div>
  );
}

function SortableQueueRow({
  id,
  index,
  track,
  isActive,
  unavailable,
  onPlay,
  onRemove,
}: {
  id: string;
  index: number;
  track: Track;
  isActive: boolean;
  unavailable: boolean;
  onPlay: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  const row = (
    <QueueRowContent
      index={index}
      track={track}
      isActive={isActive}
      unavailable={unavailable}
      onPlay={onPlay}
      isDragging={isDragging}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );

  return (
    <div ref={setNodeRef} style={style}>
      <SwipeableRow
        enabled={!isDragging}
        contentClassName="bg-transparent"
        actions={[
          {
            id: "remove",
            label: "Удалить",
            className: "bg-red-600 text-white",
            confirm: false,
            onAction: onRemove,
          },
        ]}
      >
        {row}
      </SwipeableRow>
    </div>
  );
}

function QueueEmptyState({ onNavigate }: { onNavigate?: (tab: "library" | "playlists") => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Очередь пуста</p>
      <p className="text-[11px] text-gray-400 mt-1 mb-4">Добавьте музыку из медиатеки или плейлистов</p>
      <div className="flex flex-col gap-2 w-full max-w-[200px]">
        <button
          type="button"
          onClick={() => onNavigate?.("library")}
          className="px-3 py-2 rounded-lg text-[11px] font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900"
        >
          Открыть медиатеку
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.("playlists")}
          className="px-3 py-2 rounded-lg text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
        >
          Открыть плейлисты
        </button>
      </div>
    </div>
  );
}

export function QueuePanel({ onNavigate }: QueuePanelProps) {
  const {
    queue,
    queueIndex,
    tracks,
    playTrack,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    shuffleQueue,
    saveQueueAsPlaylist,
    isTrackUnavailable,
    showToast,
  } = useMusicPlayer();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  const resolveTrack = useCallback(
    (id: string): Track => {
      const track = trackMap.get(id);
      if (track) return track;
      return {
        id,
        title: "Неизвестный трек",
        artist: "—",
        album: "",
        genre: "",
        duration: 0,
        coverArtUrl: null,
        fileName: "",
        mimeType: "",
        addedAt: 0,
        hasBlob: false,
        hasHandle: false,
      };
    },
    [trackMap],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = queue.indexOf(String(active.id));
    const toIndex = queue.indexOf(String(over.id));
    if (fromIndex >= 0 && toIndex >= 0) {
      reorderQueue(fromIndex, toIndex);
    }
  };

  const handleDragCancel = () => setActiveId(null);

  const handlePlay = (id: string) => {
    if (isTrackUnavailable(id) || !trackMap.has(id)) {
      showToast("Файл недоступен. Возможно был удалён или перемещён.");
      return;
    }
    void playTrack(id);
  };

  const activeTrack = activeId ? resolveTrack(activeId) : null;
  const activeIndex = activeId ? queue.indexOf(activeId) : -1;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-2 py-1.5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Очередь
          </h3>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 font-mono">{queue.length}</span>
            {queue.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                  aria-label="Меню очереди"
                >
                  ⋯
                </button>
                {menuOpen ? (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg py-1">
                      <button
                        type="button"
                        onClick={() => {
                          clearQueue();
                          setMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-[11px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Очистить очередь
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          shuffleQueue();
                          setMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-[11px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Перемешать очередь
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSaveDialogOpen(true);
                          setMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-[11px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Сохранить как плейлист
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto py-0.5 touch-pan-y">
        {queue.length === 0 ? (
          <QueueEmptyState onNavigate={onNavigate} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            autoScroll={{ threshold: { x: 0, y: 0.15 }, acceleration: 8 }}
          >
            <SortableContext items={queue} strategy={verticalListSortingStrategy}>
              {queue.map((id, index) => {
                const track = resolveTrack(id);
                const unavailable = isTrackUnavailable(id) || !trackMap.has(id);
                return (
                  <SortableQueueRow
                    key={id}
                    id={id}
                    index={index}
                    track={track}
                    isActive={index === queueIndex}
                    unavailable={unavailable}
                    onPlay={() => handlePlay(id)}
                    onRemove={() => removeFromQueue(id)}
                  />
                );
              })}
            </SortableContext>

            <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1)" }}>
              {activeTrack && activeIndex >= 0 ? (
                <QueueRowContent
                  index={activeIndex}
                  track={activeTrack}
                  isActive={activeIndex === queueIndex}
                  unavailable={isTrackUnavailable(activeTrack.id) || !trackMap.has(activeTrack.id)}
                  onPlay={() => {}}
                  isDragging
                  dragHandleProps={{}}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <NameInputDialog
        open={saveDialogOpen}
        title="Название плейлиста"
        placeholder="Название плейлиста"
        confirmLabel="Сохранить"
        onCancel={() => setSaveDialogOpen(false)}
        onConfirm={async (name) => {
          await saveQueueAsPlaylist(name);
          setSaveDialogOpen(false);
        }}
      />
    </div>
  );
}
