# SSM4 Env: cgdw / Y-Yw — Applied+Option, приборка, EyeSight

Источник правды: dealer Env pack (`Env.rar` → `_inbox/ssm4-env/`), файлы:

| Файл Env | Роль | DID-маска |
|---|---|---|
| `cgdwPHBWHoZ.mLW` | Meter / Combination Meter variant | **A0xx** (41 DID в строке) |
| `Y-YwPHBWHoZ.mLW` | EyeSight stereo variant | **3501…3510** |
| `c7YcwPHBWHoZ.mLW` | Mono camera (MCAM) | 3201… |

Расшифровка: AES-256-ECB, ключ `a04w5ER9gJ604y6Q8N0cMt0i8FsSFz4C`.  
Каталоги CSV: `_inbox/ssm4-env/decoded/FULL_applied_option_catalog.csv` (+ `WILDERNESS_catalog.csv`).  
В коде QHub: `subaru-ssm4-cgdw-pairs.ts`, `subaru-ssm4-cgdw-fingerprints.ts`, `subaru-ssm4-yyw-fingerprints.ts`.

Целевой автомобиль для проверки: **2024 Outback Wilderness**, VIN `4S4BTGUD1R3270223`, Applied ожидается **BTAEYR8**.

---

## 0. Матрица совместимости по OBD без разбора (исключённые модели vs дисплейные настройки)

4-й символ кода `Applied Model` (`Body Model`) — это буквенное поколение (порядковый год выпуска конкретного кузова).

### A. Меняются по OBD без разбора щитка (включены в сервис QHub)
1. **Ascent (`WM`)** — с **21 МГ** (с поколения `C`: `WMAC`, `WMAD`, …)
2. **Legacy / Outback** — все **`BN` / `BS`**, а **`BW` / `BT`** — с **21 МГ** (с поколения `B`: `BT*B`, `BW*B`, …)
3. **Forester** — все **`SK`**
4. **Impreza Wagon / Crosstrek** — все **`GT`**
5. **Impreza Sedan (`GK`)** — с **21 МГ** (с поколения `E`: `GK*E`, `GK*F`, `GK*G`)
6. **WRX / Levorg (`VB` / `VN`)** — с **22 МГ** (с поколения `B`: `VB*B`, `VN*B`, …)
7. **BRZ (`ZD`)** и **Toyota GR86 (`ZN`)** — все `ZD8` / `ZN8`

### B. Заводской переключатель °F/°C в настройках дисплея (OBD нужен только для EyeSight/региона или Dual X-Mode)
- **Ascent / Legacy / Outback** — с **2023 МГ** (`WM*E+`, `BW*D+`, `BT*D+`)
- **Impreza / Crosstrek / WRX / Levorg** — с **2024 МГ** (`GU*`, `VB*D+`, `VN*D+`)
- **Forester** — с **2025 МГ** (кузов `SL`)

### C. Исключены (требуется разбор / программатор — запись в QHub заблокирована)
- **Ascent (`WM`)** до 21 МГ (поколения `A`, `B`: `WMAA`, `WMAB`)
- **Legacy / Outback (`BW` / `BT`)** 20 МГ (поколение `A`: `BT9A`, `BTAA`, `BW9A`, `BWAA`)
- **Impreza Sedan (`GK`)** до 21 МГ (поколения `A`, `B`, `C`, `D`)
- **WRX / Levorg** до 22 МГ (`VA`, `VM`, а также `VB`/`VN` поколение `A`)
- **Более ранние кузова:** Forester `SJ`/`SH`/`SG`, Impreza/XV `GP`/`GJ`, Legacy/Outback `BM`/`BR`, BRZ/86 `ZC`/`ZN6`

---

## 1. Что такое Applied Model и Option Code

SSM4 спрашивает **7-символьный Applied Model** и **4-символьный Option Code** как **ключ поиска на ПК** в Env (`GetFindByAppliedModelList` / `findOpCode`), а не как обязательную ASCII-строку в ECU.

Цепочка записи приборки (безопасно):

