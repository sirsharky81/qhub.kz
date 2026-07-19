import type { Metadata } from "next";
import { KzMapsSuggestClient } from "./KzMapsSuggestClient";

export const metadata: Metadata = {
  title: "Предложить место · KZ Maps",
};

export default function KzMapsSuggestPage() {
  return <KzMapsSuggestClient />;
}
