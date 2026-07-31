import { describe, expect, it } from "vitest";
import { guessShareMime } from "./save-received";

describe("guessShareMime", () => {
  it("detects common image types", () => {
    expect(guessShareMime("photo.jpg")).toBe("image/jpeg");
    expect(guessShareMime("photo.JPEG")).toBe("image/jpeg");
    expect(guessShareMime("shot.png")).toBe("image/png");
    expect(guessShareMime("anim.gif")).toBe("image/gif");
    expect(guessShareMime("img.webp")).toBe("image/webp");
    expect(guessShareMime("iphone.heic")).toBe("image/heic");
  });

  it("detects video types", () => {
    expect(guessShareMime("clip.mov")).toBe("video/quicktime");
    expect(guessShareMime("video.mp4")).toBe("video/mp4");
  });

  it("falls back to octet-stream", () => {
    expect(guessShareMime("archive.zip")).toBe("application/octet-stream");
    expect(guessShareMime("notes.txt")).toBe("application/octet-stream");
  });
});