1. Пользователь вводит Applied + Option.
2. SSM4 находит строку в `cgdw` → полный набор байт A0xx.
3. Пишет маску через `sendMetVariByApplied` (SID `0x2E`), **не** ASCII «BTAEYR8» + «C0QF».

Обратно: с машины читаем A0xx (или 35xx с EyeSight) и **reverse-match** по полному отпечатку → получаем Applied+Option.

VIN нужен только как подсказка WMI/модели/года, если dump неполный. Уникальная полная строка cgdw **сама** восстанавливает пару кодов.

---

## 2. Option Code = Destination + suffix

| Часть | Пример | Смысл |
|---|---|---|
| Destination (2) | `U4` / `C0` / `U5` / `C5` | Рынок / эмиссии |
| Suffix (2) | `5D` / `QF` / `RF` | Пакет опций |

Полный код: `U45D`, `C0QF`, `C0RF`.

Быстрые байты (не полный отпечаток):

| DID | Значение | Смысл |
|---|---|---|
| **A002** | `02` | Destination **U4** (US °F/MPH) |
| | `03` | Destination **C0** (CA °C/km/h) |
| | `05` | **U5** |
| | `06` | **C5** |
| **A011** | `FF` | USA °F/MPH |
| | `00` | Canada °C/km/h |

Этих двух DID **недостаточно** для уникального Option — нужен полный A0xx fingerprint.

---

## 3. Dual X-Mode — 6-й символ Applied Model

**Не** Option Code. Dual X-Mode кодируется **grade** в позиции 6 Applied:

| 6-й знак | Пример | X-Mode |
|---|---|---|
| **R** | `BTAEYR8` | Dual (Wilderness) |
| **H** | `BTACYH8` | Dual (Onyx/Outdoor XT 2.4T) |
| **T** | `BT9EYTL` | Dual (2.5i Onyx) |
| J / K | Limited/Touring XT | Single |
| B / C / D / E | Base…Touring 2.5 | Single |

---

## 4. Wilderness в dealer cgdw (факт таблицы)

Проверено по `cgdwPHBWHoZ.mLW` / CSV. Ввод в SSM4 согласуется с таблицей.

### BTACYR8 (2022 MY Wilderness)

| Option | A002 | A011 | Ед. |
|---|---|---|---|
| U45D, U45X | 02 | FF | °F/MPH |
| **C0QF** | 03 | 00 | °C/km/h |

SSM4: `BTACYR8`+`C0QF` / `U45D` — OK; `C05D` / `C01D` / `BTACYR7|9` — «некорректный».

### BTADYR8 (2023 MY)

| Option | Канада |
|---|---|
| U45D, U45X | **C0QF** |

### BTAEYR8 (2024 MY) — VIN …R3270223

| Option в cgdw | Рынок |
|---|---|
| U45D, U4TD, U45J | US |
| **C0QF**, **C0RF** | CA (°C) |

**Нет в таблице SSM4:** `U45L`, `C0RC`, `C05D`.

Шильдик на стойке может показывать **U45L**, но dealer Env Aug 2025 для `BTAEYR8` этого кода **не содержит**. Для °F→°C в SSM4 писать **C0QF** (или **C0RF**).

---

## 5. Полный meter fingerprint (A0xx)

41 DID в строке cgdw (порядок как в генераторе):

`A001 A002 A003 A005 A006 A007 A008 A009 A00A A00B A00C A00D A00E A00F A010 A011 A012 A013 A014 A015 A016 A018 A019 A021 A022 A023 A024 A025 A026 A027 A028 A02A A02B A02D A02E A02F A034 A035 A036 A039 A041`

- Значение в таблице — 2 hex-символа.
- **`--`** = DID отсутствует в строке варианта (на шине часто NRC → в отпечатке тоже `--` / отсутствие).
- **A02E** критичен: различает, например, `BTAEYR8`+`C0QF` (A02E отсутствует) и `BTADYR8`+`C0QF` (A02E=`00`).
- Урезанный отпечаток (только A002/A011 или мало слотов) давал **ложные** совпадения (в т.ч. чужой Applied вроде U5MX).

Правило матча в QHub: exact full fingerprint; иначе compatible при ≥8 известных слотах; лучше сначала scope по Applied.

