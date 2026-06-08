"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { PHOTO_SIZES, PhotoSize } from "@/lib/passport-photo/dimensions";
import {
  computeAutoAdjust,
  buildSilhouettePaths,
  detectFaceBox,
  type FaceBox,
} from "@/lib/passport-photo/passport-guide";

interface Props {
  imageUrl: string;
  onCropComplete: (croppedBlob: Blob, selectedSize: PhotoSize) => void;
  onBack: () => void;
}

interface View {
  scale: number; // CSS-px scale relative to the image's natural size
  tx: number; // image top-left X within the frame (frame px)
  ty: number; // image top-left Y within the frame (frame px)
}

interface Geom {
  fw: number; // frame width (px)
  fh: number; // frame height (px)
  nw: number; // image natural width
  nh: number; // image natural height
  cover: number; // minimum scale so the image fully covers the frame
}

// Geometry-independent crop state: zoom is a multiplier over the "cover" scale,
// and (cxN, cyN) is the normalized image point that sits at the frame centre.
interface Adjust {
  zoom: number;
  cxN: number;
  cyN: number;
}

// Builds the concrete on-screen transform from the geometry + adjustment,
// clamped so the image always fully covers the frame.
function toView(g: Geom, a: Adjust): View {
  const scale = g.cover * a.zoom;
  const iw = g.nw * scale;
  const ih = g.nh * scale;
  const tx = clamp(g.fw / 2 - a.cxN * g.nw * scale, g.fw - iw, 0);
  const ty = clamp(g.fh / 2 - a.cyN * g.nh * scale, g.fh - ih, 0);
  return { scale, tx, ty };
}

