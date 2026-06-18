"use client";

import { useEffect, useRef } from "react";
import { isAudioFile } from "@/lib/music/types";

const CHANNEL_NAME = "qhub-music-launch-handoff";

interface HandoffRequest {
  type: "handoff-request";
  id: string;
  sender: string;
  handles: FileSystemFileHandle[];
}

interface HandoffAck {
  type: "handoff-ack";
  id: string;
}

interface UseLaunchQueueOptions {
  onFilesReceived: (files: File[]) => void | Promise<void>;
  onUnsupportedFile?: (name: string) => void;
}

async function handlesToFiles(
  handles: FileSystemFileHandle[],
  onUnsupported?: (name: string) => void,
): Promise<File[]> {
  const files: File[] = [];
  for (const handle of handles) {
    try {
      const file = await handle.getFile();
      if (isAudioFile(file)) {
        files.push(file);
      } else {
        onUnsupported?.(file.name);
      }
    } catch (err) {
      console.warn("[useLaunchQueue] Failed to read file handle:", err);
    }
  }
  return files;
}

function tryHandoffToExistingWindow(
  channel: BroadcastChannel,
  windowId: string,
  handles: FileSystemFileHandle[],
): Promise<boolean> {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const timeout = window.setTimeout(() => resolve(false), 500);

    const onMessage = (event: MessageEvent<HandoffAck>) => {
      if (event.data?.type !== "handoff-ack" || event.data.id !== id) return;
      window.clearTimeout(timeout);
      channel.removeEventListener("message", onMessage);
      window.close();
      resolve(true);
    };

    channel.addEventListener("message", onMessage);
    channel.postMessage({
      type: "handoff-request",
      id,
      sender: windowId,
      handles,
    } satisfies HandoffRequest);
  });
}

export function useLaunchQueue({ onFilesReceived, onUnsupportedFile }: UseLaunchQueueOptions) {
  const onFilesRef = useRef(onFilesReceived);
  const onUnsupportedRef = useRef(onUnsupportedFile);
  onFilesRef.current = onFilesReceived;
  onUnsupportedRef.current = onUnsupportedFile;

  useEffect(() => {
    if (typeof window === "undefined" || !("launchQueue" in window)) return;

    const windowId = crypto.randomUUID();
    const channel = new BroadcastChannel(CHANNEL_NAME);

    const processHandles = async (handles: FileSystemFileHandle[]) => {
      const files = await handlesToFiles(handles, (name) => onUnsupportedRef.current?.(name));
      if (files.length > 0) {
        await onFilesRef.current(files);
      }
    };

    const onChannelMessage = (event: MessageEvent<HandoffRequest | HandoffAck>) => {
      const data = event.data;
      if (data?.type !== "handoff-request" || data.sender === windowId) return;

      void (async () => {
        await processHandles(data.handles);
        channel.postMessage({ type: "handoff-ack", id: data.id } satisfies HandoffAck);
      })();
    };

    channel.addEventListener("message", onChannelMessage);

    window.launchQueue!.setConsumer(async (launchParams) => {
      if (!launchParams.files?.length) return;

      const handles = [...launchParams.files];
      const handedOff = await tryHandoffToExistingWindow(channel, windowId, handles);
      if (handedOff) return;

      await processHandles(handles);
    });

    return () => {
      channel.removeEventListener("message", onChannelMessage);
      channel.close();
    };
  }, []);
}
