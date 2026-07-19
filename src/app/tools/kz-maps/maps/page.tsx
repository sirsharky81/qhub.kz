import type { Metadata } from "next";
import { KzMapsDownloadClient } from "./KzMapsDownloadClient";

export const metadata: Metadata = {
  title: "Офлайн-карты · KZ Maps",
};

export default function KzMapsMapsPage() {
  return <KzMapsDownloadClient />;
}
