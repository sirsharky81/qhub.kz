import type {
  EmailFormData,
  EventFormData,
  GeoFormData,
  PaymentFormData,
  PhoneFormData,
  QrFormData,
  TelegramFormData,
  TextFormData,
  VCardFormData,
  WhatsAppFormData,
  WifiFormData,
} from "./types";
import {
  buildInventoryPayload,
  buildStoragePayload,
  newStorageItem,
} from "./storageSerializers";

export function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,":])/g, "\\$1");
}

export function buildPaymentPayload(data: PaymentFormData): string {
  const lines: string[] = [];
  if (data.recipientName.trim()) lines.push(`Получатель: ${data.recipientName.trim()}`);
  if (data.purpose.trim()) lines.push(`Назначение: ${data.purpose.trim()}`);
  if (data.amount.trim()) lines.push(`Сумма: ${data.amount.trim()}`);
  if (data.cardOrPhone.trim()) lines.push(`Карта/телефон: ${data.cardOrPhone.trim()}`);
  if (data.iban.trim()) lines.push(`IBAN: ${data.iban.trim()}`);
  if (data.iinBin.trim()) lines.push(`ИИН/БИН: ${data.iinBin.trim()}`);
  return lines.join("\n");
}

export function buildVCardPayload(data: VCardFormData): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  const fn = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
  if (fn) lines.push(`FN:${fn}`);
  if (data.lastName.trim()) lines.push(`N:${data.lastName.trim()};${data.firstName.trim()};;;`);
  if (data.organization.trim()) lines.push(`ORG:${data.organization.trim()}`);
  if (data.phone.trim()) lines.push(`TEL;TYPE=CELL:${normalizeE164(data.phone.trim())}`);
  if (data.email.trim()) lines.push(`EMAIL:${data.email.trim()}`);
  if (data.website.trim()) lines.push(`URL:${data.website.trim()}`);
  if (data.birthday.trim()) {
    const bday = data.birthday.replace(/-/g, "");
    lines.push(`BDAY:${bday}`);
  }
  if (data.note.trim()) lines.push(`NOTE:${data.note.trim()}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function buildWifiPayload(data: WifiFormData): string {
  const enc = data.encryption === "nopass" ? "nopass" : data.encryption;
  const hidden = data.hidden ? "H:true;" : "";
  const pass =
    enc === "nopass" ? "" : `P:${escapeWifiValue(data.password)};`;
  return `WIFI:T:${enc};S:${escapeWifiValue(data.ssid)};${pass}${hidden};`;
}

export function buildWhatsAppPayload(data: WhatsAppFormData): string {
  const digits = data.phone.replace(/\D/g, "");
  if (!digits) return "";
  const base = `https://wa.me/${digits}`;
  if (!data.message.trim()) return base;
  return `${base}?text=${encodeURIComponent(data.message.trim())}`;
}

export function buildTelegramPayload(data: TelegramFormData): string {
  const username = data.username.replace(/^@/, "").trim();
  if (!username) return "";
  return `https://t.me/${username}`;
}

export function buildPhonePayload(data: PhoneFormData): string {
  const normalized = normalizeE164(data.phone.trim());
  if (!normalized) return "";
  return `tel:${normalized}`;
}

export function buildEmailPayload(data: EmailFormData): string {
  if (!data.email.trim()) return "";
  const params = new URLSearchParams();
  if (data.subject.trim()) params.set("subject", data.subject.trim());
  if (data.body.trim()) params.set("body", data.body.trim());
  const qs = params.toString();
  return qs ? `mailto:${data.email.trim()}?${qs}` : `mailto:${data.email.trim()}`;
}

