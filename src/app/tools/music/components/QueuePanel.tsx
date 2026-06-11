"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { HTMLAttributes } from "react";
import { SwipeableRow, type SwipeAction } from "@/components/music/SwipeableRow";
import { TrackArtwork } from "@/components/music/TrackArtwork";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import type { Track } from "@/lib/music/types";
import { formatTime } from "@/lib/music/types";

function DragHandle() {
  return (
    <svg
      className="w-2.5 h-3.5 text-gray-300 group-hover:text-gray-400"
      viewBox="0 0 10 16"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="2" cy="2" r="1.25" />
      <circle cx="8" cy="2" r="1.25" />
      <circle cx="2" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="2" cy="14" r="1.25" />
      <circle cx="8" cy="14" r="1.25" />
    </svg>
  );
}

interface QueueRowProps {
  index: number;
  track: Track;
  isActive: boolean;
  onPlay: () => void;
  onRemove: () => void;
  dragHandle?: HTMLAttributes<HTMLButtonElement>;
}

function QueueRowContent({ index, track, isActive, onPlay, onRemove, dragHandle }: QueueRowProps) {
  const rowBg = isActive ? "bg-gray-100" : "bg-white hover:bg-gray-50";

  return (
    <div className={`group flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors ${rowBg}`}>
      {dragHandle ? (
        <button
          type="button"
          className="flex items-center gap-1 shrink-0 py-1 px-0.5 -ml-0.5 rounded cursor-grab active:cursor-grabbing touch-none text-gray-400 hover:text-gray-500 hover:bg-gray-100/80"
          aria-label="Перетащить"
          {...dragHandle}
        >
          <DragHandle />
          <span className="text-[9px] font-mono w-3 text-center tabular-nums">
            {isActive ? "▶" : index + 1}
          </span>
        </button>
      ) : (
        <span className="text-[9px] text-gray-400 font-mono w-4 text-center shrink-0">
          {isActive ? "▶" : index + 1}
        </span>
      )}

      <button
        type="button"
        onClick={onPlay}
        className="flex items-center gap-2 flex-1 min-w-0 min-h-[32px] text-left"
      >
        <TrackArtwork coverArtUrl={track.coverArtUrl} />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-gray-900 truncate leading-tight">{track.title}</p>
          <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
        </div>
      </button>

      <span className="text-[9px] text-gray-400 font-mono tabular-nums shrink-0 pointer-events-none">
        {formatTime(track.duration)}
      </span>

      {dragHandle ? (
        <button
          type="button"
          onClick={onRemove}
          className="w-5 h-5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center text-[10px] shrink-0"
          aria-label="Убрать из очереди"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

function DesktopSortableRow({
  id,
  index,
  track,
  isActive,
  onPlay,
  onRemove,
}: {
  id: string;
  index: number;
  track: Track;
  isActive: boolean;
  onPlay: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <QueueRowContent
        index={index}
        track={track}
        isActive={isActive}
        onPlay={onPlay}
        onRemove={onRemove}
        dragHandle={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function TouchQueueRow({
  index,
  track,
  isActive,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  index: number;
  track: Track;
  isActive: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const swipeActions: SwipeAction[] = [
    ...(canMoveUp
      ? [
          {
            id: "up",
            label: "▲",
            className: "bg-gray-700 text-white",
            confirm: false,
            onAction: onMoveUp,
          },
        ]
      : []),
    ...(canMoveDown
      ? [
          {
            id: "down",
            label: "▼",
            className: "bg-gray-600 text-white",
            confirm: false,
            onAction: onMoveDown,
          },
        ]
      : []),
    {
      id: "remove",
      label: "✕",
      className: "bg-red-600 text-white",
      confirmTitle: `Убрать «${track.title}» из очереди?`,
      onAction: onRemove,
    },
  ];

  return (
    <SwipeableRow actions={swipeActions} contentClassName={isActive ? "bg-gray-100" : "bg-white"}>
      <QueueRowContent
        index={index}
        track={track}
        isActive={isActive}
        onPlay={onPlay}
        onRemove={onRemove}
      />
    </SwipeableRow>
  );
}

export function QueuePanel() {
  const isTouch = useCoarsePointer();
  const {
    queue,
    queueIndex,
    tracks,
    playTrack,
    removeFromQueue,
    reorderQueue,
    moveQueueItem,
  } = useMusicPlayer();

  const trackMap = new Map(tracks.map((t) => [t.id, t]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = queue.indexOf(String(active.id));
    const toIndex = queue.indexOf(String(over.id));
    if (fromIndex >= 0 && toIndex >= 0) {
      reorderQueue(fromIndex, toIndex);
    }
  };

  const renderRow = (id: string, index: number) => {
    const track = trackMap.get(id);
    if (!track) return null;
    const isActive = index === queueIndex;
    const common = {
      index,
      track,
      isActive,
      onPlay: () => void playTrack(id),
      onRemove: () => {
        if (window.confirm(`Убрать «${track.title}» из очереди?`)) {
          removeFromQueue(id);
        }
      },
    };

    if (isTouch) {
      return (
        <TouchQueueRow
          key={id}
          {...common}
          onMoveUp={() => moveQueueItem(index, -1)}
          onMoveDown={() => moveQueueItem(index, 1)}
          canMoveUp={index > 0}
          canMoveDown={index < queue.length - 1}
        />
      );
    }

    return <DesktopSortableRow key={id} id={id} {...common} />;
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-shrink-0 px-2 py-1.5 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Очередь</h3>
          <span className="text-[10px] text-gray-400 font-mono">{queue.length}</span>
        </div>
        {isTouch && queue.length > 1 ? (
          <p className="text-[10px] text-gray-400 mt-1 leading-snug">
            Смахните влево → ▲/▼ для порядка, ✕ — убрать
          </p>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto py-0.5">
        {queue.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">Пусто</p>
        ) : isTouch ? (
          queue.map((id, index) => renderRow(id, index))
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={queue} strategy={verticalListSortingStrategy}>
              {queue.map((id, index) => renderRow(id, index))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
