"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NormPoint, ScanDocument, ScanPage, ScannerStep } from "@/lib/document-scanner/types";
import { defaultScanFilename, generateId } from "@/lib/document-scanner/constants";
import { fileToCanvas } from "@/lib/document-scanner/canvas-utils";
import { detectDocumentCornersFast } from "@/lib/document-scanner/edge-detection";
import { defaultA4CropCorners } from "@/lib/document-scanner/crop-utils";
import { yieldToMain } from "@/lib/document-scanner/async-utils";
import { listDocuments, loadDocument, saveDocument, clearAllDocuments } from "@/lib/document-scanner/storage";
import HomeScreen from "./components/HomeScreen";
import ScannerStepIndicator from "./components/ScannerStepIndicator";

const CropScreen = dynamic(() => import("./components/CropScreen"), { ssr: false });
const EditScreen = dynamic(() => import("./components/EditScreen"), { ssr: false });
const PagesView = dynamic(() => import("./components/PagesView"), { ssr: false });
const ComposeScreen = dynamic(() => import("./components/ComposeScreen"), { ssr: false });
const ExportDialog = dynamic(() => import("./components/ExportDialog"), { ssr: false });
const ScannerCameraCapture = dynamic(() => import("./components/ScannerCameraCapture"), {
  ssr: false,
});

type CaptureIntent = "new-page" | "add-to-page";

function deferIdle(fn: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(fn, { timeout: 2000 });
  } else {
    setTimeout(fn, 100);
  }
}

