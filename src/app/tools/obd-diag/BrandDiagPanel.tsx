"use client";

import type { ObdBleSession, ObdConnectionPhase } from "@/lib/obd/obd-session";
import MutDiagPanel from "./MutDiagPanel";
import { MitsubishiSteeringPanel } from "./MitsubishiSteeringPanel";
import { SubaruSsmPanel } from "./SubaruSsmPanel";

export type BrandDiagBrand = "subaru" | "mitsubishi";
export type MitsubishiDiagView = "ecu" | "steering";

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
      className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
        active ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

export function BrandDiagPanel({
  brand,
  onBrandChange,
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
      <div className="flex min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-1">
        <SubTab active={brand === "subaru"} onClick={() => onBrandChange("subaru")}>
          Subaru
        </SubTab>
        <SubTab active={brand === "mitsubishi"} onClick={() => onBrandChange("mitsubishi")}>
          Mitsubishi
        </SubTab>
      </div>

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
          <div className="flex min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-1">
            <SubTab active={mitsuView === "ecu"} onClick={() => onMitsuViewChange("ecu")}>
              Блоки и live
            </SubTab>
            <SubTab active={mitsuView === "steering"} onClick={() => onMitsuViewChange("steering")}>
              Угол руля
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
          ) : (
            <MutDiagPanel session={session} phase={phase} />
          )}
        </>
      )}
    </section>
  );
}