export function buildGeoPayload(data: GeoFormData): string {
  const lat = parseFloat(data.latitude);
  const lng = parseFloat(data.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return "";
  return `geo:${lat},${lng}`;
}

function toIcsDate(isoLocal: string): string {
  const d = new Date(isoLocal);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function buildEventPayload(data: EventFormData): string {
  if (!data.title.trim() || !data.start) return "";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//QHub//QR Generator//RU",
    "BEGIN:VEVENT",
    `SUMMARY:${data.title.trim()}`,
  ];
  const dtStart = toIcsDate(data.start);
  if (dtStart) lines.push(`DTSTART:${dtStart}`);
  if (data.end) {
    const dtEnd = toIcsDate(data.end);
    if (dtEnd) lines.push(`DTEND:${dtEnd}`);
  }
  if (data.location.trim()) lines.push(`LOCATION:${data.location.trim()}`);
  if (data.description.trim()) lines.push(`DESCRIPTION:${data.description.trim()}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function buildTextPayload(data: TextFormData): string {
  return data.content.trim();
}

export function buildPayload(form: QrFormData): string {
  switch (form.type) {
    case "text":
      return buildTextPayload(form.data);
    case "payment":
      return buildPaymentPayload(form.data);
    case "vcard":
      return buildVCardPayload(form.data);
    case "wifi":
      return buildWifiPayload(form.data);
    case "whatsapp":
      return buildWhatsAppPayload(form.data);
    case "telegram":
      return buildTelegramPayload(form.data);
    case "phone":
      return buildPhonePayload(form.data);
    case "email":
      return buildEmailPayload(form.data);
    case "geo":
      return buildGeoPayload(form.data);
    case "event":
      return buildEventPayload(form.data);
    case "storage":
      return buildStoragePayload(form.data);
    case "inventory":
      return buildInventoryPayload(form.data);
  }
}

export function normalizeE164(phone: string): string {
  const cleaned = phone.replace(/[\s()-]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (/^\d+$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}

export function isValidE164(phone: string): boolean {
  const n = normalizeE164(phone);
  return /^\+[1-9]\d{6,14}$/.test(n);
}

export function isValidLatitude(lat: string): boolean {
  const n = parseFloat(lat);
  return !Number.isNaN(n) && n >= -90 && n <= 90;
}

export function isValidLongitude(lng: string): boolean {
  const n = parseFloat(lng);
  return !Number.isNaN(n) && n >= -180 && n <= 180;
}

export function isValidBirthday(date: string): boolean {
  if (!date) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function getFormLabel(form: QrFormData): string {
  switch (form.type) {
    case "text":
      return form.data.content.slice(0, 40) || "Текст";
    case "payment":
      return form.data.recipientName || "Реквизиты";
    case "vcard":
      return [form.data.firstName, form.data.lastName].filter(Boolean).join(" ") || "vCard";
    case "wifi":
      return form.data.ssid || "Wi-Fi";
    case "whatsapp":
      return form.data.phone || "WhatsApp";
    case "telegram":
      return `@${form.data.username.replace(/^@/, "")}` || "Telegram";
    case "phone":
      return form.data.phone || "Телефон";
    case "email":
      return form.data.email || "Email";
    case "geo":
      return `${form.data.latitude}, ${form.data.longitude}`;
    case "event":
      return form.data.title || "Событие";
    case "storage":
      return form.data.boxNumber || form.data.name || "Коробка";
    case "inventory":
      return form.data.inventoryNumber || "Инвентарная метка";
  }
}

export function emptyForm(type: QrFormData["type"]): QrFormData {
  switch (type) {
    case "text":
      return { type, data: { content: "" } };
    case "payment":
      return {
        type,
        data: {
          recipientName: "",
          purpose: "",
          amount: "",
          cardOrPhone: "",
          iban: "",
          iinBin: "",
          saveDespiteSensitive: false,
        },
      };
    case "vcard":
      return {
        type,
        data: {
          firstName: "",
          lastName: "",
          organization: "",
          phone: "",
          email: "",
          website: "",
          birthday: "",
          note: "",
        },
      };
    case "wifi":
      return { type, data: { ssid: "", password: "", encryption: "WPA", hidden: false } };
    case "whatsapp":
      return { type, data: { phone: "", message: "" } };
    case "telegram":
      return { type, data: { username: "" } };
    case "phone":
      return { type, data: { phone: "" } };
    case "email":
      return { type, data: { email: "", subject: "", body: "" } };
    case "geo":
      return { type, data: { latitude: "", longitude: "" } };
    case "event":
      return { type, data: { title: "", location: "", start: "", end: "", description: "" } };
    case "storage":
      return {
        type,
        data: {
          name: "",
          boxNumber: "",
          comment: "",
          locationType: "",
          locationNumber: "",
          locationSection: "",
          items: [],
        },
      };
    case "inventory":
      return {
        type,
        data: {
          inventoryNumber: "",
          code: "",
          itemName: "",
          category: "",
          department: "",
          responsible: "",
          entryDate: "",
          initialCost: "",
          condition: "",
        },
      };
  }
}
