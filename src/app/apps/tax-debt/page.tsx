import type { Metadata } from "next";
import { PdfToolLayout } from "@/app/tools/_pdf-shared/PdfToolLayout";
import TaxDebtClient from "./TaxDebtClient";

export const metadata: Metadata = {
  title: "Сведения об отсутствии налоговой задолженности — QHub",
  description:
    "Проверьте отсутствие или наличие налоговой задолженности по ИИН/БИН через официальный API портала КГД МФ РК.",
};

export default function TaxDebtPage() {
  return (
    <PdfToolLayout
      title="Налоговая задолженность"
      icon="🏛️"
      shellClassName="fixed inset-x-0 top-[var(--messenger-vv-top,0px)] h-[var(--messenger-vvh,100dvh)] bg-white overflow-hidden print:static print:h-auto print:overflow-visible"
    >
      <TaxDebtClient />
    </PdfToolLayout>
  );
}
