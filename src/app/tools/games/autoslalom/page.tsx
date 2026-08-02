import type { Metadata } from "next";
import AutoslalomClient from "./AutoslalomClient";

export const metadata: Metadata = {
  title: "Автослалом — Электроника ИМ-23 — QHub Games",
  description:
    "Советская карманная игра «Электроника ИМ-23 Автослалом»: три полосы, барьеры, часы и будильник.",
};

export default function AutoslalomPage() {
  return <AutoslalomClient />;
}