UDS: MET **783**, CGW **763**. Чтение — SID `0x22`.

### Полное чтение SSM4 (`cGZGBPHB-WmTWLZ.mHZ`) и режимы записи приборки

1. **Чтение (`readMetVariant`):** таблица `cGZGBPHB-WmTWLZ.mHZ` (`[Read DID TBL]`) задаёт ровно **46 DID**:
   - 3 битовые карты поддержки (4 байта): `A000`, `A020`, `A040`;
   - 43 однобайтовых вариантных DID: `A001..A00D`, `A00F..A019`, `A021..A028`, `A02A`, `A02B`, `A02D`, `A02E`, `A02F`, `A034..A037`, `A039`, `A041`.
   - Плюс `A00E` из `cgdwPHBWHoZ.mLW` и `10C2` (ворота вариантной записи). Отсутствующие на блоке DID фиксируются как `--`.
2. **Сравнение и бэкап (`subaru-meter-backup.ts`):**
   - `diffMeterAgainstAppliedCatalog` сравнивает дамп с каждой строкой `cgdw` для `Applied Model` (включая экстра-DID `A004/A017/A037` против `--`).
   - «Сохранить оригинал как… (.json)» (`qhub-subaru-meter-backup-v1`) + автосохранение в `localStorage` сохраняет все считанные DID, список активных `A0xx` для 1:1 отката (`restoreA0xxDids`, без карт и одометра) и `catalogComparison` (даже если код со стойки вроде `U45L` отсутствует в `cgdw`).
3. **Режимы записи (`writeSubaruMeter12ColumnCode`):**
   - **`two-did` (безопасный минимум):** меняет только `A002` (рынок `02/03/05/06`) и `A011` (`FF=°F/мили`, `00=°C/км/ч`), сохраняя заводские `A024`, `A036` и остальные ~26 байт.
   - **`full-cgdw` (`sendMetVariByApplied`):** пишет всю маску `A0xx` из строки `cgdw` (для `BTAEYR8+C0QF` — 28 команд `2E`). Для неизвестных пар вроде `U45L` заблокирован.
   - **`custom-a0xx`:** 1:1 восстановление оригинала из `.json` бэкапа.
4. **Исправленная цепочка шлюза CGW и парсера `hex.ts`:**
   - При наличии `A002/A011` (или `full-cgdw`/`custom-a0xx`) мёртвые `2E 0250/0251` (`NRC 31`) пропускаются.
   - `unlockSubaruCgwFilterRemove`: первым пробует `763→76B` с `31 01 02 0C` (`CGW-001.srp`), после `71 01 02 0C` обязательно отправляет **`10 01`** (блок `B05`) + пауза `500 мс`.
   - Сначала проверяет `22 10C2`: если `FF` — зонд `27 03` не шлётся; если `00` и `27 03 → NO DATA` — эскалация в AES `27 07→27 08 + 31 01 02 00 → 10 01`.
   - В `src/lib/obd/hex.ts` (`extractHexTokens`) исправлен сдвиг на 4 бита (nibbleshift) для уже выровненных 16-байтных Seed (`67 07 ...`), если внутри Seed на нечётной границе встречался байт `7F`.

---

## 6. EyeSight fingerprint (`35xx` и legacy `309x`) и работа с 787 (`ADA-031` / `ADA-032` / `3091..309D`)

Подробная документация по всем трём схемам `Y-YwPHBWHoZ.mLW` (`3501..3510`, `3091..309D`, `91..9D`), маскам `**_` / `5X_` / `***` и таблице Wilderness 2022–2024 вынесена в **`docs/ssm4-eyesight-yyw.md`**, а полный CSV-справочник (3 831 строка) — в `_inbox/ssm4-env/decoded/EYESIGHT_yyw_catalog.csv`.

Из `Y-YwPHBWHoZ.mLW` + `Y-YwPHBW-WmPGBu.mHZ` + `Y-YwPHBW-WmPGBN.mHZ`:

- **2023+ MY (`35xx`, 16 DID):** `3501 … 3510`, регион/destination в **`3502`** (`20` = U4 США, `21` = U5 США PZEV, `30` = C0 Канада, `31` = C5 Канада PZEV).
- **2018–2022 MY (`309x`, 13 DID, напр. `BTACYR8`):** `3091 … 309D`, регион/destination в **`3094`** (`02` = США U4/U5, `03` = Канада C0/C5). В `Y-Yw` для 4-символьного `Option Code` используются маски `**_` / `5X_` (`C0QF → C0**_`, `U45D → U4**_`, `U45X → U45X_`).
- Для **BTAEYR8** (`35xx`) и **BTACYR8** (`309x`) отпечатки EyeSight **глобально уникальны** → чтение 787 однозначно определяет модель и регион.

### SSM4 Work Support (`ADA-031.srp` и `ADA-032.srp`)

| Скрипт | Func | Точная UDS-последовательность из расшифрованного XML |
|---|---|---|
| **ADA-031.srp** (`Selection of Parameter`) | `40730` | `10 03` → `SecurityAccessExecute("3","2")` (`22 02 51` + `27 03/04`) → `22 35 01..0A` + `ReadWriteDidListData(35 0B..10)` → `changeVariantExtend` (`Y-Yw`) → `2E 35 01..0A` + `ReadWriteDidListData(35 0B..10)` → **повторное чтение `22 35 01..10` и побайтовая сверка (блоки `B08–B09`)** → `10 01` |
| **ADA-032.srp** (`Confirm on Parameter`) | `40731` | `10 03` → `SecurityAccessExecute("3","2")` → `22 35 01..10` → `setVehicleListExtend` (`Y-Yw`, только чтение) → `10 01` |

Шина: **787 → 78F** (fallback legacy **784 → 78C**). Env: `Y-YwPHBWHoZ.mLW`.

- **CGW FilterRemove:** перед чтением (`ADA-032`) и записью (`ADA-031`) вызывается `unlockSubaruCgwFilterRemove` (`763`).
- **Режимы записи EyeSight (`subaru-eyesight-variant.ts`):**
  - `full-yyw`: пишет все 16 DID (`3501..3510`) по `Y-Yw` (блокируется, если пары нет в `Y-Yw`, например `U45L`) и сверяет каждый байт.
  - `region-only`: меняет только `3502` (`20/21 ↔ 30/31`), сохраняя заводские `3501, 3503..3510`.
  - `custom-35xx`: 1:1 восстановление оригинала из бэкапа (`subaru-eyesight-backup.ts`, формат `qhub-subaru-eyesight-backup-v1`).

---

## 7. Алгоритмы 128-битной и 256-битной криптографии SSM4

### 7.1. Расшифровка баз `AreaCommon/Env/*.mLW`, `*.mHZ` и сценариев `SUBARU/CONF/*.srp` (`AES-256-ECB`)

1. **Алгоритм:** `AES-256-ECB` с PKCS#7 padding (в `FHIUtilityNK.dll` класс `CclsDecrypt`, `VA 0x10018D00 → 0x1002FFE0`).
2. **Ключи расшифровки (32 байта):**
   - Базы `AreaCommon/Env/*.mLW`, `*.mHZ` (таблицы параметров, отпечатков и карт чтения): ASCII-ключ **`a04w5ER9gJ604y6Q8N0cMt0i8FsSFz4C`**. После расшифровки внутри **Shift-JIS (CP932)** CSV-текст с заголовком вида `H\x02H\x02`.
   - Сценарии `SUBARU/CONF/*.srp` и индекс `UtilityFHI.srplst`: 32-байтовый ключ в `.data` `FHIUtilityNK.dll` (`VA 0x1005ABBC`, файловое смещение `0x597BC`). Зашифрованный `.srp` начинается с `CC BA 05 BD`; после расшифровки — 6-байтовый заголовок `48 02 48 02 FF FE` + UTF-16LE XML `<UTILITY>...</UTILITY>` (в `UtilityFHI.srplst`: `44 02 44 02` + ASCII CSV 314 строк).
