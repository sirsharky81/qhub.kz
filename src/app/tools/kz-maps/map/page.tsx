import type { Metadata } from "next";
import { KzMapsMapClient } from "./KzMapsMapClient";

export const metadata: Metadata = {
  title: "Карта — KZ Maps | QHub",
  description: "Интерактивная карта Казахстана с достопримечательностями.",
};

export default function KzMapsMapPage() {
  return <KzMapsMapClient />;
}
