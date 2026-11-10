"use client";

import type { ObdBleSession, ObdConnectionPhase } from "@/lib/obd/obd-session";
import MutDiagPanel from "./MutDiagPanel";
import { MitsubishiSteeringPanel } from "./MitsubishiSteeringPanel";
import { MitsubishiTpmsPanel } from "./MitsubishiTpmsPanel";
import { SubaruSsmPanel } from "./SubaruSsmPanel";

export type BrandDiagBrand = "subaru" | "mitsubishi";
export type MitsubishiDiagView = "faults" | "ecu" | "service" | "steering" | "tpms";

interface Props {
  brand: BrandDiagBrand;
  onBrandChange: (brand: BrandDiagBrand) => void;
  mitsuView: MitsubishiDiagView;
  onMitsuViewChange: (view: MitsubishiDiagView) => void;
  session: ObdBleSession;
  phase: ObdConnectionPhase;
  ready: boolean;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  vinHint?: string | null;
}

function SubTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[4.6rem] flex-1 rounded-lg px-1.5 py-2 text-[11px] font-semibold leading-tight transition ${
        active ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

export function BrandDiagPanel({
  brand,
  mitsuView,
  onMitsuViewChange,
  session,
  phase,
  ready,
  busy,
  setBusy,
  setError,
  vinHint,
}: Props) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      {brand === "subaru" ? (
        <SubaruSsmPanel
          session={session}
          ready={ready}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          vinHint={vinHint}
        />
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap rounded-xl border border-gray-200 bg-gray-50 p-1">
            <SubTab active={mitsuView === "faults"} onClick={() => onMitsuViewChange("faults")}>
              Ошибки
            </SubTab>
            <SubTab active={mitsuView === "ecu"} onClick={() => onMitsuViewChange("ecu")}>
              Блоки и live
            </SubTab>
            <SubTab active={mitsuView === "service"} onClick={() => onMitsuViewChange("service")}>
              Сервис и тесты
            </SubTab>
            <SubTab active={mitsuView === "steering"} onClick={() => onMitsuViewChange("steering")}>
              Угол руля
            </SubTab>
            <SubTab active={mitsuView === "tpms"} onClick={() => onMitsuViewChange("tpms")}>
              Датчики TPMS
            </SubTab>
          </div>
          {mitsuView === "steering" ? (
            <MitsubishiSteeringPanel
              session={session}
              phase={phase}
              busy={busy}
              setBusy={setBusy}
              setError={setError}
            />
          ) : mitsuView === "tpms" ? (
            <MitsubishiTpmsPanel session={session} phase={phase} busy={busy} />
          ) : (
            <MutDiagPanel
              session={session}
              phase={phase}
              section={mitsuView === "faults" ? "faults" : mitsuView === "service" ? "service" : "live"}
              onShowLive={() => onMitsuViewChange("ecu")}
              vinHint={vinHint}
            />
          )}
        </>
      )}
    </section>
  );
}
