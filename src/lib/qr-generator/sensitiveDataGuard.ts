import type { PaymentFormData, QrFormData } from "./types";

export function hasSensitivePaymentData(data: PaymentFormData): boolean {
  return Boolean(data.iinBin.trim());
}

export function shouldSaveToHistory(form: QrFormData): boolean {
  if (form.type === "payment" && hasSensitivePaymentData(form.data)) {
    return form.data.saveDespiteSensitive;
  }
  return true;
}
