# Subaru Outback (BT): 12-колоночный код, приборка (783) и EyeSight (787)

Документ описывает, как Subaru хранит «12 columns of models» (`Applied Model` 7 знаков + `Option Code` 4 знака), как это делает SSM4 и qhub.kz, и почему при смене только приборки без EyeSight появляется **B28A0 Vehicle Model Judgment**.

Ориентир: **Outback VI Wilderness 2.4T**, пример **`BTACYR8` + `U45D` (США)** / **`BTACYR8` + `C0QF` (Канада, 2022–2023 MY)**.

---

## 1. Что такое 12-колоночный код

| Поле | Длина | Пример | Назначение |
|------|-------|--------|------------|
| Applied Model | 7 | `BTACYR8` | Кузов, MY, рынок SIA, комплектация, тип CVT/EyeSight |
| Option Code | 4 | `U45D` / `C0QF` | Регион (`U4`/`C0`) + пакет опций (2 символа) |

- **Первые 2 символа Option Code** — destination: `U4`, `U5`, `U6` (США) или `C0`, `C5` (Канада).
- **Символы 3–4** — матрица оснащения по Service Manual (`Identification → Option Code`, таблицы `Ai` / 2-digit).

Для записи в SSM4 используется **Procedure B** (TSB 07-183-20 / MC-10182242-0001): пара должна **существовать** в таблице SSM4 `cgdwPHBWHoZ.mLW`. Иначе SSM4 пишет, что Option Code некорректен (типично для **`C05D`**, **`C01D`**, **`C0ID`** на **`BTACYR8`**).

---

## 2. Wilderness 2022–2023: США vs Канада (проверенный кейс)

### США (шильдик, завод)

- **VIN (пример):** `4S4BTGUD2N...` — 6-й знак **`G`** = turbo U4, 7-й **`U`** = Wilderness + Sunroof + Navi + RAB (без подогрева руля).
- **Applied Model:** `BTACYR8` (7-й символ **`8`** = TR690 8-speed CVT + EyeSight на 2.4T).
- **Option Code:** **`U45D`**
  - `5` — пакет Wilderness (StarTex, PRG, BSD/RCTA, Telematics, без кожи).
  - `D` — люк + навигация + **RAB**, **без** подогрева руля.

### Канада (шильдик / SSM4, единственная заводская пара для `BTACYR8` + `C0`)

- **VIN (пример):** `4S4BTHTD5N...` — 6-й **`H`** = turbo C0, 7-й **`T`** = канадский Wilderness.
- **Applied Model:** тот же **`BTACYR8`**.
- **Option Code:** **`C0QF`** (подтверждено на форуме владельцем CA Wilderness и приёмом SSM4).
  - `Q` — канадский пакет кузова (в т.ч. Telematics по CA-спецификации).
  - `F` — люк + подогрев руля + RAB (в CA с завода иной хвост, чем US `5D`).

**Важно:** механически на машине могут быть люк, навигация и RAB «как в США», но **в каталоге SSM4 для `BTACYR8` канадский код — только `C0QF`**, а не `C0` + копия хвоста `5D` (`C05D`).

### 2024+ Wilderness

- США: **`BTAEYR8` + `U45L`**.
- Канада: **`C0RC`** / **`C0RF`** (см. `resolveCanadianOptionCodesForSubaru` в `subaru-ssm4-catalog.ts`).

---

## 3. Dual X-Mode и `C0QF`

Тип X-Mode задаётся **6-м символом Applied Model** (grade), а не Option Code:

- **`R`** (Wilderness), **`H`** (Onyx XT) → **Dual X-Mode** (`SNOW/DIRT` + `DEEP SNOW/MUD`).
- **`C`–`K`** (Premium/Limited/Touring) → Single X-Mode.

При **`BTACYR8` + `C0QF`** Dual X-Mode сохраняется: меняются регион и единицы на приборке/в CAN, а не grade кузова.

---

## 4. SSM4: приборка (Combination Meter, 783)

### Уже перепрограммированная приборка

При повторной записи SSM4 может показать **Cannot write the Internal Data of the Combination Meter** и запрос **Input code number** → ввести **`0205`** (бюллетень MC-10169846-0001 / MET-009), затем **Write ECU setting 12 columns of models**.

### Что реально пишется на SGP (не всегда ASCII в DID 0250)

На многих приборках BT запись идёт цепочкой **MET-002 / MET-009 Procedure B**:

1. `22 10C2` — проверка «ворот» варианта.
2. При необходимости: `10 03` → `27 03/04` (SecurityAccess).
3. `2E 10C2 FF` — открыть вариантную запись.
4. `2E A002 <byte>` — destination (`02`=U4, `03`=C0, …).
5. `2E A011 <byte>` — единицы (`FF`=°F/MPH, `00`=°C/км/ч).
6. `2E 10C2 00` — закрыть запись.

qhub.kz повторяет эту логику в `subaru-meter-variant.ts` (в т.ч. разблокировка `27 04` для `783`).

### Пароли и ключи

- Код **`0205`** в SSM4 — только разблокировка **меню записи** приборки, не UDS-ключ.
- **NRC 33** на `2E 10C2 FF` → SecurityAccess **27 03 → 27 04** (таблицы SSM4 / FHIUtilityCtrlNK).

---

## 5. SSM4: EyeSight (787) — обязательная вторая точка записи

12-значный код хранится **в двух местах**:

| Блок | Адрес UDS | Где в SSM4 |
|------|-----------|------------|
| Combination Meter | 783 → 78B | Work Support → Write Control module setting… |
| EyeSight (стереокамера) | 787 → 78F | **Work Support → Selection of Parameter** |

