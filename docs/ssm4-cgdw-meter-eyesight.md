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

---

## 6. EyeSight fingerprint (35xx)

Из `Y-YwPHBWHoZ.mLW`:

`3501 … 3510` (и соседние 309x / F18x для контекста, не для fp).

- Регион/destination часто читается из **3502** (hint), полный Option — из всей маски 35xx.
- Для **BTAEYR8** отпечаток EyeSight **глобально уникален** → с 787 одного достаточно восстановить Applied+Option.
- Сравнение meter vs EyeSight в UI: «Считать приборку» → «Сравнить с EyeSight».

### SSM4 Work Support (Selection of Parameter)

| Скрипт | Func | UDS-последовательность |
|---|---|---|
| **ADA-031.srp** | `40730` (`changeVariantExtend`, `setVehicleListExtend`, SecurityAccess) | `22 35 01..0A` → `10 03` → `2E 35 01..0A` (байты из Y-Yw) → `10 01` |
| **ADA-032.srp** | Confirm on Parameter | повторный `22 35 xx` (без записи) |

Шина: **787 → 78F** (fallback legacy **784 → 78C**). Env: `Y-YwPHBWHoZ.mLW`.

**CGW FilterRemove** (как у MET / IMM): без снятия SID-фильтра на шлюзе **763** ответы на manufacturer DID `35 01..10` с **787** часто отсутствуют (NRC или тишина) — в UI «EyeSight вариант не распознан». QHub перед чтением и перед **ADA-031** вызывает ту же процедуру, что и для записи приборки (`unlockSubaruCgwFilterRemove`).

Код: `subaru-eyesight-variant.ts`, сессия `readSubaruEyesightVariantCode` / `writeSubaruEyesightVariantCode`, UI «Загрузить параметры EyeSight (ADA-031)».

---

## 7. Что сервис делает на машине

1. **Считать приборку** — UDS 22 по A0xx (+ опционально ASCII-кандидаты 0250/F1A0…), reverse-match → Applied + Option + °C/°F.
2. **Сравнить с EyeSight** — CGW → 35xx с 787 (или 784), match Y-Yw, вердикт совпадения Option/региона с приборкой.
3. Подсказка записи °C: `resolveCanadianOptionCodesForSubaru` / cgdw pairs → для Wilderness **C0QF / C0RF**, не C0RC/C05D.
4. Запись приборки — `sendMetVariByApplied` (cgdw A0xx); **не** путать с `sendMetVariant` / common-area.
5. **Загрузка параметров EyeSight** — ADA-031: cgdw не используется; маска **Y-Yw** в DID 3501..3510, при NRC `33` — SecurityAccess `27 03/04` (тот же ключ, что для метра).

---

## 8. Ошибочные эвристики (не использовать)

| Было (неверно) | Факт cgdw |
|---|---|
| BTAEYR8 → C0RC / U45L | В таблице нет; писать **C0QF/C0RF**; US в таблице **U45D/U4TD/U45J** |
| Wilderness → C05D | **C05D нет** для этих Applied |
| Dual X-Mode из Option | Только **6-й** символ Applied |
| Option = ASCII в метре | Обычно только DID-маска A0xx |
| Матч по A002+A011 | Коллизии; нужен полный fp + A02E |

---

## 9. Файлы QHub

| Путь | Назначение |
|---|---|
| `src/lib/obd/subaru-ssm4-cgdw-pairs.ts` | ~8k пар Applied↔Option |
| `src/lib/obd/subaru-ssm4-cgdw-fingerprints.ts` | A0xx fingerprints + match |
| `src/lib/obd/subaru-ssm4-yyw-fingerprints.ts` | 35xx fingerprints + match |
| `src/lib/obd/subaru-eyesight-variant.ts` | ADA-031 read/write 35xx + CGW |
| `src/lib/obd/subaru-ssm4-catalog.ts` | presets, resolve, extract, facts |
| `scripts/gen-cgdw-fingerprints.mjs` / `gen-yyw-fingerprints.mjs` | регенерация из decoded JSON |
| `src/app/tools/subaru-coding/SubaruCodingClient.tsx` | UI °F→°C |
| `src/app/tools/obd-diag/SubaruSsmPanel.tsx` | OBD-панель |

Деплой: merge в `main` → workflow **Deploy to VPS** (проверено на `7741fbf`).

---

## 10. Чеклист живой проверки (машина)

- [ ] Считать приборку → Applied **BTAEYR8** (или фактический), Option из fp
- [ ] A002/A011 согласуются с рынком (°F vs °C)
- [ ] Сравнить с EyeSight → тот же Option / регион
- [ ] Канадская подсказка: **C0QF** или **C0RF**, не C0RC/U45L
- [ ] При полном fp без A02E для C0QF — не путать с BTADYR8
