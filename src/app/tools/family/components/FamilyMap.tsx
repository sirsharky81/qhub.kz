"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { FamilyLocation, FamilyMemberPublic, FamilySosState } from "@/lib/family/types";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const selectedIcon = L.divIcon({
  className: "",
  html: `<div style="width:32px;height:32px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 6px rgba(37,99,235,0.35);"></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const sosIcon = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 0 0 6px rgba(239,68,68,0.35);"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

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
  if (sosIds.has(memberId)) return sosIcon;
  if (selectedMemberId === memberId) return selectedIcon;
  if (parentIds.has(memberId)) return parentIcon;
  return defaultIcon;
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
