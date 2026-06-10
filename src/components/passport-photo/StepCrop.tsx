"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { PHOTO_SIZES, PhotoSize } from "@/lib/passport-photo/dimensions";
import { detectFace } from "@/lib/passport-photo/face-detector";
import type { Landmarks68 } from "@/lib/passport-photo/landmarkAdapter";
import {
  buildGeom,
  computeAutoAdjustFromLandmarks,
  computeHeuristicAdjust,
  cropToBlob,
  drawCropPreview,
  drawFitPreview,
  fromView,
  isDebugMode,
  landmarksToFrameEllipse,
  MAX_ZOOM,
  normalizeImageOrientation,
  toView,
  type Adjust,
  type FaceEllipse,
  type Geom,
} from "@/lib/passport-photo/faceProcessing";
import { buildSilhouettePaths } from "@/lib/passport-photo/passport-guide";
import { validateFacePosition, validatePhotoQuality } from "@/lib/passport-photo/photoValidation";

interface Props {
  imageFile: File;
  onCropComplete: (croppedBlob: Blob, selectedSize: PhotoSize) => void;
  onBack: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export default function StepCrop({ imageFile, onCropComplete, onBack }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; fx: number; fy: number } | null>(null);

  const [selectedSizeId, setSelectedSizeId] = useState(PHOTO_SIZES[0].id);
  const [userAdjust, setUserAdjust] = useState<Adjust | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [orientation, setOrientation] = useState(1);
  const [landmarks, setLandmarks] = useState<Landmarks68 | null>(null);
  const [faceDetected, setFaceDetected] = useState<boolean | null>(null);
  const [faceChecked, setFaceChecked] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [showFaceToast, setShowFaceToast] = useState(false);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const debug = isDebugMode();

  const selectedSize = PHOTO_SIZES.find((s) => s.id === selectedSizeId) ?? PHOTO_SIZES[0];
  const aspect = selectedSize.widthCm / selectedSize.heightCm;

  const geom = useMemo<Geom | null>(() => {
    if (!natural || containerW <= 0) return null;
    const maxH = Math.min(typeof window !== "undefined" ? window.innerHeight * 0.6 : 460, 460);
    let fw = containerW;
    let fh = fw / aspect;
    if (fh > maxH) {
      fh = maxH;
      fw = fh * aspect;
    }
    return buildGeom(fw, fh, natural.w, natural.h);
  }, [natural, containerW, aspect]);

  const autoAdjust = useMemo<Adjust>(() => {
    if (!natural || !geom || !faceChecked) {
      return { zoom: 1, cxN: 0.5, cyN: 0.5 };
    }
    if (landmarks && !manualMode) {
      return computeAutoAdjustFromLandmarks(natural.w, natural.h, geom, landmarks, selectedSizeId);
    }
    return computeHeuristicAdjust(geom);
  }, [natural, geom, faceChecked, landmarks, manualMode, selectedSizeId]);

  const adjust = userAdjust ?? autoAdjust;
  const view = geom ? toView(geom, adjust) : null;

  const faceEllipse: FaceEllipse | null = useMemo(() => {
    if (!landmarks || !view) return null;
    return landmarksToFrameEllipse(landmarks, view, natural!.w, natural!.h);
  }, [landmarks, view, natural]);

  const positionValidation = useMemo(() => {
    if (!landmarks || !view || !geom) return null;
    return validateFacePosition(landmarks, view, geom.fw, geom.fh, selectedSizeId);
  }, [landmarks, view, geom, selectedSizeId]);

  const qualityValidation = useMemo(() => {
    if (!sourceCanvasRef.current) return null;
    return validatePhotoQuality(sourceCanvasRef.current);
  }, [natural, faceChecked]);

  const latest = useRef<{ geom: Geom | null; adjust: Adjust }>({ geom, adjust });
  useEffect(() => {
    latest.current = { geom, adjust };
  });

