"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { FamilyLocation, FamilyMemberPublic, FamilySosState } from "@/lib/family/types";

function pinDivIcon(fill: string, opts?: { selected?: boolean; sos?: boolean }): L.DivIcon {
  const w = opts?.selected ? 36 : 32;
  const h = opts?.selected ? 47 : 42;
  const glow = opts?.selected
    ? "filter:drop-shadow(0 0 6px rgba(37,99,235,0.55));"
    : opts?.sos
      ? "filter:drop-shadow(0 0 6px rgba(239,68,68,0.55));"
      : "filter:drop-shadow(0 2px 4px rgba(0,0,0,0.28));";
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 32 42" style="${glow}" aria-hidden="true">
      <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 26 16 26s16-14 16-26C32 7.2 24.8 0 16 0z" fill="${fill}" stroke="#fff" stroke-width="2"/>
      <circle cx="16" cy="15" r="5.5" fill="#fff" fill-opacity="0.95"/>
    </svg>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 10],
  });
}

const trackedPinIcon = pinDivIcon("#2563eb");
const trackedSelectedPinIcon = pinDivIcon("#2563eb", { selected: true });
const trackedSosPinIcon = pinDivIcon("#ef4444", { sos: true });

const parentIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#059669;border:3px solid white;box-shadow:0 0 0 6px rgba(5,150,105,0.35);"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function MapViewController({
  locations,
  focusMemberId,
  interactive,
}: {
  locations: FamilyLocation[];
  focusMemberId?: string;
  interactive: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (locations.length === 0) return;
    if (focusMemberId) {
      const loc = locations.find((l) => l.memberId === focusMemberId);
      if (loc) {
        map.flyTo([loc.lat, loc.lng], 16, { duration: 0.6 });
        return;
      }
    }
    if (!interactive) return;
    const bounds = L.latLngBounds(locations.map((l) => [l.lat, l.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.25), { maxZoom: 16 });
  }, [locations, focusMemberId, map, interactive]);
  return null;
}

export interface FamilyMapProps {
  locations: FamilyLocation[];
  members: FamilyMemberPublic[];
  sos: FamilySosState[];
  height?: string;
  interactive?: boolean;
  className?: string;
  focusMemberId?: string;
  selectedMemberId?: string;
  parentMemberIds?: string[];
}

function memberName(members: FamilyMemberPublic[], memberId: string): string {
  return members.find((m) => m.memberId === memberId)?.name ?? "Участник";
}

function markerIcon(
  memberId: string,
  sosIds: Set<string>,
  selectedMemberId: string | undefined,
  parentIds: Set<string>,
) {
  if (parentIds.has(memberId)) return parentIcon;
  if (sosIds.has(memberId)) return trackedSosPinIcon;
  if (selectedMemberId === memberId) return trackedSelectedPinIcon;
  return trackedPinIcon;
}

export function FamilyMap({
  locations,
  members,
  sos,
  height = "100%",
  interactive = true,
  className = "",
  focusMemberId,
  selectedMemberId,
  parentMemberIds,
}: FamilyMapProps) {
  const center: [number, number] =
    locations.length > 0
      ? [locations[0]!.lat, locations[0]!.lng]
      : [43.238949, 76.889709];

  const sosIds = new Set(sos.filter((s) => s.active).map((s) => s.memberId));
  const parentIds = new Set(parentMemberIds ?? []);

  return (
    <div className={className} style={{ height, width: "100%" }}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={interactive}
        dragging={interactive}
        zoomControl={interactive}
        className="h-full w-full z-0"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewController
          locations={locations}
          focusMemberId={focusMemberId}
          interactive={interactive}
        />
        {locations.map((loc) => (
          <Marker
            key={loc.memberId}
            position={[loc.lat, loc.lng]}
            icon={markerIcon(loc.memberId, sosIds, selectedMemberId, parentIds)}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{memberName(members, loc.memberId)}</p>
                {loc.battery != null && <p>Заряд: {loc.battery}%</p>}
                <p className="text-gray-500 text-xs">
                  {new Date(loc.updatedAt).toLocaleString("ru-RU")}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
