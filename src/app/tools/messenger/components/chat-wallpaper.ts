import type { CSSProperties } from "react";

/** Tileable Tamgaly Tas petroglyph pattern — kept faint behind bubbles. */
export const CHAT_WALLPAPER_URL = "/tools/messenger/chat-wallpaper.png?v=2";

export const chatWallpaperStyle: CSSProperties = {
  backgroundColor: "#eceff1",
  backgroundImage: [
    "linear-gradient(rgb(236 239 241 / 0.18), rgb(236 239 241 / 0.18))",
    "radial-gradient(circle at 1px 1px, rgb(15 23 42 / 0.035) 1px, transparent 0)",
    `url(${CHAT_WALLPAPER_URL})`,
  ].join(", "),
  backgroundSize: "auto, 18px 18px, 240px 240px",
  backgroundRepeat: "repeat",
};