  const runDetection = useCallback(async () => {
    const canvas = sourceCanvasRef.current;
    if (!canvas) return;
    setModelsLoading(true);
    try {
      const result = await detectFace(canvas);
      if (result) {
        setLandmarks(result.landmarks);
        setFaceDetected(true);
        setManualMode(false);
        setShowFaceToast(false);
      } else {
        setLandmarks(null);
        setFaceDetected(false);
        setManualMode(true);
        setShowFaceToast(true);
      }
    } catch {
      setLandmarks(null);
      setFaceDetected(false);
      setManualMode(true);
      setShowFaceToast(true);
    } finally {
      setModelsLoading(false);
      setFaceChecked(true);
    }
  }, []);

  // EXIF normalization on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const normalized = await normalizeImageOrientation(imageFile);
        if (cancelled) return;
        sourceCanvasRef.current = normalized.canvas;
        setNatural({ w: normalized.width, h: normalized.height });
        setOrientation(normalized.orientation);
        setContainerW((prev) => prev || Math.min(window.innerWidth - 32, 448));
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoadError("Не удалось обработать фото. Попробуйте другое изображение.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageFile]);

  // Face detection after image is ready
  useEffect(() => {
    if (!natural || !sourceCanvasRef.current) return;
    runDetection();
  }, [natural, runDetection]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth || Math.min(window.innerWidth - 32, 448);
      if (w > 0) setContainerW(w);
    };
    update();
    requestAnimationFrame(update);
    const t = window.setTimeout(update, 150);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setContainerW(w);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  // Canvas-превью (iOS Safari не рисует <img> с CSS scale)
  useEffect(() => {
    const preview = previewCanvasRef.current;
    const source = sourceCanvasRef.current;
    if (!preview || !source || !natural) return;

    if (geom && view) {
      drawCropPreview(preview, source, geom, view);
    } else {
      const fw = containerW || Math.min(window.innerWidth - 32, 448);
      const fh = fw / aspect;
      drawFitPreview(preview, source, fw, fh);
    }
  }, [geom, view, natural, containerW, aspect]);

  function handleSizeChange(sizeId: string) {
    setSelectedSizeId(sizeId);
    setUserAdjust(null);
  }

  function panBy(g: Geom, a: Adjust, dx: number, dy: number) {
    const v = toView(g, a);
    setUserAdjust(fromView(g, { scale: v.scale, tx: v.tx + dx, ty: v.ty + dy }));
    setManualMode(true);
  }

  function zoomTo(g: Geom, a: Adjust, rawZoom: number, fx: number, fy: number) {
    const newZoom = clamp(rawZoom, g.minZoom, MAX_ZOOM);
    const v = toView(g, a);
    const f = (g.cover * newZoom) / v.scale;
    setUserAdjust(
      fromView(g, {
        scale: g.cover * newZoom,
        tx: fx - (fx - v.tx) * f,
        ty: fy - (fy - v.ty) * f,
      })
    );
    setManualMode(true);
  }

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { geom: g, adjust: a } = latest.current;
      if (!g) return;
      const rect = frame.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomTo(g, a, a.zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && frameRef.current) {
      const [a, b] = [...pointers.current.values()];
      const rect = frameRef.current.getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        fx: (a.x + b.x) / 2 - rect.left,
        fy: (a.y + b.y) / 2 - rect.top,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!geom || !pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      panBy(geom, adjust, e.clientX - prev.x, e.clientY - prev.y);
    } else if (pointers.current.size === 2 && pinchRef.current && frameRef.current) {
      const [a, b] = [...pointers.current.values()];
      const rect = frameRef.current.getBoundingClientRect();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const fx = (a.x + b.x) / 2 - rect.left;
      const fy = (a.y + b.y) / 2 - rect.top;
      const factor = dist / pinchRef.current.dist;
      const v = toView(geom, adjust);
      const panned = fromView(geom, {
        scale: v.scale,
        tx: v.tx + (fx - pinchRef.current.fx),
        ty: v.ty + (fy - pinchRef.current.fy),
      });
      zoomTo(geom, panned, panned.zoom * factor, fx, fy);
      pinchRef.current = { dist, fx, fy };
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
  }

  async function generateBlob(): Promise<Blob | null> {
    const source = sourceCanvasRef.current;
    if (!geom || !view || !source) return null;
    return cropToBlob(source, geom, view, selectedSize.widthPx, selectedSize.heightPx);
  }

  async function proceed() {
    setWorking(true);
    const blob = await generateBlob();
    setWorking(false);
    if (blob) onCropComplete(blob, selectedSize);
  }

  function setZoomFromSlider(value: number) {
    if (!geom) return;
    zoomTo(geom, adjust, value, geom.fw / 2, geom.fh / 2);
  }

  async function handleRetryDetection() {
    setFaceChecked(false);
    setUserAdjust(null);
    await runDetection();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 px-4">
        <p className="text-sm text-gray-500">Обработка фото…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 px-4">
        <p className="text-sm text-red-500">{loadError}</p>
        <button onClick={onBack} className="text-sm text-gray-600 underline">
          ← Назад
        </button>
      </div>
    );
  }

