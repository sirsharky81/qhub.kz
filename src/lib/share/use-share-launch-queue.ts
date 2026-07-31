"use client";

import { useEffect, useRef } from "react";
import { claimPrimaryShareLaunchWindow } from "./launch-coordinator";

export function useShareLaunchQueue(onFilesReceived: (files: File[]) => void | Promise<void>): void {
  const handlerRef = useRef(onFilesReceived);
  handlerRef.current = onFilesReceived;

  useEffect(() => {
    if (typeof window === "undefined" || !("launchQueue" in window)) return;

    window.launchQueue!.setConsumer(async (launchParams) => {
      if (!launchParams.files?.length) return;

      const isPrimary = await claimPrimaryShareLaunchWindow();
      if (!isPrimary) {
        window.close();
        return;
      }

      const files: File[] = [];
      for (const handle of launchParams.files) {
        files.push(await handle.getFile());
      }
      if (!files.length) return;

      await handlerRef.current(files);
    });
  }, []);
}
