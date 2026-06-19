export async function renderCode128Svg(
  value: string,
  height = 60,
  displayValue = true,
  margin = 4,
): Promise<string | null> {
  const code = value.replace(/[^\x20-\x7E]/g, "").trim();
  if (!code) return null;

  const JsBarcode = (await import("jsbarcode")).default;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, code, {
      format: "CODE128",
      height,
      displayValue,
      fontSize: 14,
      margin,
      width: 2,
    });
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return null;
  }
}

export async function renderCode128DataUrl(
  value: string,
  height = 60,
  displayValue = true,
  margin = 4,
): Promise<string | null> {
  const svg = await renderCode128Svg(value, height, displayValue, margin);
  if (!svg) return null;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 300;
      canvas.height = img.naturalHeight || height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