  const allOk =
    faceDetected &&
    positionValidation?.ok !== false &&
    qualityValidation?.ok !== false;

  return (
    <div className="flex flex-col gap-5 py-6 px-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Кадрирование</h2>
        <p className="text-sm text-gray-500 mt-1">
          {faceDetected
            ? "Фото автоматически выровнено — проверьте овал"
            : "Совместите лицо с овалом — можно настроить вручную и продолжить"}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {PHOTO_SIZES.map((size) => (
          <button
            key={size.id}
            onClick={() => handleSizeChange(size.id)}
            className={[
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              selectedSizeId === size.id
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
            ].join(" ")}
          >
            {size.label}
          </button>
        ))}
      </div>

      {/* Validation badges */}
      {faceChecked && (
        <div className="flex flex-col gap-2 max-w-md mx-auto w-full">
          {positionValidation && (
            <div
              className={[
                "rounded-lg px-3 py-2 text-sm",
                positionValidation.ok
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
                  : "bg-amber-50 text-amber-800 border border-amber-100",
              ].join(" ")}
            >
              {positionValidation.ok ? "✓ Позиция лица подходит" : `⚠ ${positionValidation.message}`}
            </div>
          )}
          {qualityValidation && (
            <div
              className={[
                "rounded-lg px-3 py-2 text-sm",
                qualityValidation.ok
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
                  : "bg-amber-50 text-amber-800 border border-amber-100",
              ].join(" ")}
            >
              {qualityValidation.ok ? "✓ Качество фото подходит" : `⚠ ${qualityValidation.message}`}
            </div>
          )}
          {allOk && (
            <div className="rounded-lg px-3 py-2 text-sm bg-emerald-600 text-white text-center font-medium">
              ✓ Фото подходит
            </div>
          )}
        </div>
      )}

      <div ref={wrapRef} className="w-full max-w-md mx-auto flex flex-col items-center gap-3">
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative overflow-hidden rounded-2xl bg-gray-900 shadow-inner cursor-grab active:cursor-grabbing select-none"
          style={{
            width: geom ? geom.fw : "100%",
            height: geom ? geom.fh : 360,
            touchAction: "none",
          }}
        >
          <canvas
            ref={previewCanvasRef}
            className="absolute top-0 left-0 max-w-none select-none"
            aria-label="Предпросмотр фото"
          />

          <div className="absolute inset-0 pointer-events-none">
            {faceEllipse && faceDetected ? (
              <DynamicOval ellipse={faceEllipse} />
            ) : (
              <StaticSilhouette aspect={aspect} />
            )}
          </div>

          {debug && landmarks && view && geom && (
            <DebugOverlay
              landmarks={landmarks}
              view={view}
              geom={geom}
              orientation={orientation}
              quality={qualityValidation}
            />
          )}
        </div>

        {geom && (
          <div className="flex flex-col items-center gap-1 w-full max-w-sm">
            <div className="flex items-center gap-3 w-full">
              <span className="text-gray-400 text-lg leading-none select-none">−</span>
              <input
                type="range"
                min={geom.minZoom}
                max={MAX_ZOOM}
                step={0.01}
                value={clamp(adjust.zoom, geom.minZoom, MAX_ZOOM)}
                onChange={(e) => setZoomFromSlider(parseFloat(e.target.value))}
                className="flex-1 accent-gray-900 cursor-pointer"
                aria-label="Масштаб"
              />
              <span className="text-gray-400 text-lg leading-none select-none">+</span>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Овал — голова с волосами · Пунктир сверху — отступ от края
            </p>
          </div>
        )}
      </div>

      {showFaceToast && manualMode && (
        <div className="max-w-md mx-auto w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p>
            Автораспознавание не сработало. Совместите лицо с овалом пальцами и нажмите{" "}
            <strong>«Далее»</strong> — это нормально.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRetryDetection}
              disabled={modelsLoading}
              className="flex-1 px-3 py-2 rounded-lg border border-amber-300 text-xs font-medium hover:bg-amber-100 transition-colors"
            >
              {modelsLoading ? "Поиск…" : "Попробовать снова"}
            </button>
            <button
              type="button"
              onClick={() => setShowFaceToast(false)}
              className="flex-1 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 transition-colors"
            >
              Понятно, продолжу
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between gap-3 max-w-md mx-auto w-full pb-2">
        <button
          onClick={onBack}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Назад
        </button>
        <button
          onClick={proceed}
          disabled={!geom || working}
          className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {working ? "Обработка…" : "Далее →"}
        </button>
      </div>
    </div>
  );
}

function DynamicOval({ ellipse }: { ellipse: FaceEllipse }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,0.9))" }}
      aria-hidden="true"
    >
      <ellipse
        cx={ellipse.cx}
        cy={ellipse.cy}
        rx={ellipse.rx}
        ry={ellipse.ry}
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeDasharray="12 8"
      />
      <line
        x1={ellipse.cx - ellipse.rx}
        y1={ellipse.topMarginY}
        x2={ellipse.cx + ellipse.rx}
        y2={ellipse.topMarginY}
        stroke="white"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        opacity="0.6"
      />
    </svg>
  );
}

