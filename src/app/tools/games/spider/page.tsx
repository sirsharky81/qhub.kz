import type { Metadata } from "next";
import SpiderClient from "./SpiderClient";

export const metadata: Metadata = {
  title: "Пасьянс «Паук» — QHub Games",
  description: "Классический пасьянс Паук на 1, 2 или 4 масти. Две колоды, 10 столбцов.",
};

export default function SpiderPage() {
  return <SpiderClient />;
}