- **Selection of Parameter** — запись Applied Model + Option Code в камеру (*Vehicle Model Registration*).
- **Confirm on Parameter** — чтение того, что сейчас в камере.

Для EyeSight **не нужен** код `0205`; запись занимает секунды.

### DTC B28A0 — Vehicle Model Judgment

**Условие (Service Manual):** код модели в **стереокамере** ≠ код, который приборка отдаёт в **CAN**.

**Симптомы на машине:**

- EyeSight: **B28A0** (Current), не гаснет только Clear Memory, пока коды расходятся.
- Вторично: **C2545** (EPS / EyeSight), **B2C22** (RAB / EyeSight), иногда **B14A1** (A/C).

**Типичный сценарий (машина друга):**

1. С завода: приборка + EyeSight = `U45D`.
2. Первый мастер: приборка + EyeSight = **`C0QF`** (оба блока).
3. Возврат только приборки на **`U45D`** → CAN говорит U4, камера помнит C0 → **B28A0**.
4. Снова **`C0QF`** в приборке → совпадение с камерой → ошибки уходят.

### Правило смены региона

Всегда **одинаковая** пара в обоих блоках:

1. **Combination Meter** — `BTACYR8` + `C0QF` или `U45D`.
2. **EyeSight → Selection of Parameter** — те же 7+4 символа.
3. IG OFF → **5–10 с** → IG ON.
4. EyeSight → **Clear Memory** (при необходимости).
5. Для полного согласования сети иногда снимают клемму АКБ на 1–2 мин (как в форумных гайдах по Forester).

**Не трогать без необходимости:** `Clear adjustment value`, `Camera All Adjustment Mode`, `EyeSight All Initialization` — это калибровка/сброс камеры, не смена региона.

---

## 6. Что qhub.kz считывает с приборки, а что восстанавливает

### Считывается напрямую с 783 (UDS)

- **DID A002** → регион: `02`→`U4`, `03`→`C0`, …
- **DID A011** → единицы: `FF` (США) / `00` (Канада).
- Другие **A0xx** — биты комплектации (RAB, BSD, EyeSight-флаги и т.д.), **не** ASCII-строка `U45D`.

### Не хранится в приборке как текст

Полная строка **`BTACYR8U45D`** в EEPROM часто **отсутствует**; SSM4 у дилера **не** имеет «прочитать 12 колонок» для Meter — код берут со **стойки B**.

### Ошибка старой логики (исправлено)

Раньше при `A002 = C0` программа **подставляла хвост из VIN США** (`5D` для Wilderness `GU`) → получалось **`C05D`**, которого **нет** в SSM4 для `BTACYR8`.

Сейчас для Wilderness 2022–2023 используется **`resolveCanadianOptionCodesForSubaru`**: US `U45D` → CA **`C0QF`**; при записи кнопка «Вернуть США» даёт **`U45D`**, а не `U4`+хвост от текущего поля.

### EyeSight

qhub **не** пишет **Selection of Parameter** на `787` — это нужно делать в SSM4 (или отдельной будущей процедурой в сервисе). Без синхронизации EyeSight возможен **B28A0**.

---

## 7. Карта Option Code: почему не `C01D` / `C0ID`

В матрице **2022 Outback Wilderness** 3-й знак пакета для BT — буквы/цифры вроде **`5`**, **`Q`**, **`I`** (не произвольная цифра `1` в позиции «похожей на 1»).

- **`C01D`** (цифра `0` + `1` + `D`) — **нет** в каталоге SSM4 для `BTACYR8`.
- **`C0ID`** (буква **`I`**) по смыслу ближе к «люк + navi + RAB без подогрева», но для **`BTACYR8`** заводская CA-строка в SSM4 — **`C0QF`**, не `C0ID`.

Ориентир для записи: **шильдик CA Wilderness** или подтверждение **Confirm on Parameter** в EyeSight.

---

## 8. Краткий чеклист (США ↔ Канада, EyeSight)

| Шаг | Действие |
|-----|----------|
| 1 | Уточнить **Applied Model** со стойки B (для 2.4T Wilderness 2022–23: **`BTACYR8`**, 7-й символ **`8`**) |
| 2 | Выбрать **Option Code**: США **`U45D`**, Канада **`C0QF`** |
| 3 | SSM4 Meter: при необходимости **`0205`**, записать 12 колонок |
| 4 | SSM4 EyeSight: **Selection of Parameter** — те же коды |
| 5 | IG OFF 5–10 с, Clear Memory EyeSight, проверить **All DTC** (нет **B28A0**) |
| 6 | **Confirm on Parameter** — Applied Model и OP code совпадают с шильдиком |

---

## 9. Связанный код в репозитории

| Файл | Содержание |
|------|------------|
| `src/lib/obd/subaru-ssm4-catalog.ts` | `resolveCanadianOptionCodesForSubaru`, `extractAppliedModelAndOptionCodeFromDump`, пресеты `SUBARU_CANADIAN_OPTION_PRESETS` |
| `src/lib/obd/subaru-meter-variant.ts` | Запись A002/A011, SecurityAccess, MET-002/009 |
| `src/app/tools/subaru-coding/SubaruCodingClient.tsx` | UI °F↔°C, подстановка `C0QF` / `U45D` |

---

## 10. Ссылки (мануалы)

- Subaru Service Manual: **EyeSight → DTC B28A0 Vehicle Model Judgment**
- Subaru Service Manual: **EyeSight → Work Support → Selection of Parameter / Confirm on Parameter**
- TSB **07-183-20** / **MC-10182242-0001** — 12 columns, Procedure B
- Бюллетень **MC-10169846-0001** — код **0205** для повторной записи приборки

---

*Документ актуален для логики qhub.kz на ветке с `C0QF` для `BTACYR8` Wilderness (2022–2023 MY).*
