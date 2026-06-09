"use client";

import { useCallback, useRef, useState } from "react";
import { cloneEditorState, type EditorState } from "@/lib/music-editor/history";

const MAX_HISTORY = 50;

interface HistoryStack {
  past: EditorState[];
  present: EditorState;
  future: EditorState[];
}

export function useEditorHistory(initial: EditorState) {
  const [history, setHistory] = useState<HistoryStack>({
    past: [],
    present: initial,
    future: [],
  });
  const gestureActive = useRef(false);

  const replaceState = useCallback((next: EditorState, resetHistory = false) => {
    setHistory((h) => ({
      past: resetHistory ? [] : h.past,
      present: next,
      future: resetHistory ? [] : h.future,
    }));
  }, []);

  const updateState = useCallback(
    (updater: (prev: EditorState) => EditorState, options?: { skipHistory?: boolean }) => {
      setHistory((h) => {
        const nextPresent = updater(h.present);
        if (options?.skipHistory || gestureActive.current) {
          return { ...h, present: nextPresent };
        }
        return {
          past: [...h.past.slice(-(MAX_HISTORY - 1)), cloneEditorState(h.present)],
          present: nextPresent,
          future: [],
        };
      });
    },
    [],
  );

  const beginGesture = useCallback(() => {
    if (!gestureActive.current) {
      gestureActive.current = true;
      setHistory((h) => ({
        ...h,
        past: [...h.past.slice(-(MAX_HISTORY - 1)), cloneEditorState(h.present)],
        future: [],
      }));
    }
  }, []);

  const endGesture = useCallback(() => {
    gestureActive.current = false;
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: cloneEditorState(previous),
        future: [cloneEditorState(h.present), ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      return {
        past: [...h.past, cloneEditorState(h.present)],
        present: cloneEditorState(next),
        future: h.future.slice(1),
      };
    });
  }, []);

  return {
    state: history.present,
    replaceState,
    updateState,
    beginGesture,
    endGesture,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