function StaticSilhouette({ aspect }: { aspect: number }) {
  const paths = buildSilhouettePaths(aspect);
  const dash = { strokeDasharray: "12 8", strokeLinecap: "round" as const, fill: "none" };

  return (
    <svg
      viewBox={`0 0 ${paths.W} ${paths.H}`}
      className="w-full h-full"
      preserveAspectRatio="none"
      style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,0.9))" }}
      aria-hidden="true"
    >
      <ellipse
        cx={paths.head.cx}
        cy={paths.head.cy}
        rx={paths.head.rx}
        ry={paths.head.ry}
        stroke="white"
        strokeWidth="2.5"
        {...dash}
      />
      <line
        x1={paths.head.cx - paths.head.rx}
        y1={paths.topMarginLine}
        x2={paths.head.cx + paths.head.rx}
        y2={paths.topMarginLine}
        stroke="white"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        opacity="0.5"
      />
    </svg>
  );
}

function DebugOverlay({
  landmarks,
  view,
  geom,
  orientation,
  quality,
}: {
  landmarks: Landmarks68;
  view: { scale: number; tx: number; ty: number };
  geom: Geom;
  orientation: number;
  quality: ReturnType<typeof validatePhotoQuality> | null;
}) {
  const toFrame = (p: { x: number; y: number }) => ({
    x: p.x * view.scale + view.tx,
    y: p.y * view.scale + view.ty,
  });

  const xs = landmarks.map((p) => p.x);
  const ys = landmarks.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bbox = {
    x: minX * view.scale + view.tx,
    y: minY * view.scale + view.ty,
    w: (maxX - minX) * view.scale,
    h: (maxY - minY) * view.scale,
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      {landmarks.map((p, i) => {
        const f = toFrame(p);
        return <circle key={i} cx={f.x} cy={f.y} r={2} fill="red" />;
      })}
      <rect
        x={bbox.x}
        y={bbox.y}
        width={bbox.w}
        height={bbox.h}
        fill="none"
        stroke="blue"
        strokeWidth="1.5"
      />
      <rect
        x={0}
        y={0}
        width={geom.fw}
        height={geom.fh}
        fill="none"
        stroke="lime"
        strokeWidth="2"
      />
      <text x={4} y={14} fill="lime" fontSize="10" fontFamily="monospace">
        {geom.nw}x{geom.nh} | EXIF:{orientation} | scale:{view.scale.toFixed(2)}
      </text>
      {quality && (
        <text x={4} y={28} fill="lime" fontSize="10" fontFamily="monospace">
          lap:{quality.laplacianVariance?.toFixed(0)} bri:{quality.avgBrightness?.toFixed(0)}
        </text>
      )}
    </svg>
  );
}
