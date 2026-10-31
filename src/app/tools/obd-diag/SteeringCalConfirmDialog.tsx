"use client";

export type SteeringCalBrand = "mitsubishi" | "subaru";

interface Props {
  brand: SteeringCalBrand;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function SteeringCalConfirmDialog({ brand, open, onCancel, onConfirm }: Props) {
  if (!open) return null;

  const isMitsu = brand === "mitsubishi";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="steering-cal-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-amber-300 bg-white p-5 shadow-xl shadow-gray-300/50"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="steering-cal-title" className="text-base font-bold text-amber-900">
          {isMitsu ? "Калибровка руля Mitsubishi (SAS)" : "Калибровка нуля руля Subaru (VDC)"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-800">
          {isMitsu ? (
            <>
              Блок SAS (<span className="font-mono text-xs text-emerald-700">622 → 484</span>) запишет
              нулевую точку, затем перезапустится VDC (
              <span className="font-mono text-xs text-emerald-700">784 → 785</span>). KWP{" "}
              <span className="font-mono text-xs">31 02</span> /{" "}
              <span className="font-mono text-xs">31 01</span>.
            </>
          ) : (
            <>
              Блок ABS/VDC (<span className="font-mono text-xs text-emerald-700">7B0 → 7B8</span>)
              выполнит режим «VDC Sensor Midpoint» (как в SSM: нуль датчика угла и G-сенсора). Угол
              контролируется на EPS <span className="font-mono text-xs">746 · DID 1041</span>.
            </>
          )}
        </p>
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-50 p-3 text-xs text-amber-900/90">
          <p className="font-semibold text-amber-900">Перед согласием проверьте:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-gray-700">
            <li>Ровная площадка, автомобиль неподвижен</li>
            <li>Колёса и руль строго прямо (около 0.0° по live-опросу)</li>
            <li>Зажигание ON{isMitsu ? ", селектор P или N" : ", ручник затянут"}</li>
          </ul>
          <p className="mt-2 text-amber-900/90">
            Неверный нуль ухудшит работу VDC/ESP и EyeSight; при сомнениях используйте официальный
            Subaru Select Monitor.
          </p>
        </div>
        <p className="mt-4 text-sm font-medium text-gray-900">
          Вы согласны выполнить калибровку нулевого положения руля?
        </p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-xl border border-gray-300 bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-200"
            onClick={onCancel}
          >
            Нет, отмена
          </button>
          <button
            type="button"
            className="rounded-xl border border-gray-900 bg-gray-900 hover:bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            onClick={onConfirm}
          >
            Да, откалибровать
          </button>
        </div>
      </div>
    </div>
  );
}