export default function DocumentScannerClient() {
  const [step, setStep] = useState<ScannerStep>("home");
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [docId, setDocId] = useState(() => generateId());
  const [docName, setDocName] = useState(defaultScanFilename);

  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [corners, setCorners] = useState<NormPoint[]>([]);
  const [rotation, setRotation] = useState(0);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [composeItems, setComposeItems] = useState<ScanPage["items"]>([]);

  const [showCamera, setShowCamera] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedDocs, setSavedDocs] = useState<
    { id: string; name: string; pageCount: number; updatedAt: number }[]
  >([]);

  const captureIntent = useRef<CaptureIntent>("new-page");
  const galleryRef = useRef<HTMLInputElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);
  const stepHistoryRef = useRef<ScannerStep[]>([]);

  useEffect(() => {
    deferIdle(() => {
      listDocuments().then(setSavedDocs).catch(() => {});
    });
  }, []);

  const persist = useCallback(
    async (nextPages: ScanPage[]) => {
      const doc: ScanDocument = {
        id: docId,
        name: docName,
        pages: nextPages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveDocument(doc);
      const list = await listDocuments();
      setSavedDocs(list);
    },
    [docId, docName],
  );

  const exitToHome = useCallback(() => {
    stepHistoryRef.current = [];
    setStep("home");
    setPages([]);
    setActivePageId(null);
    setDocId(generateId());
    setDocName(defaultScanFilename());
    setSourceCanvas(null);
    setCroppedBlob(null);
    setEditingPageId(null);
    setComposeItems([]);
    captureIntent.current = "new-page";
  }, []);

  const navigateTo = useCallback((next: ScannerStep, opts?: { resetHistory?: boolean }) => {
    if (opts?.resetHistory) {
      stepHistoryRef.current = [];
      setStep(next);
      return;
    }
    setStep((cur) => {
      if (cur !== next) stepHistoryRef.current.push(cur);
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    const prev = stepHistoryRef.current.pop();
    if (!prev || prev === "home") {
      exitToHome();
      return;
    }

    if (prev === "edit") {
      const pageId = editingPageId ?? activePageId;
      const page = pages.find((p) => p.id === pageId);
      if (page?.items[0]) {
        setEditingPageId(pageId);
        setCroppedBlob(page.items[0].imageBlob);
      }
    }

    if (prev === "compose") {
      const page = pages.find((p) => p.id === activePageId);
      if (page) setComposeItems(page.items);
    }

    setStep((cur) => {
      if (cur === "compose") setComposeItems([]);
      return prev;
    });
  }, [activePageId, editingPageId, exitToHome, pages]);

  const beginCapture = useCallback(async (file: File, intent: CaptureIntent) => {
    captureIntent.current = intent;
    setLoading(true);
    try {
      await yieldToMain();
      const canvas = await fileToCanvas(file);
      await yieldToMain();
      const result = await detectDocumentCornersFast(canvas);
      setSourceCanvas(canvas);
      setCorners(result?.corners ?? defaultA4CropCorners());
      setRotation(0);
      setCroppedBlob(null);
      setEditingPageId(null);
      navigateTo("crop");
    } finally {
      setLoading(false);
    }
  }, [navigateTo]);

  const handleCropConfirm = useCallback(async (blob: Blob) => {
    if (captureIntent.current === "add-to-page") {
      const page = pages.find((p) => p.id === activePageId);
      if (!page) return;
      const { createScanItem } = await import("./components/ComposeScreen");
      const newItem = createScanItem(blob, page.items.length);
      setComposeItems([...page.items, newItem]);
      navigateTo("compose");
      return;
    }
    setCroppedBlob(blob);
    setEditingPageId(null);
    navigateTo("edit");
  }, [pages, activePageId, navigateTo]);

  const handleEditConfirm = useCallback(
    async (page: ScanPage) => {
      let nextPages: ScanPage[];

      if (editingPageId) {
        nextPages = pages.map((p) => (p.id === editingPageId ? page : p));
      } else {
        const newPage: ScanPage = {
          ...page,
          id: generateId(),
          name: `Страница ${pages.length + 1}`,
        };
        nextPages = [...pages, newPage];
        setActivePageId(newPage.id);
      }

      setPages(nextPages);
      setEditingPageId(null);
      setComposeItems([]);
      navigateTo("pages");
      await persist(nextPages);
    },
    [editingPageId, pages, persist, navigateTo],
  );

  const openCapture = useCallback((intent: CaptureIntent) => {
    captureIntent.current = intent;
    setShowCamera(true);
  }, []);

  const handleOpenDoc = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const doc = await loadDocument(id);
      if (!doc) return;
      setDocId(doc.id);
      setDocName(doc.name);
      setPages(doc.pages);
      setActivePageId(doc.pages[0]?.id ?? null);
      stepHistoryRef.current = ["home"];
      setStep("pages");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClearSavedDocs = useCallback(async () => {
    if (!savedDocs.length) return;
    if (
      !window.confirm(
        `Удалить все сохранённые сканы (${savedDocs.length})? Это действие нельзя отменить.`,
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      await clearAllDocuments();
      setSavedDocs([]);
      if (step !== "home") exitToHome();
    } finally {
      setLoading(false);
    }
  }, [savedDocs.length, step, exitToHome]);

  async function handleExport(settings: {
    filename: string;
    formats: import("@/lib/document-scanner/types").ExportFormat[];
    quality: import("@/lib/document-scanner/types").ExportQuality;
  }) {
    setExporting(true);
    try {
      setDocName(settings.filename);
      const { exportToPdf } = await import("@/lib/document-scanner/pdf-export");
      const { downloadBlob, downloadZip, exportPagesAsImages } = await import(
        "@/lib/document-scanner/image-export"
      );

      if (settings.formats.includes("pdf")) {
        const pdf = await exportToPdf(pages, settings.quality);
        downloadBlob(pdf, `${settings.filename}.pdf`);
      }

      const imageFormats = settings.formats.filter(
        (f): f is "jpg" | "png" | "webp" => f !== "pdf",
      );
      for (const fmt of imageFormats) {
        const files = await exportPagesAsImages(pages, fmt, settings.quality);
        if (pages.length === 1 && files[0]) {
          downloadBlob(files[0].blob, `${settings.filename}.${fmt === "jpg" ? "jpg" : fmt}`);
        } else {
          await downloadZip(
            files.map((f) => ({ ...f, filename: `${settings.filename}_${f.filename}` })),
            `${settings.filename}_${fmt}.zip`,
          );
        }
      }

      await persist(pages);
      setShowExport(false);
    } finally {
      setExporting(false);
    }
  }

  async function handlePrint() {
    if (pages.length === 0) return;
    setPrinting(true);
    try {
      const { printPagesA4 } = await import("@/lib/document-scanner/print-export");
      await printPagesA4(pages);
    } finally {
      setPrinting(false);
    }
  }

  function resetToHome() {
    exitToHome();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      {step !== "home" && <ScannerStepIndicator step={step} />}
      {(loading || printing) && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/80">
          <p className="text-sm text-gray-500">{printing ? "Подготовка к печати…" : "Обработка…"}</p>
        </div>
      )}

      <input
        ref={galleryRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) beginCapture(f, "new-page");
          e.target.value = "";
        }}
      />
      <input
        ref={addFileRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) beginCapture(f, captureIntent.current);
          e.target.value = "";
        }}
      />

      {step === "home" && (
        <HomeScreen
          onFileSelect={(f) => beginCapture(f, "new-page")}
          onCameraOpen={() => openCapture("new-page")}
          onGalleryOpen={() => galleryRef.current?.click()}
          savedDocs={savedDocs}
          onOpenDoc={handleOpenDoc}
          onClearSavedDocs={handleClearSavedDocs}
        />
      )}

      {step === "crop" && sourceCanvas && (
        <CropScreen
          sourceCanvas={sourceCanvas}
          initialCorners={corners}
          rotation={rotation}
          onRotationChange={setRotation}
          onConfirm={handleCropConfirm}
          onBack={goBack}
        />
      )}

      {step === "edit" && croppedBlob && (
        <EditScreen
          croppedBlob={croppedBlob}
          existingPage={editingPageId ? pages.find((p) => p.id === editingPageId) : undefined}
          onConfirm={handleEditConfirm}
          onBack={goBack}
        />
      )}

      {step === "compose" && (
        <ComposeScreen
          items={composeItems}
          orientation={pages.find((p) => p.id === activePageId)?.orientation ?? "portrait"}
          onChange={setComposeItems}
          onConfirm={() => {
            const page = pages.find((p) => p.id === activePageId);
            if (page) {
              const updated = { ...page, items: composeItems };
              const next = pages.map((p) => (p.id === activePageId ? updated : p));
              setPages(next);
              persist(next);
            }
            setComposeItems([]);
            navigateTo("pages");
          }}
          onBack={goBack}
        />
      )}

      {step === "pages" && pages.length > 0 && (
        <PagesView
          pages={pages}
          activePageId={activePageId}
          onSelectPage={setActivePageId}
          onReorder={(next) => {
            setPages(next);
            persist(next);
          }}
          onDuplicate={(id) => {
            const page = pages.find((p) => p.id === id);
            if (!page) return;
            const copy: ScanPage = {
              ...page,
              id: generateId(),
              name: `${page.name} (копия)`,
              items: page.items.map((it) => ({ ...it, id: generateId() })),
            };
            const next = [...pages, copy];
            setPages(next);
            persist(next);
          }}
          onDelete={(id) => {
            const next = pages.filter((p) => p.id !== id);
            setPages(next);
            if (activePageId === id) setActivePageId(next[0]?.id ?? null);
            if (next.length === 0) resetToHome();
            else persist(next);
          }}
          onRename={(id, name) => {
            const next = pages.map((p) => (p.id === id ? { ...p, name } : p));
            setPages(next);
            persist(next);
          }}
          onEdit={(id) => {
            const page = pages.find((p) => p.id === id);
            if (!page || !page.items[0]) return;
            setEditingPageId(id);
            setCroppedBlob(page.items[0].imageBlob);
            navigateTo("edit");
          }}
          onSetOrientation={(id, orientation) => {
            const next = pages.map((p) => (p.id === id ? { ...p, orientation } : p));
            setPages(next);
            persist(next);
          }}
          onAddPage={() => {
            captureIntent.current = "new-page";
            if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
              openCapture("new-page");
            } else {
              addFileRef.current?.click();
            }
          }}
          onAddToPage={() => {
            captureIntent.current = "add-to-page";
            if (typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches) {
              openCapture("add-to-page");
            } else {
              addFileRef.current?.click();
            }
          }}
          onExport={() => setShowExport(true)}
          onPrint={handlePrint}
          printing={printing}
          onBack={goBack}
        />
      )}

      {showCamera && (
        <ScannerCameraCapture
          onCapture={(file) => {
            setShowCamera(false);
            beginCapture(file, captureIntent.current);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {showExport && (
        <ExportDialog
          pageCount={pages.length}
          exporting={exporting}
          onExport={handleExport}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
