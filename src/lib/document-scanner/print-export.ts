import type { PageOrientation, ScanPage } from "./types";
import { getPageSizeMm, resolveOrientation } from "./page-size";

type PrintSheet = { src: string; orientation: PageOrientation };

function buildPrintHtml(sheets: PrintSheet[]): string {
  const body = sheets
    .map(({ src, orientation }) => {
      const { width, height } = getPageSizeMm(orientation);
      return `<div class="sheet" style="width:${width};height:${height}"><img src="${src}" style="width:${width};height:${height}" alt="" /></div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Печать A4</title>
<style>
  @page { margin: 0; size: auto; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    page-break-after: always;
    overflow: hidden;
    background: #fff;
  }
  .sheet:last-child { page-break-after: auto; }
  .sheet img { display: block; }
</style>
</head>
<body>${body}
<script>
  window.addEventListener("load", () => {
    setTimeout(() => window.print(), 250);
  });
  window.addEventListener("afterprint", () => window.close());
</script>
</body>
</html>`;
}

async function renderPagesForPrint(pages: ScanPage[]): Promise<PrintSheet[]> {
  const { renderPageToCanvas } = await import("./a4-layout");
  const sheets: PrintSheet[] = [];
  for (const page of pages) {
    const canvas = await renderPageToCanvas(page);
    sheets.push({
      src: canvas.toDataURL("image/jpeg", 0.92),
      orientation: resolveOrientation(page),
    });
  }
  return sheets;
}

function printViaWindow(html: string): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

function printViaIframe(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:99999;background:#fff;opacity:0;pointer-events:none";
    iframe.srcdoc = html;

    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 60_000);
    };

    iframe.onload = () => {
      try {
        const cw = iframe.contentWindow;
        if (!cw) throw new Error("print frame unavailable");
        cw.focus();
        cw.print();
        cleanup();
        resolve();
      } catch (err) {
        iframe.remove();
        reject(err instanceof Error ? err : new Error("Print failed"));
      }
    };

    iframe.onerror = () => {
      iframe.remove();
      reject(new Error("Failed to load print preview"));
    };

    document.body.appendChild(iframe);
  });
}

/** Open browser print dialog — each page as full-bleed A4 image. */
export async function printPagesA4(pages: ScanPage[]): Promise<void> {
  const sheets = await renderPagesForPrint(pages);
  const html = buildPrintHtml(sheets);

  if (!printViaWindow(html)) {
    await printViaIframe(html);
  }
}