3. **Обфускация имён файлов Env:** Base64url с таблицей подстановки символов (`cgdwPHBWHoZ.mLW`, `Y-YwPHBWHoZ.mLW`, `cGZGBPHB-WmTWLZ.mHZ`, `Y-YwPHBW-WmPGBu.mHZ`, `Y-YwPHBW-WmPGBN.mHZ`, `c7YcwPHBWHoZ.mLW`, `PHBWHoZ7imGwgp.mLW`).

### 7.2. Алгоритм 128-битного `SecurityAccess` для SGP (`SecurityAccess2018CY_AesKey` — `AES-128-ECB`)

Используется в `scr_ext_in_AesSecurityAccess` (`VA 0x1003CD00`), `SecurityAccessExecute` (`VA 0x100556F0`), `scr_ext_in_cgwSidFilterRemove` (`VA 0x10035E20`) и `CMD_SecurityAccess2018CY1`:

1. Чтение версии ключа: `22 02 51` → ответ `62 02 51 <keyVersion>` (1 байт: `01`, `02`, `03`, `04`, `10`, `20`, `81`, `82`, `C1`, `C2`, `FF`).
2. Запрос 16-байтового Seed (`27 07` на CGW `763`/`750`, либо `27 03`/`27 01`/`27 05` на EyeSight `787` и других SGP-блоках). Если все 16 байт `00` — доступ уже открыт.
3. Поиск записи в встроенной таблице `FHIUtilityCtrlNK.dll` по адресу **`VA 0x10082228`** (файловое смещение **`0x80028`**, ровно **36 записей по 22 байта**):
   - `+0x00` (`uint16 LE`): `ecuKind` (`0x0000`..`0x0012`; в т.ч. `0x04` = CGW, `0x02`/`0x03`/`0x05`/`0x0F` = EyeSight/камеры/шасси, `0x10`/`0x11`/`0x12` = приборка)
   - `+0x02` (`uint16 LE`): `keyVersion` (из `22 02 51`)
   - `+0x04` (`16 байт`): 128-битный ключ AES-128
   - `+0x14` (`uint8`): флаг операции (`0` = **AES-128-ECB Encrypt** через `0x1000F460`, `1` = **AES-128-ECB Decrypt** через `0x1000F560`; для `ecuKind = 0x0000` в `0x80028` флаг `+0x15` / `decrypt`).
4. Над 16-байтовым блоком `Seed` выполняется один блок **AES-128-ECB** (без IV и без паддинга; 10 раундов: `SubBytes → ShiftRows → MixColumns (кроме 10-го) → AddRoundKey` для Encrypt, либо `InvShiftRows → InvSubBytes → AddRoundKey → InvMixColumns` для Decrypt), результат `Key[16]` отправляется в `27 08` / `27 04` / `27 02`.
5. В QHub реализовано в `computeSubaruSecurityKey16ByteAesEcb`, `computeSubaruSecurityKey16ByteAesEcbDecrypt` и `SUBARU_SGP_AES128_KEYS` (`src/lib/obd/subaru-meter-variant.ts`).

### 7.3. Алгоритм 4-байтового `GetSecAccess` (`MET-002` / `MET-009` после кода `0205`)

При `22 10C2` → `62 10 C2 00` (Used Mode) приборка `783` отдаёт 4-байтовый Seed на `27 03`. `GetSecurityAccessSelKey` (`VA 0x10055D70 → 0x1004DED0`, `mode = 1`):
- 16-раундовая сеть Фейстеля (`subaruFeistelRound16` со S-box на 32 ниббла из `CMD_FhiCan.dll`) с 16×`uint16 LE` словами из `FHIUtilityCtrlNK.dll` (`0x10074740` `idx=11` стандартный; `0x10074A40` `idx=35` при `SSMID` на `4E`).
- Входная упаковка: `esp10 = (s2 << 8) | s0`, `ebx = (s1 << 8) | s3`; выход `mode=1`: `[esp10 & 0xFF, ebx & 0xFF, esp10 >> 8, ebx >> 8]`.

---

## 8. Дешифрованные базы SSM4 Env и сценарии (`_inbox/ssm4-env/decoded/`)

