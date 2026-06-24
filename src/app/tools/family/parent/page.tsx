import type { Metadata } from "next";
import { ParentHomeClient } from "./ParentHomeClient";

export const metadata: Metadata = {
  title: "Семья — родитель",
};

export default function ParentHomePage() {
  return <ParentHomeClient />;
}
