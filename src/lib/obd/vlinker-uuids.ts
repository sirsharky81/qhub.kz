/** vLinker / many ELM327-BLE dongles (GATT serial bridge). */
export const VLINKER_SERVICE = "0000fff0-0000-1000-8000-00805f9b34fb";
export const VLINKER_NOTIFY = "0000fff1-0000-1000-8000-00805f9b34fb";
export const VLINKER_WRITE = "0000fff2-0000-1000-8000-00805f9b34fb";

const HM10_SERVICE = "0000ffe0-0000-1000-8000-00805f9b34fb";
const HM10_SERIAL = "0000ffe1-0000-1000-8000-00805f9b34fb";
const NORDIC_UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NORDIC_UART_WRITE = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const NORDIC_UART_NOTIFY = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

/** Services the page must be allowed to use after requestDevice. */
export const ELM_BLE_OPTIONAL_SERVICES = [VLINKER_SERVICE, HM10_SERVICE, NORDIC_UART_SERVICE] as const;

/** [notify, write] pairs tried after the GATT server is up. */
export const ELM_BLE_CHAR_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [VLINKER_NOTIFY, VLINKER_WRITE],
  [HM10_SERIAL, HM10_SERIAL],
  [NORDIC_UART_NOTIFY, NORDIC_UART_WRITE],
];

export const VLINKER_NAME_PREFIXES = ["vLinker", "VLINKER", "OBD", "obd"] as const;