| Дешифрованный файл | Исходный файл / источник | Строк / записей | Назначение и формат |
|---|---|---|---|
| `cgdwPHBWHoZ.mLW.dec` | `Env/cgdwPHBWHoZ.mLW` | 10 448 строк (10 159 `FFFG`) | Главная база комбинации `Applied + Option → A0xx` (Shift-JIS CSV) |
| `cGZGBPHB-WmTWLZ.mHZ.dec` | `Env/cGZGBPHB-WmTWLZ.mHZ` | 278 строк (`46 DID`) | Карта чтения и расшифровки приборки `readMetVariant` (`A000..A041`, `[Item TBL]`, `[Param TBL]`) |
| `Y-YwPHBWHoZ.mLW.dec` | `Env/Y-YwPHBWHoZ.mLW` | 4 592 строки (4 258 data) | Главная база EyeSight: legacy `3091..309D` + SGP `3501..3510` |
| `Y-YwPHBW-WmPGBu.mHZ.dec` | `Env/Y-YwPHBW-WmPGBu.mHZ` | 16 DID | Карта чтения EyeSight SGP (`3501..3510`, по 1 байту) |
| `Y-YwPHBW-WmPGBN.mHZ.dec` | `Env/Y-YwPHBW-WmPGBN.mHZ` | 13 DID | Карта чтения EyeSight legacy (`3091..309D`, по 1 байту) |
| `c7YcwPHBWHoZ.mLW.dec` | `Env/c7YcwPHBWHoZ.mLW` | 337 строк (318 data) | База монокамеры MCAM (`3201..3206`) |
| `PHBWHoZ7imGwgp.mLW.dec` | `Env/PHBWHoZ7imGwgp.mLW` | 5 179 строк | Таблица `AppliedModel, VariantCode, Dest, Option, ROMID, Grade` |
| `cgdw_a0xx_fingerprints_full.json` | генерация из `cgdw` | 5 705 уник. пар / 41 DID | Полные 41-байтные отпечатки для `subaru-ssm4-cgdw-fingerprints.ts` |
| `yyw_35xx_fingerprints.json` | генерация из `Y-Yw` | 872 записи / 16 DID | Отпечатки `3501..3510` для `subaru-ssm4-yyw-fingerprints.ts` |
| `FULL_applied_option_catalog.csv` / `.xlsx` | сводный экспорт | 8 225 строк | Сводный каталог `Applied + Option + A002/A011 + Units` |
| `OUTBACK_LEGACY_BT_BW_catalog.csv` / `WILDERNESS_catalog.csv` | вырезки из `FULL` | 600 / 12 строк | Выборки по BT/BW и Wilderness |
| `srp/ADA-031.srp.xml`, `ADA-032.srp.xml` | `SUBARU/CONF/ADA-031/032.srp` | XML | Расшифрованные сценарии записи и чтения EyeSight |
| `srp/MET-002/008/009/010.srp.xml` | `SUBARU/CONF/MET-*.srp` | XML | Расшифрованные сценарии чтения/записи приборки |

---

## 9. Что сервис делает на машине

1. **1. Считать приборку** — UDS `22` по всем 46 DID `cGZGBPHB-WmTWLZ.mHZ` + `A00E` + `10C2` + паспорт, reverse-match, сравнение с каждой строкой `cgdw`, автосохранение бэкапа.
2. **Считать EyeSight (ADA-032)** — CGW `763` → `787`/`784`, SecurityAccess при `NRC 33`, чтение 16 DID `3501..3510` (+ `3091..309D`), сравнение с `Y-Yw`, автосохранение бэкапа.
3. **Сравнить 783 ↔ 787** — одновременный съём приборки и EyeSight, проверка совпадения Option/региона и кнопка синхронизации.
4. **Бэкапы (.json)** — «Сохранить оригинал как…» и «Восстановить оригинал» (1:1 откат `custom-a0xx` для приборки и `custom-35xx` для EyeSight, работает даже для `U45L`).
5. **Запись приборки** — `two-did` (`A002+A011`) или `full-cgdw` (`sendMetVariByApplied`); `sendMetVariant` / `common-area` / одометр не трогаются.
6. **Загрузка параметров EyeSight (ADA-031)** — `full-yyw` (16 DID) или `region-only` (только `3502`), с побайтовой проверкой `B08–B09`.

