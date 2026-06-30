"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FamilyShell } from "../components/FamilyShell";
import { ChildPairQr } from "../components/ChildPairQr";
import { EmergencyCallButton } from "../components/EmergencyCallButton";
import { ChildShareLocationToggle } from "../components/ChildShareLocationToggle";
import { MiniMap } from "../components/MiniMap";
import { ParentsList } from "../components/ParentsList";
import { SelfParticipantRow } from "../components/SelfParticipantRow";
import { POLL_HIDDEN_MS, POLL_VISIBLE_MS } from "@/lib/family/constants";
import {
  createChildPairingApi,
  pollChildPairingApi,
  pollFamilyRoomApi,
  postLocationApi,
  setShareLocationApi,
  buildChildPairQrUrl,
} from "@/lib/family/client";
import { readBatteryLevel } from "@/lib/family/battery";
import { startGeoWatch } from "@/lib/family/geo";
import { childMapMemberUrl } from "@/lib/family/map-urls";
import {
  clearAllFamilyLocalData,
  clearChildPairingSession,
  clearChildSession,
  loadChildPairingSession,
  loadChildSession,
  saveChildPairingSession,
  saveChildSession,
} from "@/lib/family/session";
import type { ChildPairingSession, FamilyPollSnapshot, FamilySession } from "@/lib/family/types";

type View = "onboarding" | "waiting" | "paired";

