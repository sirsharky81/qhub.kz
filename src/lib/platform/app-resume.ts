import { isNativePlatform } from "./runtime";

/** Run callback when the native app returns to foreground or the tab becomes visible. */
export function onAppResume(callback: () => void): () => void {
  if (typeof document === "undefined") return () => {};

  const onVisibility = () => {
    if (document.visibilityState === "visible") callback();
  };
  document.addEventListener("visibilitychange", onVisibility);

  let removeNative: (() => void) | undefined;
  if (isNativePlatform()) {
    void import("@capacitor/app").then(({ App }) =>
      App.addListener("resume", callback).then((handle) => {
        removeNative = () => handle.remove();
      }),
    );
  }

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    removeNative?.();
  };
}