---

## 10. Ошибочные эвристики (не использовать)

| Было (неверно) | Факт cgdw / Y-Yw |
|---|---|
| BTAEYR8 → C0RC / U45L | В таблице нет; писать **C0QF/C0RF**; US в таблице **U45D/U4TD/U45J**; для сохранения `U45L` использовать JSON-бэкап |
| Wilderness → C05D | **C05D нет** для этих Applied |
| Dual X-Mode из Option | Только **6-й** символ Applied |
| Option = ASCII в метре | Обычно только DID-маска A0xx |
| Матч по A002+A011 | Коллизии; нужен полный fp + A02E |
| Сдвиг `67 07` на 4 бита при наличии `7F` | Выровненные ответы `67 07 ...` нельзя сдвигать по нибблам (`hex.ts`) |

---

## 11. Файлы QHub

| Путь | Назначение |
|---|---|
| `src/lib/obd/subaru-ssm4-cgdw-pairs.ts` | ~8k пар Applied↔Option |
| `src/lib/obd/subaru-ssm4-cgdw-fingerprints.ts` | A0xx fingerprints, `getSsm4CgdwWriteDids`, `diffMeterAgainstAppliedCatalog` |
| `src/lib/obd/subaru-ssm4-yyw-fingerprints.ts` | 35xx fingerprints, `getSsm4YywWriteDids`, `diffEyesightAgainstAppliedCatalog` |
| `src/lib/obd/subaru-meter-backup.ts` | `.json` бэкап и 1:1 откат приборки (`A0xx`) |
| `src/lib/obd/subaru-meter-variant.ts` | `CGW-001` (`763→76B`), 36 AES-128 ключей (`0x10082228`), `GetSecAccess`, запись `two-did` / `full-cgdw` / `custom-a0xx` |
| `src/lib/obd/subaru-eyesight-backup.ts` | `.json` бэкап и 1:1 откат EyeSight (`3501..3510` / `3091..309D`) |
| `src/lib/obd/subaru-eyesight-variant.ts` | `ADA-031` / `ADA-032` чтение, запись (`full-yyw` / `region-only` / `custom-35xx`) и верификация `B08–B09` |
| `src/lib/obd/subaru-ssm4-catalog.ts` | presets, resolve, extract, 46 DID `mHZ`, 16 DID `Y-Yw` |
| `src/lib/obd/hex.ts` / `uds.ts` | парсер ISO-TP без сдвига 16B Seed + русские подписи DID для `783` и `787` |
| `scripts/gen-cgdw-fingerprints.mjs` / `gen-yyw-fingerprints.mjs` | регенерация из decoded JSON |
| `src/app/tools/subaru-coding/SubaruCodingClient.tsx` | UI °F→°C, дифф-таблицы, бэкапы, EyeSight ADA-031/032 |
| `src/app/tools/obd-diag/SubaruSsmPanel.tsx` | OBD-панель |

Деплой: merge в `main` → workflow **Deploy to VPS** (актуальный деплой на коммите `c761607`, run `#43526944130`).

---

## 12. Чеклист живой проверки (машина)

- [ ] **1. Считать приборку** → Applied **BTAEYR8**, проверить таблицу отличий от `cgdw` и нажать **«Сохранить оригинал как… (.json)»**
- [ ] **Считать EyeSight (ADA-032)** → проверить 16 DID `3501..3510`, таблицу отличий от `Y-Yw` и сохранить бэкап EyeSight
- [ ] **Запись приборки** (`C0QF`) в режиме «Только 2 DID» или «Все DID как SSM4» → проверить проход `763: 31 01 02 0C → 10 01` и `6E` на `783`
- [ ] **Синхронизация EyeSight (`ADA-031`)** → проверить проход `27 03/04`, `6E 35 01..10` и сверку `B08–B09`
- [ ] **Сравнить 783 ↔ 787** → оба блока показывают Канада (`C0` / `3502=30`)