export function ChildHomeClient() {
  const router = useRouter();
  const [view, setView] = useState<View>("onboarding");
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState<(ChildPairingSession & { qrUrl: string }) | null>(null);
  const [session, setSession] = useState<FamilySession | null>(null);
  const [snapshot, setSnapshot] = useState<FamilyPollSnapshot | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareWithParents, setShareWithParents] = useState(true);
  const [focusedMemberId, setFocusedMemberId] = useState<string | undefined>();
  const versionRef = useRef(0);

  function handleRoomGone() {
    clearAllFamilyLocalData();
    setSession(null);
    setSnapshot(null);
    router.replace("/tools/family");
  }

  useEffect(() => {
    const paired = loadChildSession();
    if (paired) {
      setSession(paired);
      setFocusedMemberId(paired.memberId);
      setView("paired");
      return;
    }
    const pending = loadChildPairingSession();
    if (pending) {
      setPairing({
        ...pending,
        qrUrl: buildChildPairQrUrl(pending.pairToken),
      });
      setName(pending.name);
      setView("waiting");
    }
  }, []);

  const pollPairing = useCallback(async () => {
    const p = loadChildPairingSession();
    if (!p) return;
    const result = await pollChildPairingApi(p);
    if (result.status === "expired") {
      clearChildPairingSession();
      setPairing(null);
      setView("onboarding");
      setGeoError("QR истёк. Создайте новый.");
      return;
    }
    if (result.status === "paired") {
      saveChildSession(result.session);
      clearChildPairingSession();
      setSession(result.session);
      setView("paired");
    }
  }, []);

  useEffect(() => {
    if (view !== "waiting") return;
    void pollPairing();
    const id = setInterval(() => void pollPairing(), 2000);
    return () => clearInterval(id);
  }, [view, pollPairing]);

  const pollRoom = useCallback(async () => {
    const s = loadChildSession();
    if (!s) return;
    const result = await pollFamilyRoomApi(s, versionRef.current, true);
    if (!result) return;
    if ("error" in result && result.error === "room_gone") {
      handleRoomGone();
      return;
    }
    if ("snapshot" in result && result.snapshot.members) {
      setSnapshot(result.snapshot);
      versionRef.current = result.version;
    }
  }, [router]);

  useEffect(() => {
    if (view !== "paired") return;
    void pollRoom();
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        await pollRoom();
        const ms = document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS;
        await new Promise((r) => setTimeout(r, ms));
      }
    };
    void loop();
    return () => {
      cancelled = true;
    };
  }, [view, pollRoom]);

  const selfMember = snapshot?.members.find((m) => m.memberId === session?.memberId);
  useEffect(() => {
    if (selfMember) {
      setShareWithParents(selfMember.shareLocationWithParents !== false);
    }
  }, [selfMember?.shareLocationWithParents]);

  useEffect(() => {
    if (view !== "paired" || !shareWithParents) return;
    const stop = startGeoWatch((pos) => {
      void (async () => {
        const s = loadChildSession();
        if (!s) return;
        const bat = await readBatteryLevel();
        try {
          await postLocationApi(s, {
            lat: pos.lat,
            lng: pos.lng,
            accuracy: pos.accuracy,
            battery: bat,
          });
          setGeoError(null);
        } catch (e) {
          setGeoError(e instanceof Error ? e.message : "Ошибка GPS");
        }
      })();
    });
    return stop;
  }, [view, shareWithParents]);

  async function handleShareToggle(enabled: boolean) {
    const s = loadChildSession();
    if (!s) return;
    setShareLoading(true);
    try {
      await setShareLocationApi(s, enabled, "parents");
      setShareWithParents(enabled);
      await pollRoom();
    } finally {
      setShareLoading(false);
    }
  }

  async function handleStartPairing() {
    if (!name.trim()) {
      setGeoError("Введите имя");
      return;
    }
    setLoading(true);
    setGeoError(null);
    try {
      const result = await createChildPairingApi(name.trim());
      const pairingSession: ChildPairingSession = {
        pairToken: result.pairToken,
        memberId: result.memberId,
        accessToken: result.accessToken,
        name: result.name,
      };
      saveChildPairingSession(pairingSession);
      setPairing(result);
      setView("waiting");
    } catch (e) {
      setGeoError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  const ownLocation = snapshot?.locations.find((l) => l.memberId === session?.memberId);
  const parents = snapshot?.parents ?? [];
  const sharingParents = parents.filter((p) => p.shareLocationWithChildren);
  const parentLocations =
    snapshot?.locations.filter((l) => sharingParents.some((p) => p.memberId === l.memberId)) ?? [];
  const selfOnMap = shareWithParents && ownLocation ? [ownLocation] : [];
  const mapLocations = [...selfOnMap, ...parentLocations];
  const mapMembers = session
    ? [
        ...(shareWithParents
          ? [{ memberId: session.memberId, role: "tracked" as const, name: session.name }]
          : []),
        ...sharingParents.map((p) => ({
          memberId: p.memberId,
          role: "observer" as const,
          name: p.name,
        })),
      ]
    : [];
  const mapFocusId = focusedMemberId ?? (shareWithParents ? session?.memberId : undefined);
  const isSelfFocused = !focusedMemberId || focusedMemberId === session?.memberId;

  function handleParentSelect(parentId: string) {
    const parent = parents.find((p) => p.memberId === parentId);
    if (!parent?.shareLocationWithChildren) return;
    const hasLoc = snapshot?.locations.some((l) => l.memberId === parentId);
    if (!hasLoc) return;
    setFocusedMemberId(parentId);
  }

  const sosPhone = snapshot?.room.sosPhone ?? null;

  if (view === "onboarding") {
    return (
      <FamilyShell title="Участник" subtitle="Созависимое лицо" backHref="/tools/family">
        <div className="p-3 space-y-3">
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Введите имя и покажите QR родителю. После сканирования вы будете привязаны к семье.
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваше имя"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
          {geoError && <p className="text-xs text-red-600">{geoError}</p>}
          <button
            type="button"
            onClick={handleStartPairing}
            disabled={loading}
            className="w-full rounded-lg bg-rose-600 text-white py-2 text-xs font-medium disabled:opacity-50"
          >
            {loading ? "Создание QR…" : "Показать QR для родителя"}
          </button>
          <a
            href="/tools/family-child/manifest.json"
            className="block text-center text-[11px] text-sky-600 underline"
          >
            Установить как отдельное приложение (PWA)
          </a>
        </div>
      </FamilyShell>
    );
  }

  if (view === "waiting" && pairing) {
    return (
      <FamilyShell title="Ожидание" subtitle="Покажите QR родителю" backHref="/tools/family">
        <ChildPairQr pairToken={pairing.pairToken} childName={pairing.name} />
        <p className="text-center text-[11px] text-gray-500 pb-6 animate-pulse">Ожидание привязки…</p>
        {geoError && <p className="text-xs text-red-600 text-center px-3">{geoError}</p>}
      </FamilyShell>
    );
  }

  return (
    <FamilyShell title={session?.roomName ?? "Семья"} subtitle="Участник" backHref="/tools/family">
      <div className="flex flex-col min-h-full pb-6">
        <div className="p-3 space-y-2">
          {geoError && <p className="text-[11px] text-red-600">{geoError}</p>}
          <div className="rounded-lg overflow-hidden border border-gray-200 h-36">
            {mapLocations.length > 0 ? (
              <MiniMap
                locations={mapLocations}
                members={mapMembers}
                sos={snapshot?.sos.filter((s) => s.memberId === session?.memberId) ?? []}
                focusMemberId={mapFocusId}
                selectedMemberId={mapFocusId}
                parentMemberIds={parents.map((p) => p.memberId)}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-[11px] text-gray-500 text-center px-3">
                {shareWithParents ? "Ожидание GPS…" : "Геопозиция скрыта от родителей"}
              </div>
            )}
          </div>

          <ChildShareLocationToggle
            enabled={shareWithParents}
            loading={shareLoading}
            onChange={(v) => void handleShareToggle(v)}
          />

          {session && (
            <SelfParticipantRow
              name={session.name}
              memberType={selfMember?.memberType}
              selected={isSelfFocused}
              onSelect={() => setFocusedMemberId(session.memberId)}
              mapHref={
                shareWithParents && ownLocation ? childMapMemberUrl(session.memberId) : null
              }
            />
          )}

          <ParentsList
            parents={parents}
            selectedId={!isSelfFocused ? focusedMemberId : undefined}
            onSelect={handleParentSelect}
            showSharingStatus
            canSelectParent={(p) =>
              p.shareLocationWithChildren &&
              (snapshot?.locations.some((l) => l.memberId === p.memberId) ?? false)
            }
            mapHrefFor={(p) => {
              if (!p.shareLocationWithChildren) return null;
              if (!snapshot?.locations.some((l) => l.memberId === p.memberId)) return null;
              return childMapMemberUrl(p.memberId);
            }}
          />
        </div>

        <div className="mx-3 mt-1 space-y-2 rounded-lg border border-gray-200 bg-gray-50/80 p-2.5 pb-3">
          <EmergencyCallButton phone={sosPhone} />
          <button
            type="button"
            onClick={() => {
              clearChildSession();
              setSession(null);
              setView("onboarding");
              router.replace("/tools/family");
            }}
            className="w-full text-xs text-gray-500 underline"
          >
            Выйти
          </button>
        </div>
      </div>
    </FamilyShell>
  );
}