// Inverse of toView: converts a concrete transform back to normalized state.
function fromView(g: Geom, v: View): Adjust {
  return {
    zoom: v.scale / g.cover,
    cxN: (g.fw / 2 - v.tx) / (g.nw * v.scale),
    cyN: (g.fh / 2 - v.ty) / (g.nh * v.scale),
  };
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const MAX_ZOOM = 4; // relative to the "cover" scale

export default function StepCrop({ imageUrl, onCropComplete, onBack }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null); // measures available width
  const frameRef = useRef<HTMLDivElement>(null); // the fixed crop viewport
  const imgRef = useRef<HTMLImageElement>(null); // displayed (and source) image
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; fx: number; fy: number } | null>(null);

  const [selectedSizeId, setSelectedSizeId] = useState(PHOTO_SIZES[0].id);
  const [userAdjust, setUserAdjust] = useState<Adjust | null>(null);
  const [containerW, setContainerW] = useState(0);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [faceChecked, setFaceChecked] = useState(false);
  const [faceOk, setFaceOk] = useState<boolean | null>(null);
  const [showFaceWarning, setShowFaceWarning] = useState(false);
  const [working, setWorking] = useState(false);

  const selectedSize = PHOTO_SIZES.find((s) => s.id === selectedSizeId) ?? PHOTO_SIZES[0];
  const aspect = selectedSize.widthCm / selectedSize.heightCm;

  // Frame geometry is a pure function of measured width + format + image size
  const geom = useMemo<Geom | null>(() => {
    if (!natural || containerW <= 0) return null;
    const maxH = Math.min(typeof window !== "undefined" ? window.innerHeight * 0.6 : 460, 460);
    let fw = containerW;
    let fh = fw / aspect;
    if (fh > maxH) {
      fh = maxH;
      fw = fh * aspect;
    }
    const cover = Math.max(fw / natural.w, fh / natural.h);
    return { fw, fh, nw: natural.w, nh: natural.h, cover };
  }, [natural, containerW, aspect]);

  // Auto-align derived from image + frame + face (recomputes when deps change)
  const autoAdjust = useMemo<Adjust>(() => {
    if (!natural || !geom || !faceChecked) {
      return { zoom: 1, cxN: 0.5, cyN: 0.5 };
    }
    return computeAutoAdjust(
      natural.w,
      natural.h,
      geom.fw,
      geom.fh,
      geom.cover,
      faceBox
    );
  }, [natural, geom, faceChecked, faceBox]);

  const adjust = userAdjust ?? autoAdjust;

  // Concrete on-screen transform derived from geometry + adjustment
  const view: View | null = geom ? toView(geom, adjust) : null;

  // Latest values for the imperatively-attached wheel listener
  const latest = useRef<{ geom: Geom | null; adjust: Adjust }>({ geom, adjust });
  useEffect(() => {
    latest.current = { geom, adjust };
  });

  // Measure available container width; read immediately + on resize
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerW(w);
    };
    update();
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Detect face once the image element is ready (incl. cached images)
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !natural) return;

    let cancelled = false;
    (async () => {
      const hasFaceApi = !!(window as unknown as { FaceDetector?: unknown }).FaceDetector;
      const face = await detectFaceBox(img);
      if (cancelled) return;
      setFaceBox(face);
      setFaceOk(!hasFaceApi || face !== null);
      setFaceChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [natural]);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const el = e.currentTarget;
    setNatural({ w: el.naturalWidth, h: el.naturalHeight });
  }

  function handleSizeChange(sizeId: string) {
    setSelectedSizeId(sizeId);
    setUserAdjust(null);
  }

  // ── Transform updates (always recomputed from latest geom + adjust) ──────────
  function panBy(g: Geom, a: Adjust, dx: number, dy: number) {
    const v = toView(g, a);
    setUserAdjust(fromView(g, { scale: v.scale, tx: v.tx + dx, ty: v.ty + dy }));
  }

  function zoomTo(g: Geom, a: Adjust, rawZoom: number, fx: number, fy: number) {
    const newZoom = clamp(rawZoom, 1, MAX_ZOOM);
    const v = toView(g, a);
    const f = (g.cover * newZoom) / v.scale;
    setUserAdjust(
      fromView(g, {
        scale: g.cover * newZoom,
        tx: fx - (fx - v.tx) * f,
        ty: fy - (fy - v.ty) * f,
      })
    );
  }

  // Native wheel listener (non-passive) so we can preventDefault page scroll
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

  // ── Pointer (drag + pinch) handlers ─────────────────────────────────────────
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
    const pts = [...pointers.current.values()];

    if (pointers.current.size === 1) {
      panBy(geom, adjust, e.clientX - prev.x, e.clientY - prev.y);
    } else if (pointers.current.size === 2 && pinchRef.current && frameRef.current) {
      const [a, b] = pts;
      const rect = frameRef.current.getBoundingClientRect();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const fx = (a.x + b.x) / 2 - rect.left;
      const fy = (a.y + b.y) / 2 - rect.top;
      const factor = dist / pinchRef.current.dist;
      // Pan by the midpoint movement, then zoom around the new midpoint
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

  // ── Produce the cropped blob from the current view ──────────────────────────
  async function generateBlob(): Promise<Blob | null> {
    const img = imgRef.current;
    if (!geom || !view || !img) return null;
    const { scale, tx, ty } = view;
    // Visible region in the image's natural pixel coordinates
    const sx = -tx / scale;
    const sy = -ty / scale;
    const sw = geom.fw / scale;
    const sh = geom.fh / scale;

    const canvas = document.createElement("canvas");
    canvas.width = selectedSize.widthPx;
    canvas.height = selectedSize.heightPx;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, selectedSize.widthPx, selectedSize.heightPx);

    return new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.97);
    });
  }

  async function proceed() {
    setWorking(true);
    const blob = await generateBlob();
    setWorking(false);
    if (blob) onCropComplete(blob, selectedSize);
  }

  function handleNext() {
    if (faceOk === false && !showFaceWarning) {
      setShowFaceWarning(true);
      return;
    }
    proceed();
  }

  function setZoomFromSlider(value: number) {
    if (!geom) return;
    zoomTo(geom, adjust, value, geom.fw / 2, geom.fh / 2);
  }

  return (
    <div className="flex flex-col gap-5 py-6 px-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">Кадрирование</h2>
        <p className="text-sm text-gray-500 mt-1">
          Совместите лицо с овалом — это главный ориентир. Плечи должны быть видны внизу кадра
        </p>
      </div>

      {/* Photo-size format selector */}
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

      {/* Fixed crop viewport — the silhouette stays put, the photo moves */}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Исходное фото"
            onLoad={onImageLoad}
            draggable={false}
            className="absolute top-0 left-0 max-w-none select-none"
            style={{
              width: natural ? natural.w : undefined,
              height: natural ? natural.h : undefined,
              transformOrigin: "0 0",
              transform: view
                ? `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`
                : undefined,
              visibility: view ? "visible" : "hidden",
            }}
          />

          {/* Fixed portrait silhouette guide */}
          <div className="absolute inset-0 pointer-events-none">
            <PortraitSilhouette aspect={aspect} />
          </div>
        </div>

        {/* Zoom control */}
        {geom && (
          <div className="flex flex-col items-center gap-1 w-full max-w-sm">
            <div className="flex items-center gap-3 w-full">
              <span className="text-gray-400 text-lg leading-none select-none">−</span>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={adjust.zoom}
                onChange={(e) => setZoomFromSlider(parseFloat(e.target.value))}
                className="flex-1 accent-gray-900 cursor-pointer"
                aria-label="Масштаб"
              />
              <span className="text-gray-400 text-lg leading-none select-none">+</span>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Овал — голова с волосами · Верхняя пунктирная линия — отступ от края
            </p>
          </div>
        )}
      </div>

      {/* Face-not-detected warning (non-blocking) */}
      {showFaceWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm max-w-md mx-auto w-full">
          <p className="font-semibold text-amber-800">⚠ Лицо не обнаружено</p>
          <p className="text-amber-700 mt-1">
            На фотографии не найдено лицо человека. Убедитесь, что фото является
            портретным и лицо хорошо видно. Если всё верно — можно продолжить.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setShowFaceWarning(false)}
              className="flex-1 px-3 py-2 rounded-lg border border-amber-300 text-amber-800 text-xs font-medium hover:bg-amber-100 transition-colors"
            >
              ← Изменить фото
            </button>
            <button
              onClick={proceed}
              className="flex-1 px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors"
            >
              Продолжить всё равно
            </button>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between gap-3 max-w-md mx-auto w-full">
        <button
          onClick={onBack}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          ← Назад
        </button>
        <button
          onClick={handleNext}
          disabled={!geom || working}
          className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {working ? "Обработка…" : "Далее →"}
        </button>
      </div>
    </div>
  );
}

