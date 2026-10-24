import { createHmac, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as core from "@/lib/redis/commands";
import { getRedisBackend } from "@/lib/redis/env";

const REDIS_ETACS_BILLING_KEY = "qhub:etacs:billing:v1";
const FILE_PATH = join(process.cwd(), ".data", "etacs-billing.json");

/**
 * Уровень доступа для конкретного VIN:
 * - `cuf_only`: открыто сохранение и запись только `.cuf` (Custom Coding — зеркала, свет, замки, дворники)
 * - `full`: открыто сохранение и запись и `.kon` (Variant Coding ETACS + ДВС), и `.cuf`
 */
export type EtacsVinAccessScope = "cuf_only" | "full";

export interface EtacsUnlockedVinRecord {
  vin: string;
  /** По умолчанию `"full"` для обратной совместимости */
  scope?: EtacsVinAccessScope;
  ecuId?: string;
  contact?: string;
  note?: string;
  unlockedAt: string;
  expiresAt?: string | null;
  source: "admin" | "promo" | "request";
}

export interface EtacsPromoCodeRecord {
  code: string;
  /**
   * - `cuf_single_vin`: доступ только к `.cuf` на 1 VIN (народный тариф)
   * - `single_vin`: полный доступ (`.kon` + `.cuf`) на 1 VIN
   * - `multi_vin`: полный доступ (`.kon` + `.cuf`) на N автомобилей
   * - `pro_unlimited`: безлимит на любые автомобили (`.kon` + `.cuf`) на срок, с антифрод-лимитом устройств
   */
  kind: "cuf_single_vin" | "single_vin" | "multi_vin" | "pro_unlimited";
  maxUses: number;
  usedCount: number;
  usedVins: string[];
  /** Антифрод для PRO-ключей: максимальное число привязанных устройств (по умолчанию 2 для PRO Мастер, 3 для PRO СТО) */
  maxDevices?: number;
  /** Список привязанных ID устройств (браузеров/телефонов) */
  boundDevices?: string[];
  durationDays?: number | null;
  note?: string;
  createdAt: string;
  expiresAt?: string | null;
  active: boolean;
}

export interface EtacsUnlockRequestRecord {
  id: string;
  vin: string;
  ecuId?: string;
  contact: string;
  plan: "cuf_vin" | "single_vin" | "pro_month" | "pro_year";
  currency?: "KZT" | "RUB";
  comment?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt?: string | null;
  grantedPromoCode?: string | null;
}

export interface EtacsBillingSettings {
  /**
   * Когда `enforcePaywall === false`, сохранение и запись работают свободно для всех (режим открытого теста),
   * но статус и кабинет лицензий уже видны. Когда `true` — сохранение и запись в блок требуют
   * разблокированного VIN (по уровню `.cuf` или `.kon + .cuf`), активного PRO-кода или сессии администратора QHub.
   */
  enforcePaywall: boolean;
  /** Народный тариф (КЗ): только Custom Coding (.cuf — зеркала, комфорт) на 1 VIN в ₸ */
  cufVinPriceKzt: number;
  /** Полный тариф (КЗ) на 1 VIN: Variant (.kon) + Custom (.cuf) в ₸ */
  singleVinPriceKzt: number;
  proMonthPriceKzt: number;
  proYearPriceKzt: number;
  /** Народный тариф (РФ / СБП): только Custom Coding (.cuf) на 1 VIN в ₽ */
  cufVinPriceRub?: number;
  /** Полный тариф (РФ / СБП) на 1 VIN: Variant (.kon) + Custom (.cuf) в ₽ */
  singleVinPriceRub?: number;
  proMonthPriceRub?: number;
  proYearPriceRub?: number;
  paymentInstructions: string;
  kaspiPhoneOrLink: string;
  sbpInstructions?: string;
  sbpPhoneOrBank?: string;
}

export interface EtacsBillingStoreData {
  settings: EtacsBillingSettings;
  unlockedVins: Record<string, EtacsUnlockedVinRecord>;
  promoCodes: Record<string, EtacsPromoCodeRecord>;
  requests: EtacsUnlockRequestRecord[];
}

function defaultSettings(): EtacsBillingSettings {
  const envEnforce = process.env.ETACS_PAYWALL_ENFORCED;
  return {
    enforcePaywall: envEnforce === "1" || envEnforce === "true",
    cufVinPriceKzt: 1500,
    singleVinPriceKzt: 3500,
    proMonthPriceKzt: 8000,
    proYearPriceKzt: 30000,
    cufVinPriceRub: 300,
    singleVinPriceRub: 700,
    proMonthPriceRub: 1600,
    proYearPriceRub: 6000,
    paymentInstructions:
      "Переведите сумму выбранного тарифа на Kaspi и укажите ваш телефон или Telegram в заявке ниже. После подтверждения доступ к VIN или PRO-код активируется мгновенно.",
    kaspiPhoneOrLink: process.env.ETACS_KASPI_CONTACT?.trim() || "По номеру Kaspi / в Telegram",
    sbpInstructions:
      "Переведите сумму выбранного тарифа по СБП (Система быстрых платежей) или на карту РФ и укажите ваш телефон / Telegram и имя отправителя в заявке ниже.",
    sbpPhoneOrBank: process.env.ETACS_SBP_CONTACT?.trim() || "По номеру телефона СБП / в Telegram",
  };
}

function defaultStore(): EtacsBillingStoreData {
  return {
    settings: defaultSettings(),
    unlockedVins: {},
    promoCodes: {},
    requests: [],
  };
}

let inMemoryFallback: EtacsBillingStoreData | null = null;

export function resetEtacsBillingMemoryCache(): void {
  inMemoryFallback = null;
}

function normalizeStore(raw: Partial<EtacsBillingStoreData> | null): EtacsBillingStoreData {
  const def = defaultStore();
  if (!raw || typeof raw !== "object") return def;
  return {
    settings: {
      ...def.settings,
      ...(raw.settings ?? {}),
    },
    unlockedVins: raw.unlockedVins && typeof raw.unlockedVins === "object" ? raw.unlockedVins : {},
    promoCodes: raw.promoCodes && typeof raw.promoCodes === "object" ? raw.promoCodes : {},
    requests: Array.isArray(raw.requests) ? raw.requests : [],
  };
}

export async function loadEtacsBillingStore(): Promise<EtacsBillingStoreData> {
  if (getRedisBackend()) {
    try {
      const raw = await core.redisGet(REDIS_ETACS_BILLING_KEY);
      if (raw) {
        return normalizeStore(JSON.parse(raw) as Partial<EtacsBillingStoreData>);
      }
    } catch {
      /* fallback to file/memory */
    }
  }

  try {
    const raw = await readFile(FILE_PATH, "utf8");
    const parsed = normalizeStore(JSON.parse(raw) as Partial<EtacsBillingStoreData>);
    inMemoryFallback = parsed;
    return parsed;
  } catch {
    if (inMemoryFallback) return inMemoryFallback;
    const init = defaultStore();
    inMemoryFallback = init;
    return init;
  }
}

export async function saveEtacsBillingStore(data: EtacsBillingStoreData): Promise<void> {
  inMemoryFallback = data;
  if (getRedisBackend()) {
    try {
      await core.redisSet(REDIS_ETACS_BILLING_KEY, JSON.stringify(data));
      return;
    } catch {
      /* fallback to file */
    }
  }
  try {
    await mkdir(join(process.cwd(), ".data"), { recursive: true });
    await writeFile(FILE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch {
    /* read-only fs in test environments keeps inMemoryFallback */
  }
}

export function normalizeVin(vin: string | undefined | null): string {
  return String(vin ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .trim();
}

export function normalizePromoCode(code: string | undefined | null): string {
  return String(code ?? "")
    .replace(/[^A-Za-z0-9\-]/g, "")
    .toUpperCase()
    .trim();
}

export function normalizeDeviceId(deviceId: string | undefined | null): string {
  return String(deviceId ?? "")
    .replace(/[^A-Za-z0-9\-_]/g, "")
    .slice(0, 64)
    .trim();
}

export function detectFileKindForBilling(
  fileName?: string | null,
  codingHex?: string | null,
): "kon" | "cuf" {
  const lower = String(fileName ?? "").toLowerCase();
  if (/\.cuf(?=$|[^a-z])/i.test(lower)) return "cuf";
  if (/\.kon(?=$|[^a-z])/i.test(lower)) return "kon";
  const cleanHex = String(codingHex ?? "").replace(/\s+/g, "");
  // ETACS .cuf is 65 bytes (130 hex chars), whereas .kon is 90 bytes (180 hex chars)
  if (cleanHex.length === 130) return "cuf";
  return "kon";
}

function isNotExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return true;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return true;
  return ts > Date.now();
}

export interface EtacsAccessCheckResult {
  allowed: boolean;
  /** Разрешено ли сохранение/запись `.cuf` для этого VIN */
  allowedCuf: boolean;
  /** Разрешено ли сохранение/запись `.kon` (и `.cuf`) для этого VIN */
  allowedKon: boolean;
  enforcePaywall: boolean;
  reason:
    | "admin"
    | "paywall_disabled"
    | "vin_unlocked_full"
    | "vin_unlocked_cuf"
    | "pro_code"
    | "pro_device_limit_exceeded"
    | "cuf_only_need_kon_upgrade"
    | "locked";
  vin: string;
  fileKind: "kon" | "cuf";
  vinRecord?: EtacsUnlockedVinRecord | null;
  promoRecord?: {
    code: string;
    kind: EtacsPromoCodeRecord["kind"];
    remainingUses: number;
    maxDevices?: number;
    boundDevicesCount?: number;
    expiresAt?: string | null;
  } | null;
  settings: EtacsBillingSettings;
}

export async function checkEtacsAccess(options: {
  vin?: string | null;
  promoCode?: string | null;
  deviceId?: string | null;
  fileKind?: "kon" | "cuf" | null;
  isAdmin?: boolean;
}): Promise<EtacsAccessCheckResult> {
  const store = await loadEtacsBillingStore();
  const vin = normalizeVin(options.vin);
  const code = normalizePromoCode(options.promoCode);
  const deviceId = normalizeDeviceId(options.deviceId);
  const fileKind: "kon" | "cuf" = options.fileKind === "cuf" ? "cuf" : "kon";

  const vinRec = vin ? store.unlockedVins[vin] : undefined;
  const validVinRec = vinRec && isNotExpired(vinRec.expiresAt) ? vinRec : null;
  const vinScope: EtacsVinAccessScope | null = validVinRec
    ? validVinRec.scope ?? "full"
    : null;

  const promoRec = code ? store.promoCodes[code] : undefined;
  const validPromo =
    promoRec &&
    promoRec.active &&
    isNotExpired(promoRec.expiresAt) &&
    (promoRec.kind === "pro_unlimited" ||
      promoRec.usedVins.includes(vin) ||
      promoRec.usedCount < promoRec.maxUses)
      ? promoRec
      : null;

  let proDeviceBlocked = false;
  if (validPromo && validPromo.kind === "pro_unlimited" && deviceId) {
    const maxDev = validPromo.maxDevices ?? 2;
    const bound = validPromo.boundDevices ?? [];
    if (!bound.includes(deviceId)) {
      if (bound.length >= maxDev) {
        proDeviceBlocked = true;
      } else {
        bound.push(deviceId);
        validPromo.boundDevices = bound;
        await saveEtacsBillingStore(store);
      }
    }
  }

  const promoSummary = validPromo
    ? {
        code: validPromo.code,
        kind: validPromo.kind,
        remainingUses:
          validPromo.kind === "pro_unlimited"
            ? 9999
            : Math.max(0, validPromo.maxUses - validPromo.usedCount),
        maxDevices: validPromo.maxDevices ?? (validPromo.kind === "pro_unlimited" ? 2 : undefined),
        boundDevicesCount: validPromo.boundDevices?.length ?? 0,
        expiresAt: validPromo.expiresAt,
      }
    : null;

  if (options.isAdmin) {
    return {
      allowed: true,
      allowedCuf: true,
      allowedKon: true,
      enforcePaywall: store.settings.enforcePaywall,
      reason: "admin",
      vin,
      fileKind,
      vinRecord: validVinRec,
      promoRecord: promoSummary,
      settings: store.settings,
    };
  }

  if (proDeviceBlocked) {
    return {
      allowed: false,
      allowedCuf: false,
      allowedKon: false,
      enforcePaywall: store.settings.enforcePaywall,
      reason: "pro_device_limit_exceeded",
      vin,
      fileKind,
      vinRecord: validVinRec,
      promoRecord: promoSummary,
      settings: store.settings,
    };
  }

  // Full PRO code or full multi/single VIN promo code
  if (validPromo && validPromo.kind !== "cuf_single_vin") {
    return {
      allowed: true,
      allowedCuf: true,
      allowedKon: true,
      enforcePaywall: store.settings.enforcePaywall,
      reason: "pro_code",
      vin,
      fileKind,
      vinRecord: validVinRec,
      promoRecord: promoSummary,
      settings: store.settings,
    };
  }

  // Full VIN unlock
  if (vinScope === "full") {
    return {
      allowed: true,
      allowedCuf: true,
      allowedKon: true,
      enforcePaywall: store.settings.enforcePaywall,
      reason: "vin_unlocked_full",
      vin,
      fileKind,
      vinRecord: validVinRec,
      promoRecord: promoSummary,
      settings: store.settings,
    };
  }

  // CUF-only VIN unlock (or CUF-only promo code)
  const hasCufAccess =
    vinScope === "cuf_only" || Boolean(validPromo && validPromo.kind === "cuf_single_vin");

  if (!store.settings.enforcePaywall) {
    return {
      allowed: true,
      allowedCuf: true,
      allowedKon: true,
      enforcePaywall: false,
      reason: hasCufAccess ? "vin_unlocked_cuf" : "paywall_disabled",
      vin,
      fileKind,
      vinRecord: validVinRec,
      promoRecord: promoSummary,
      settings: store.settings,
    };
  }

  if (hasCufAccess) {
    if (fileKind === "cuf") {
      return {
        allowed: true,
        allowedCuf: true,
        allowedKon: false,
        enforcePaywall: true,
        reason: "vin_unlocked_cuf",
        vin,
        fileKind,
        vinRecord: validVinRec,
        promoRecord: promoSummary,
        settings: store.settings,
      };
    }
    return {
      allowed: false,
      allowedCuf: true,
      allowedKon: false,
      enforcePaywall: true,
      reason: "cuf_only_need_kon_upgrade",
      vin,
      fileKind,
      vinRecord: validVinRec,
      promoRecord: promoSummary,
      settings: store.settings,
    };
  }

  return {
    allowed: false,
    allowedCuf: false,
    allowedKon: false,
    enforcePaywall: true,
    reason: "locked",
    vin,
    fileKind,
    vinRecord: null,
    promoRecord: null,
    settings: store.settings,
  };
}

/**
 * Активирует промокод для конкретного VIN (или проверяет PRO-код без привязки к 1 VIN).
 */
export async function redeemEtacsPromoCode(options: {
  code: string;
  vin?: string | null;
  ecuId?: string | null;
  deviceId?: string | null;
}): Promise<{
  ok: boolean;
  message: string;
  promoRecord?: EtacsPromoCodeRecord;
  vinRecord?: EtacsUnlockedVinRecord | null;
}> {
  const store = await loadEtacsBillingStore();
  const cleanCode = normalizePromoCode(options.code);
  const cleanVin = normalizeVin(options.vin);
  const cleanDevice = normalizeDeviceId(options.deviceId);

  if (!cleanCode) {
    throw new Error("Введите код активации");
  }

  const promo = store.promoCodes[cleanCode];
  if (!promo || !promo.active) {
    throw new Error("Код активации не найден или отключён");
  }
  if (!isNotExpired(promo.expiresAt)) {
    throw new Error("Срок действия этого кода истёк");
  }

  if (promo.kind === "pro_unlimited") {
    const maxDev = promo.maxDevices ?? 2;
    const bound = promo.boundDevices ?? [];
    if (cleanDevice) {
      if (!bound.includes(cleanDevice)) {
        if (bound.length >= maxDev) {
          throw new Error(
            `Превышен лимит устройств (${maxDev} из ${maxDev}) для этого PRO-ключа. Передача ключа третьим лицам запрещена. Для сброса привязки обратитесь к администратору.`,
          );
        }
        bound.push(cleanDevice);
        promo.boundDevices = bound;
      }
    }
    if (cleanVin && !promo.usedVins.includes(cleanVin)) {
      promo.usedVins.push(cleanVin);
      promo.usedCount = promo.usedVins.length;
    }
    await saveEtacsBillingStore(store);
    return {
      ok: true,
      message: `Ключ PRO активирован на этом устройстве (${(promo.boundDevices ?? []).length} из ${maxDev} устр.)! Полный доступ (.kon + .cuf) открыт.`,
      promoRecord: promo,
      vinRecord: null,
    };
  }

  if (!cleanVin || cleanVin.length < 6) {
    throw new Error(
      "Для активации кода на автомобиль сначала откройте файл .kon / .cuf с вашим VIN в слоте A",
    );
  }

  if (!promo.usedVins.includes(cleanVin)) {
    if (promo.usedCount >= promo.maxUses) {
      throw new Error(`Лимит активаций этого кода (${promo.maxUses} VIN) уже исчерпан`);
    }
    promo.usedVins.push(cleanVin);
    promo.usedCount = promo.usedVins.length;
  }

  const now = new Date();
  const expiresAt =
    promo.durationDays && promo.durationDays > 0
      ? new Date(now.getTime() + promo.durationDays * 86_400_000).toISOString()
      : null;

  const existingVin = store.unlockedVins[cleanVin];
  const newScope: EtacsVinAccessScope =
    promo.kind === "cuf_single_vin" && existingVin?.scope !== "full" ? "cuf_only" : "full";

  const vinRecord: EtacsUnlockedVinRecord = {
    vin: cleanVin,
    scope: newScope,
    ecuId: options.ecuId?.trim() || existingVin?.ecuId || undefined,
    note: `По коду ${cleanCode}`,
    unlockedAt: now.toISOString(),
    expiresAt,
    source: "promo",
  };
  store.unlockedVins[cleanVin] = vinRecord;
  await saveEtacsBillingStore(store);

  return {
    ok: true,
    message:
      newScope === "cuf_only"
        ? `Доступ Custom Coding (.cuf) для VIN ${cleanVin} успешно открыт! Теперь вы можете без ограничений сохранять и записывать .cuf в блок.`
        : `Полный доступ (.kon + .cuf) для VIN ${cleanVin} успешно открыт!`,
    promoRecord: promo,
    vinRecord,
  };
}

export async function unlockVinManually(options: {
  vin: string;
  scope?: EtacsVinAccessScope;
  ecuId?: string;
  contact?: string;
  note?: string;
  durationDays?: number | null;
  source?: "admin" | "request";
}): Promise<EtacsUnlockedVinRecord> {
  const cleanVin = normalizeVin(options.vin);
  if (cleanVin.length < 6) {
    throw new Error("VIN должен содержать минимум 6 символов");
  }
  const store = await loadEtacsBillingStore();
  const now = new Date();
  const expiresAt =
    options.durationDays && options.durationDays > 0
      ? new Date(now.getTime() + options.durationDays * 86_400_000).toISOString()
      : null;

  const rec: EtacsUnlockedVinRecord = {
    vin: cleanVin,
    scope: options.scope ?? "full",
    ecuId: options.ecuId?.trim() || undefined,
    contact: options.contact?.trim() || undefined,
    note: options.note?.trim() || undefined,
    unlockedAt: now.toISOString(),
    expiresAt,
    source: options.source ?? "admin",
  };
  store.unlockedVins[cleanVin] = rec;
  await saveEtacsBillingStore(store);
  return rec;
}

export async function removeUnlockedVin(vin: string): Promise<void> {
  const cleanVin = normalizeVin(vin);
  const store = await loadEtacsBillingStore();
  delete store.unlockedVins[cleanVin];
  await saveEtacsBillingStore(store);
}

export function generatePromoCodeString(prefix = "ETACS"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[bytes[i]! % alphabet.length];
  }
  return `${prefix}-${suffix.slice(0, 3)}${suffix.slice(3, 6)}`;
}

export async function createEtacsPromoCode(options: {
  customCode?: string;
  kind: EtacsPromoCodeRecord["kind"];
  maxUses?: number;
  maxDevices?: number;
  durationDays?: number | null;
  note?: string;
}): Promise<EtacsPromoCodeRecord> {
  const store = await loadEtacsBillingStore();
  const defaultPrefix =
    options.kind === "pro_unlimited"
      ? "PRO"
      : options.kind === "cuf_single_vin"
        ? "CUF"
        : "VIN";
  const code = options.customCode
    ? normalizePromoCode(options.customCode)
    : generatePromoCodeString(defaultPrefix);
  if (!code || code.length < 4) {
    throw new Error("Слишком короткий код");
  }

  const now = new Date();
  const expiresAt =
    options.durationDays && options.durationDays > 0
      ? new Date(now.getTime() + options.durationDays * 86_400_000).toISOString()
      : null;

  const maxUses =
    options.kind === "pro_unlimited"
      ? 9999
      : options.kind === "single_vin" || options.kind === "cuf_single_vin"
        ? 1
        : Math.max(1, options.maxUses ?? 5);

  const defaultMaxDevices =
    options.kind === "pro_unlimited"
      ? options.durationDays && options.durationDays >= 180
        ? 3
        : 2
      : undefined;

  const rec: EtacsPromoCodeRecord = {
    code,
    kind: options.kind,
    maxUses,
    usedCount: 0,
    usedVins: [],
    maxDevices: options.maxDevices ?? defaultMaxDevices,
    boundDevices: [],
    durationDays: options.durationDays ?? null,
    note: options.note?.trim() || undefined,
    createdAt: now.toISOString(),
    expiresAt,
    active: true,
  };
  store.promoCodes[code] = rec;
  await saveEtacsBillingStore(store);
  return rec;
}

export async function resetEtacsPromoDevices(code: string): Promise<void> {
  const clean = normalizePromoCode(code);
  const store = await loadEtacsBillingStore();
  const promo = store.promoCodes[clean];
  if (!promo) throw new Error("Код не найден");
  promo.boundDevices = [];
  await saveEtacsBillingStore(store);
}

export async function deleteEtacsPromoCode(code: string): Promise<void> {
  const clean = normalizePromoCode(code);
  const store = await loadEtacsBillingStore();
  delete store.promoCodes[clean];
  await saveEtacsBillingStore(store);
}

export async function createEtacsUnlockRequest(options: {
  vin?: string | null;
  ecuId?: string | null;
  contact: string;
  plan: EtacsUnlockRequestRecord["plan"];
  currency?: "KZT" | "RUB";
  comment?: string;
}): Promise<EtacsUnlockRequestRecord> {
  const contact = String(options.contact ?? "").trim();
  if (contact.length < 3) {
    throw new Error("Укажите ваш номер телефона, Kaspi, СБП или Telegram для связи");
  }
  const rawVin = normalizeVin(options.vin);
  const isSingleVinPlan = options.plan === "cuf_vin" || options.plan === "single_vin";
  if (isSingleVinPlan && (!rawVin || rawVin.length < 6 || rawVin === "PROTARIFF")) {
    throw new Error(
      "Для отправки заявки на 1 VIN сначала откройте файл .kon / .cuf в слоте A или выгрузите кодировку с блока, чтобы определить VIN вашего автомобиля.",
    );
  }
  const cleanVin = rawVin || "PRO-TARIFF";
  const store = await loadEtacsBillingStore();
  const id = `ET-${randomBytes(3).toString("hex").toUpperCase()}`;

  const req: EtacsUnlockRequestRecord = {
    id,
    vin: cleanVin,
    ecuId: options.ecuId?.trim() || undefined,
    contact,
    plan: options.plan,
    currency: options.currency ?? "KZT",
    comment: options.comment?.trim() || undefined,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  store.requests.unshift(req);
  if (store.requests.length > 200) {
    store.requests = store.requests.slice(0, 200);
  }
  await saveEtacsBillingStore(store);
  return req;
}

export async function approveEtacsUnlockRequest(
  requestId: string,
): Promise<{
  request: EtacsUnlockRequestRecord;
  vinRecord?: EtacsUnlockedVinRecord;
  promoRecord?: EtacsPromoCodeRecord;
}> {
  const store = await loadEtacsBillingStore();
  const req = store.requests.find((r) => r.id === requestId);
  if (!req) {
    throw new Error("Заявка не найдена");
  }

  const now = new Date();
  req.status = "approved";
  req.resolvedAt = now.toISOString();

  if (
    (req.plan === "cuf_vin" || req.plan === "single_vin") &&
    req.vin &&
    req.vin !== "PRO-TARIFF"
  ) {
    const existing = store.unlockedVins[req.vin];
    const scope: EtacsVinAccessScope =
      req.plan === "cuf_vin" && existing?.scope !== "full" ? "cuf_only" : "full";
    const vinRec: EtacsUnlockedVinRecord = {
      vin: req.vin,
      scope,
      ecuId: req.ecuId ?? existing?.ecuId,
      contact: req.contact,
      note:
        scope === "cuf_only"
          ? `Заявка ${req.id} (только .cuf)`
          : `Заявка ${req.id} (.kon + .cuf)`,
      unlockedAt: now.toISOString(),
      expiresAt: null,
      source: "request",
    };
    store.unlockedVins[req.vin] = vinRec;
    await saveEtacsBillingStore(store);
    return { request: req, vinRecord: vinRec };
  }

  const durationDays = req.plan === "pro_year" ? 365 : 30;
  const maxDevices = req.plan === "pro_year" ? 3 : 2;
  const code = generatePromoCodeString("PRO");
  const expiresAt = new Date(now.getTime() + durationDays * 86_400_000).toISOString();
  const promoRec: EtacsPromoCodeRecord = {
    code,
    kind: "pro_unlimited",
    maxUses: 9999,
    usedCount: req.vin && req.vin !== "PRO-TARIFF" ? 1 : 0,
    usedVins: req.vin && req.vin !== "PRO-TARIFF" ? [req.vin] : [],
    maxDevices,
    boundDevices: [],
    durationDays,
    note: `Заявка ${req.id} (${req.contact})`,
    createdAt: now.toISOString(),
    expiresAt,
    active: true,
  };
  store.promoCodes[code] = promoRec;
  req.grantedPromoCode = code;
  if (req.vin && req.vin !== "PRO-TARIFF") {
    store.unlockedVins[req.vin] = {
      vin: req.vin,
      scope: "full",
      ecuId: req.ecuId,
      contact: req.contact,
      note: `PRO по заявке ${req.id} (${code})`,
      unlockedAt: now.toISOString(),
      expiresAt,
      source: "request",
    };
  }
  await saveEtacsBillingStore(store);
  return { request: req, promoRecord: promoRec };
}

export async function updateEtacsBillingSettings(
  patch: Partial<EtacsBillingSettings>,
): Promise<EtacsBillingSettings> {
  const store = await loadEtacsBillingStore();
  store.settings = {
    ...store.settings,
    ...patch,
  };
  await saveEtacsBillingStore(store);
  return store.settings;
}

function getSigningSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.MESSENGER_SESSION_SECRET?.trim() ||
    "qhub-etacs-default-signing-secret"
  );
}

/**
 * Создаёт защищённую HMAC-подпись для ссылки быстрого подтверждения заявки из Telegram в 1 клик.
 */
export function signQuickApproveToken(requestId: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(`etacs-approve:${requestId}`)
    .digest("hex")
    .slice(0, 24);
}

export function verifyQuickApproveToken(requestId: string, token: string): boolean {
  if (!requestId || !token) return false;
  const expected = signQuickApproveToken(requestId);
  return expected === token;
}
