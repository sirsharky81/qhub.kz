export type QrLocale = "ru" | "kk" | "en";

export type QrType =
  | "text"
  | "payment"
  | "vcard"
  | "wifi"
  | "whatsapp"
  | "telegram"
  | "phone"
  | "email"
  | "geo"
  | "event"
  | "storage"
  | "inventory";

export type StorageLocationType =
  | "cabinet"
  | "rack"
  | "garage"
  | "warehouse"
  | "room"
  | "shelf"
  | "other";

export type CodeMarkType = "qr" | "barcode" | "both";

export type LabelFormat =
  | "standard"
  | "40x30"
  | "58x40"
  | "a4-grid"
  | "mini-20"
  | "mini-25"
  | "mini-30";

export interface LabelOptions {
  codeType: CodeMarkType;
  labelFormat: LabelFormat;
}

export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";

export type WifiEncryption = "WPA" | "WEP" | "nopass";

export interface QrSettings {
  size: number;
  foreground: string;
  background: string;
  errorCorrectionLevel: ErrorCorrectionLevel;
  logoDataUrl: string | null;
  logoSizePercent: number;
}

export interface TextFormData {
  content: string;
}

export interface PaymentFormData {
  recipientName: string;
  purpose: string;
  amount: string;
  cardOrPhone: string;
  iban: string;
  iinBin: string;
  saveDespiteSensitive: boolean;
}

export interface VCardFormData {
  firstName: string;
  lastName: string;
  organization: string;
  phone: string;
  email: string;
  website: string;
  birthday: string;
  note: string;
}

export interface WifiFormData {
  ssid: string;
  password: string;
  encryption: WifiEncryption;
  hidden: boolean;
}

export interface WhatsAppFormData {
  phone: string;
  message: string;
}

export interface TelegramFormData {
  username: string;
}

export interface PhoneFormData {
  phone: string;
}

export interface EmailFormData {
  email: string;
  subject: string;
  body: string;
}

export interface GeoFormData {
  latitude: string;
  longitude: string;
}

export interface EventFormData {
  title: string;
  location: string;
  start: string;
  end: string;
  description: string;
}

export interface StorageItemRow {
  id: string;
  name: string;
  quantity: number;
  comment: string;
}

export interface StorageFormData {
  name: string;
  boxNumber: string;
  comment: string;
  locationType: StorageLocationType | "";
  locationNumber: string;
  locationSection: string;
  items: StorageItemRow[];
}

export interface InventoryFormData {
  inventoryNumber: string;
  itemName: string;
  department: string;
  responsible: string;
  serialNumber: string;
  comment: string;
}

export type QrFormData =
  | { type: "text"; data: TextFormData }
  | { type: "payment"; data: PaymentFormData }
  | { type: "vcard"; data: VCardFormData }
  | { type: "wifi"; data: WifiFormData }
  | { type: "whatsapp"; data: WhatsAppFormData }
  | { type: "telegram"; data: TelegramFormData }
  | { type: "phone"; data: PhoneFormData }
  | { type: "email"; data: EmailFormData }
  | { type: "geo"; data: GeoFormData }
  | { type: "event"; data: EventFormData }
  | { type: "storage"; data: StorageFormData }
  | { type: "inventory"; data: InventoryFormData };

export interface QrHistoryEntry {
  id: string;
  type: QrType;
  label: string;
  payload: string;
  formSnapshot: QrFormData;
  settings: QrSettings;
  createdAt: number;
}

export interface QrTemplate {
  id: string;
  name: string;
  type: QrType;
  formSnapshot: QrFormData;
  settings: Partial<QrSettings>;
  createdAt: number;
}

export interface QrGenerationResult {
  dataUrl: string | null;
  svg: string | null;
  payload: string;
  error: string | null;
  contrastWarning: boolean;
  decodeOk: boolean | null;
  effectiveEcc: ErrorCorrectionLevel;
}

export const DEFAULT_SETTINGS: QrSettings = {
  size: 400,
  foreground: "#000000",
  background: "#ffffff",
  errorCorrectionLevel: "M",
  logoDataUrl: null,
  logoSizePercent: 20,
};

export const DEFAULT_LABEL_OPTIONS: LabelOptions = {
  codeType: "qr",
  labelFormat: "standard",
};

export const QR_TYPES: QrType[] = [
  "text",
  "storage",
  "inventory",
  "payment",
  "vcard",
  "wifi",
  "whatsapp",
  "telegram",
  "phone",
  "email",
  "geo",
  "event",
];

export const SERVICE_URL = "https://qhub.kz/tools/qr-generator";