/**
 * Fixed passport-photo overlay guide.
 * Oval = primary target (align face/head). Shoulder arcs = secondary bottom guide.
 */
function PortraitSilhouette({ aspect }: { aspect: number }) {
  const paths = buildSilhouettePaths(aspect);
  const dash = {
    strokeDasharray: "6 4",
    strokeLinecap: "round" as const,
    fill: "none",
  } as const;

  return (
    <svg
      viewBox={`0 0 ${paths.W} ${paths.H}`}
      className="w-full h-full"
      preserveAspectRatio="none"
      style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,0.9))" }}
      aria-hidden="true"
    >
      {/* Head oval — primary alignment target (includes hair) */}
      <ellipse
        cx={paths.head.cx}
        cy={paths.head.cy}
        rx={paths.head.rx}
        ry={paths.head.ry}
        stroke="white"
        strokeWidth="2.2"
        {...dash}
      />
      {/* Top margin — hair must stay below this line */}
      <line
        x1={paths.head.cx - paths.head.rx}
        y1={paths.topMarginLine}
        x2={paths.head.cx + paths.head.rx}
        y2={paths.topMarginLine}
        stroke="white"
        strokeWidth="1"
        strokeDasharray="2 4"
        opacity="0.45"
      />
      {/* Eye-line helper */}
      <line
        x1={paths.eyeLine.x1}
        y1={paths.eyeLine.y}
        x2={paths.eyeLine.x2}
        y2={paths.eyeLine.y}
        stroke="white"
        strokeWidth="1.2"
        strokeDasharray="3 5"
        opacity="0.55"
      />
      {/* Shoulder guides — wide, gentle arcs at the bottom */}
      <path d={paths.leftShoulder} stroke="white" strokeWidth="1.8" {...dash} opacity="0.85" />
      <path d={paths.rightShoulder} stroke="white" strokeWidth="1.8" {...dash} opacity="0.85" />
    </svg>
  );
}
