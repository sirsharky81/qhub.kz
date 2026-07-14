import type { Metadata } from "next";
import { KzMapsHomeClient } from "./KzMapsHomeClient";

export const metadata: Metadata = {
  title: "KZ Maps — карты, треки и места Казахстана | QHub",
  description:
    "Карты Казахстана, каталог достопримечательностей, запись треков GPX и маршруты. Офлайн-регионы и походные точки.",
  openGraph: {
    title: "KZ Maps | QHub",
    description: "Карты, треки и красивые места Казахстана.",
    url: "https://qhub.kz/tools/kz-maps",
    siteName: "QHub",
    locale: "ru_KZ",
    type: "website",
  },
};

export default function KzMapsPage() {
  return <KzMapsHomeClient />;
}
