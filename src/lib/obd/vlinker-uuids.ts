/** vLinker / many ELM327-BLE dongles (GATT serial bridge). */
export const VLINKER_SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb";
export const VLINKER_NOTIFY = "0000fff1-0000-1000-8000-00805f9b34fb";
export const VLINKER_WRITE = "0000fff2-0000-1000-8000-00805f9b34fb";

/**
 * Vgate vLinker MC+ ("vLinker MC-IOS"), vLinker BM+, vLinker FD+, and Vgate iCar Pro BLE 4.0:
 * primary 16-bit GATT service 0x18F0 (notify 0x2AF0, write 0x2AF1) + Microchip/ISSC Transparent UART.
 * Note: Bluefy on iOS ignores `optionalServices` restrictions and returns all primary services,
 * whereas Google Chrome on Android strictly blocks any GATT service not listed in `optionalServices`.
 */
export const VGATE_18F0_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
export const VGATE_2AF0_NOTIFY = "00002af0-0000-1000-8000-00805f9b34fb";
export const VGATE_2AF1_WRITE = "00002af1-0000-1000-8000-00805f9b34fb";

export const ISSC_UART_SERVICE = "49535343-fe7d-4ae5-8fa9-9fafd205e455";
export const ISSC_UART_NOTIFY = "49535343-1e4d-4bd9-ba61-23c647249616";
export const ISSC_UART_WRITE = "49535343-8841-43f4-a8d4-ecbe34729bb3";
export const ISSC_UART_ALT_CHAR = "49535343-aca3-481c-91ec-d85e28a60318";

const HM10_SERVICE = "0000ffe0-0000-1000-8000-00805f9b34fb";
const HM10_SERIAL = "0000ffe1-0000-1000-8000-00805f9b34fb";
const HM10_FFE2_WRITE = "0000ffe2-0000-1000-8000-00805f9b34fb";
const HM10_FFE4_NOTIFY = "0000ffe4-0000-1000-8000-00805f9b34fb";
const HM10_SPLIT_WRITE_SERVICE = "0000ffe5-0000-1000-8000-00805f9b34fb";
const HM10_FFE9_WRITE = "0000ffe9-0000-1000-8000-00805f9b34fb";

const NORDIC_UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NORDIC_UART_WRITE = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const NORDIC_UART_NOTIFY = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

const BEE0_SERVICE = "0000bee0-0000-1000-8000-00805f9b34fb";
const BEE1_NOTIFY = "0000bee1-0000-1000-8000-00805f9b34fb";
const BEE2_WRITE = "0000bee2-0000-1000-8000-00805f9b34fb";

const BEF0_SERVICE = "0000bef0-0000-1000-8000-00805f9b34fb";
const BEF1_NOTIFY = "0000bef1-0000-1000-8000-00805f9b34fb";
const BEF2_WRITE = "0000bef2-0000-1000-8000-00805f9b34fb";

const FFB0_SERVICE = "0000ffb0-0000-1000-8000-00805f9b34fb";
const FFB1_NOTIFY = "0000ffb1-0000-1000-8000-00805f9b34fb";
const FFB2_WRITE = "0000ffb2-0000-1000-8000-00805f9b34fb";

const AE00_SERVICE = "0000ae00-0000-1000-8000-00805f9b34fb";
const AE01_WRITE = "0000ae01-0000-1000-8000-00805f9b34fb";
const AE02_NOTIFY = "0000ae02-0000-1000-8000-00805f9b34fb";

const TELINK_SPP_SERVICE = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const TELINK_SPP_CHAR = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";

/** Services the page must be allowed to use after requestDevice (required by Chrome Web Bluetooth). */
export const ELM_BLE_OPTIONAL_SERVICES = [
  VLINKER_SERVICE,
  VGATE_18F0_SERVICE,
  ISSC_UART_SERVICE,
  HM10_SERVICE,
  HM10_SPLIT_WRITE_SERVICE,
  NORDIC_UART_SERVICE,
  BEE0_SERVICE,
  BEF0_SERVICE,
  FFB0_SERVICE,
  AE00_SERVICE,
  TELINK_SPP_SERVICE,
] as const;

/** [notify, write] pairs tried after the GATT server is up. */
export const ELM_BLE_CHAR_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [VLINKER_NOTIFY, VLINKER_WRITE],
  [VGATE_2AF0_NOTIFY, VGATE_2AF1_WRITE],
  [ISSC_UART_NOTIFY, ISSC_UART_WRITE],
  [ISSC_UART_ALT_CHAR, ISSC_UART_ALT_CHAR],
  [HM10_SERIAL, HM10_SERIAL],
  [HM10_SERIAL, HM10_FFE2_WRITE],
  [HM10_FFE4_NOTIFY, HM10_FFE9_WRITE],
  [NORDIC_UART_NOTIFY, NORDIC_UART_WRITE],
  [BEE1_NOTIFY, BEE2_WRITE],
  [BEF1_NOTIFY, BEF2_WRITE],
  [FFB1_NOTIFY, FFB2_WRITE],
  [AE02_NOTIFY, AE01_WRITE],
  [TELINK_SPP_CHAR, TELINK_SPP_CHAR],
  [VLINKER_NOTIFY, VLINKER_NOTIFY],
];

export const VLINKER_NAME_PREFIXES = [
  "vLinker",
  "VLINKER",
  "IOS-Vlink",
  "Android-Vlink",
  "Vgate",
  "VGATE",
  "iCar",
  "OBD",
  "obd",
  "ELM",
  "Veepeak",
] as const;
