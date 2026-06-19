"use client";

import { useEffect, useRef } from "react";
import type { LaunchFileEntry } from "@/lib/music/media-library";
import { isAudioFile } from "@/lib/music/types";
import { claimPrimaryLaunchWindow } from "./launch-coordinator";
import { scheduleLaunchFileImport } from "./launch-file-batch";

interface UseLaunchQueueOptions {
  onFilesReceived: (entries: LaunchFileEntry[]) => void | Promise<void>;
  onUnsupportedFile?: (name: string) => void;
}

function isAudioHandle(handle: FileSystemFileHandle): boolean {
  return isAudioFile(new File([], handle.name, { type: "audio/mpeg" }));
}

function handlesToLaunchEntries(
  handles: FileSystemFileHandle[],
  onUnsupported?: (name: string) => void,
): LaunchFileEntry[] {
  const entries: LaunchFileEntry[] = [];

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i];
    if (isAudioHandle(handle)) {
      entries.push({ handle });
    } else {
      onUnsupported?.(handle.name);
    }
  }

  return entries;
}

export function useLaunchQueue({ onFilesReceived, onUnsupportedFile }: UseLaunchQueueOptions) {
  const onFilesRef = useRef(onFilesReceived);
  const onUnsupportedRef = useRef(onUnsupportedFile);
  onFilesRef.current = onFilesReceived;
  onUnsupportedRef.current = onUnsupportedFile;

  useEffect(() => {
    if (typeof window === "undefined" || !("launchQueue" in window)) return;

    window.launchQueue!.setConsumer(async (launchParams) => {
      if (!launchParams.files?.length) return;

      const isPrimary = await claimPrimaryLaunchWindow();
      if (!isPrimary) {
        window.close();
        return;
      }

      const handles: FileSystemFileHandle[] = [];
      for (let i = 0; i < launchParams.files.length; i++) {
        handles.push(launchParams.files[i]);
      }

      const entries = handlesToLaunchEntries(handles, (name) =>
        onUnsupportedRef.current?.(name),
      );
      if (entries.length === 0) return;

      scheduleLaunchFileImport(entries, (batch) => onFilesRef.current(batch));
    });
  }, []);
}
