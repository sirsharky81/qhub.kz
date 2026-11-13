# SSM4 `AreaCommon\Bin` — архитектурная расшифровка

Источник: установленный дистрибутив **Subaru Select Monitor 4**  
`C:\Program Files (x86)\subaru\SSM4\SUBARU\AreaCommon\Bin`

Документ описывает **структуру модулей, экспорт, протокольные движки и связи между DLL**.  
Криптографические таблицы, формулы Seed→Key и точные CAN-кадры записи ключей иммобилайзера **сюда не входят**.

---

## 1. Слои архитектуры

```
SSM4 GUI (FHIUtilityNK.dll · EntranceDLL)
        │
        ├── Script Engine          FHIUtilityCtrlNK.dll
        │       ├── сценарии       SUBARU\CONF\*.srp  (+ UtilityFHI.srplst)
        │       ├── таблицы Env    SUBARU\AreaCommon\Env\*.ini / *.mHZ / *.mLW
        │       ├── J2534-мост     UtilityExFHINK.dll
        │       └── онлайн         FHIUtilityWebNK.dll  (+ языковые FHIUtilityWebNK??.dll)
        │
        ├── Comm wrapper           CommCtrlMainWrapper_DT.dll
        │       └── VSM ядро       VsmDiagControl.dll
        │               ├── БД     VsmDatabase.dll
        │               ├── кадры  VsmDataLib.dll
        │               └── VIM    VsmVimControl.dll  →  J2534CtrlNK.dll  →  J2534 PassThru
        │
        └── Protocol engines (CMD_*.dll)
                Phase5Can / Phase4Can / FhiCan / FhiCanEd2 /
                SsmKwp / Kwp14230 / Obd15765 / Can14230 / KwpGwCan / Oscillo
```

Все модули — **PE32 x86** (`Machine 0x14C`, типичный `ImageBase 0x10000000`). Сборка: **DENSO CORPORATION**, Visual C++ 2010 (`MSVCR100` / `MSVCP100` / `mfc100`).

---

## 2. Инвентарь папки

| Файл | Размер | PE timestamp | Экспорт | Роль |
|---|---:|---|---:|---|
| `CommandDataLib.dll` | 995 328 | 2020-03-02 | 400 | каталог команд / сигналов Data Monitor |
| `FHIUtilityCtrlNK.dll` | 563 712 | 2021-10-21 | 9 | скриптовый движок Utility / Immobilizer |
| `FHIUtilityNK.dll` | 531 968 | 2021-02-01 | 1 | GUI оболочки Utility (`EntranceDLL`) |
| `VsmDataLib.dll` | 413 696 | 2021-10-06 | 400 | кадры send/recv, DTC, FFD |
| `FHICCommCtrlMainWrapperTraining.dll` | 395 264 | 2021-11-25 | 3 | training-обёртка CommCtrl |
| `CMD_FhiCan.dll` | 390 656 | 2021-10-06 | 158 | FHI CAN / SSM CAN (самый полный CMD) |
| `VsmDatabase.dll` | 305 152 | 2021-10-06 | 400 | таблицы ECU / DID / DTC / Utility |
| `CommCtrlMainWrapper_DT.dll` | 236 544 | 2021-10-06 | 3 | диспетчер команд GUI → VSM |
| `CMD_FhiCanEd2.dll` | 197 120 | 2021-10-06 | 80 | FHI CAN edition 2 |
| `CMD_Phase4Can.dll` | 194 048 | 2021-10-06 | 48 | Gen4 ISO 15765-4 UDS |
| `CMD_Phase5Can.dll` | 161 280 | 2021-10-06 | 52 | SGP / Phase 5 UDS |
| `VsmDiagControl.dll` | 116 224 | 2021-10-06 | 246 | оркестратор ECU/System/Vehicle |
| `FHIUtilityWebNK.dll` | 113 152 | 2021-02-01 | 6 | HTTP-клиент к серверам Subaru |
| `UtilityExFHINK.dll` | 113 152 | 2017-12-07 | 18 | J2534 + comm-классы для Script Engine |
| `CMD_SsmKwp.dll` | 104 448 | 2021-10-06 | 36 | классический SSM KWP |
| `DatMonCommon.dll` | 102 400 | 2020-03-02 | 265 | общее ядро Data Monitor |
| `J2534CtrlNK.dll` | 98 304 | 2018-03-28 | 20 | SAE J2534-1 PassThru 04.04 |
| `CMD_Kwp14230.dll` | 94 720 | 2021-10-06 | 46 | ISO 14230-4 KWP2000 |
| `UtilityDB.dll` | 86 016 | 2020-03-02 | 207 | строки/БД utility |
| `CMD_Obd15765.dll` | 76 288 | 2021-10-06 | 26 | OBD ISO 15765-4 (7E0/7E8) |
| `CMD_Can14230.dll` | 62 976 | 2021-10-06 | 28 | KWP поверх CAN |
| `CMD_KwpGwCan.dll` | 60 928 | 2021-10-06 | 26 | KWP через шлюз CAN |
| `CommonDll.dll` | 53 248 | 2020-03-02 | 16 | лог / critical section |
| `GetUtilityString_DT.dll` | 49 152 | 2020-03-02 | 4 | локализованные строки Utility |
| `DataCompress_DT.DLL` | 49 152 | 2020-03-02 | 3 | encode/decode каталогов |
| `VsmVimControl.dll` | 43 520 | 2021-10-06 | 37 | VIM: Connect / send_recv / фильтры |
| `AdaptDataCtrl_DT.dll` | 39 936 | 2021-10-06 | 16 | адаптационные строки / codepage |
| `eVbBroker.dll` | 27 136 | 2020-01-08 | 16 | IPC-брокер параметров GUI↔DLL |
| `DiagWordsTableWrapper1_DT.dll` | 26 112 | 2021-10-06 | 3 | таблица диагностических слов (1) |
| `DiagWordsTableWrapper2_DT.dll` | 26 112 | 2021-10-06 | 3 | таблица диагностических слов (2) |
| `CMD_Oscillo.dll` | 20 992 | 2021-10-06 | 6 | осциллограф через DSTI |
| `ViewerDataCtrlWrapper_DT.dll` | 13 312 | 2021-10-06 | 3 | viewer-обёртка |
| `UtilityFHI.srplst` | 9 696 | 2021-06-15 | — | зашифрованный индекс `.srp` |
| `FHIUtilityWebNK??.dll` | 3–7 КБ | 2020-05-01 | 0 | языковые satellite (только `.rsrc`) |

Языковые satellite: `DE EN ES FR IT JP PL RU ZH`. Сборка `1.2.10.0`, `CompanyName = DENSO CORPORATION`. Код `RU` — `FHIUtilityWebNKRU.dll` (строки UI онлайн-авторизации).

---

## 3. `FHIUtilityCtrlNK.dll` — скриптовый движок

Это ядро исполнения сервисных сценариев калибровок, адаптаций, кастомизации и регистрации иммобилайзера. Размер **563 712** байт, PE timestamp **2021-10-21 04:55:14 UTC**.

### 3.1 Секции

| Секция | RVA | Raw | Назначение |
|---|---|---|---|
| `.text` | `0x1000` | 460 800 | интерпретатор `.srp`, comm, CALLFUNC |
| `.rdata` | `0x72000` | 57 856 | строки, маски UDS, имена функций |
| `.data` | `0x81000` | 22 528 (+ BSS) | таблица CALLFUNC, парсер, таблицы Env |
| `.rsrc` | `0x97000` | 1 536 | ресурсы |
| `.reloc` | `0x98000` | 19 968 | релокации |

### 3.2 Экспорт (9 функций)

| Ord | RVA | Имя | Назначение |
|---:|---|---|---|
| 0 | `0x12140` | `ScriptEng_Main_Initial` | инициализация, потоки `script_tsk` / `Screen_tsk`, LoadLibrary соседних DLL |
| 1 | `0x121D0` | `ScriptEng_Main_GetScriptData` | дескриптор загруженного `.srp` |
| 2 | `0x12970` | `ScriptEng_Main_Start` | старт сценария (`+START(%s)`) |
| 3 | `0x121E0` | `ScriptEng_Main_Finish` | останов и очистка (`+END`) |
| 4 | `0x122F0` | `ScriptEng_Main_Task_SendKeyEvent` | клавиши `|KEY1`..`|KEY4`, `|KEYA/B`, `|SOFTKEYBOARD` |
| 5 | `0x123A0` | `ScriptEng_Main_Task_SendListEvent` | выбор списка `|LIST [SEL:%d VAL:%d]` |
| 6 | `0x123C0` | `ScriptEng_Main_Task_MakeDispData` | модель экрана (`SCREEN`, `TITLE`, `TABLE`, `SOFTKEY`) |
| 7 | `0x123E0` | `ScriptEng_Main_Task_SendDispDone` | GUI подтвердил отрисовку |
| 8 | `0x04B00` | `_EncryptCM@16` | AES-CMAC для проверки MAC-файлов синхронизации блоков |

Импорт: `KERNEL32`, `WINMM.timeGetTime`, `ADVAPI32` CryptoAPI (`Microsoft Base Cryptographic Provider v1.0` — используется для шифрования слепков EyeSight `PreCrushTable.dat` / `MCAM_AebHistory.dat`, не для SecurityAccess автомобиля).

Динамическая загрузка:

- `../../SUBARU/AreaCommon/Bin/UtilityExFHINK.dll` — J2534 / comm
- `../../SUBARU/AreaCommon/Bin/FHIUtilityWebNK.dll` — онлайн

### 3.3 Интерпретатор `.srp`

Теги сценария (UTF-16 в `.data`, `VA 0x10084B28`):  
`COMMINFO`, `DATA`, `SCREEN`, `BLOCK`, `AREA`, `KEY` / `KEYTYPE` / `KEYSTATE`, `ACTION`, `TEXT`, `COMM`, `EVENT`, `FRAME`, `IF` / `THEN` / `ELSE`, `TITLE`, `STATUS`, `CONTENT`, `LABEL`, `TABLE`, `PICTUREBOX`, `PANEL`, `SCROLLPANE`, `INITACTION`, `FASTACTION`, `TIMER`, `NAME`, `CALLFUNC`, `CALC`, `FORMAT`, `PARAM`, `RECEIVE`, `FUNCTION`, `CONV`.

Языки UI сценария: `<EN <JP <DE <FR <IT <PT <ES <CN <GR <RU <TR <PL <KR <XX`.

Comm-параметры J2534 (имена из `.rdata`): `DATA_RATE`, `ISO15765_BS`, `ISO15765_STMIN`, `ISO15765_WFT_MAX`, `ISO15765_PAD_VALUE`, `P1_MIN`..`P4_MAX`, `T1_MAX`..`T5_MAX`, `N_AS_MAX` / `N_AR_MAX` / `N_BS_MAX` / `N_CR_MAX`, `FILTER_TYPE` / `MASK` / `PATTERN` / `FLOWCTRL`, `ECUADRS`, `TOOLADRS`, `BUSPHASE`, `KEEPALIVE`, `CYCLETIME`, `SENDTIMEOUT`, `RETRY`, `REPEAT`, `WAITTIME`, `PITCHTIME`.

Имена файлов в `AreaCommon\Env\` обфусцированы (алфавит Base64url + таблицы подстановки). Примеры имён на диске: `PHBWHoZ7imGwqC.mLW`, `cGZGBPHB-WmTWLZ.mHZ`, `Y-YwPHBW-WmPGBN.mHZ`. Индекс сценариев `UtilityFHI.srplst` и все файлы `SUBARU\CONF\*.srp` зашифрованы алгоритмом **AES-256-ECB** (PKCS#7 padding) в классе `CclsDecrypt` внутри `FHIUtilityNK.dll` (`VA 0x10018D00` → `0x1002FFE0`). Первые 4 байта каждого `.srp`/`.srplst` на диске — `CC BA 05 BD`; после расшифровки:

- в `.srp` идут 6 байт заголовка (`48 02 48 02 FF FE`), затем UTF-16LE XML `<UTILITY>…</UTILITY>`;
- в `UtilityFHI.srplst` идут 4 байта заголовка (`44 02 44 02`), затем ASCII CSV-таблица `FuncId,ModelRegex,ScriptName,Flag` (314 записей: `40101..41023`, где `41005` = `IMM-000.srp`).

### 3.4 Таблица `CALLFUNC` (115 записей, `VA 0x1008169C`)

Структура записи: `{ char* name, void* fn, uint32 flags }`, шаг 12 байт. Это имена, которые вызывают `.srp` через `<CALLFUNC>`.

**SecurityAccess / шлюз / HTTP (имена, без алгоритмов):**  
`SecurityAccess`, `GetSecurityAccessSelKey`, `GetSecurityAccessImb`, `GetSecurityAccessSel2ByteKey`, `SecurityAccess2018CY`, `SecurityAccessExecute`, `SecurityUnlock`, `chkCgwSidFilterRemove`, `cgwSidFilterRemove`, `cgwChkAndFilterRemove`, `cgwInfoErase`, `cgwCommConnect`, `cgwFilterDecision`, `HttpUserAuth`, `HttpGetSecurity6ByteKey`, `HttpGetSecurityKey`, `HttpSvConnCheck`.

**Иммобилайзер AS1 / регистрация (имена процедур, без CAN-кадров записи):**  
`keyRegist`, `keyVerification`, `sysRegist`, `newRegist`, `systemRegistAS1`, `keyRegistAS1`, `DTCReadAS1`, `keyVerificationAS1`, `meterScuRegistAS1`, `newRegistAS1`, `keyAddAS1`, `keyAddEndAS1`, `EndProcAS1`, `keyDeleteAS1`, `keyDelEndAS1`, `showSCUF4`, `securityIdEZ5`, `checkKeyId`, `ImbTlmCuRegist`, `imb_in_ReadKeyNumConfirm`, `imb_in_RegistKeyNumConfirm`, `imb_in_RegistStateConfirm`.

**MAC-синхронизация блоков (ECM ↔ Immobilizer ↔ Meter ↔ CGW):**  
`makeUpdateMacData`, `chgComByMacEcuList`, `getMacResultVerify`, `getUpdateMac`, `chkDtcAfterMacVerify`, `getMacVerifyProcResult`, `makeUpdateMacEcuList`. Файлы: `MacEcuName.dat`, `NamemacEcu.txt`. Онлайн-загрузка MAC идёт через `HttpMacDataUpDownLoad`.

**Приборка / Variant / VIN:**  
`readMetVariant`, `saveMetVariantFile`, `loadMetVariantFile`, `sendMetVariant`, `sendMetVariByApplied`, `setMetIndividualItemList`, `setMetIndividualParamList`, `sendMetIndividualParam`, `SetIndividualItem`, `setVehicleList`, `setVehicleListExtend`, `changeVariant`, `changeVariantExtend`, `getVariantData`, `GetFindByVariantCode`, `GetFindByAppliedModelList`, `listShowSet_Type17`, `listShowSet_Type17_24Column`, `getVINCode`, `getVehicleFrameNum`, `getVehicleRegNum`, `checkVinChar`, `calcChkDigit`, `chkDigit1to3`, `makeCommVin`.  
WMI-префиксы в `.rdata`: `JF1 JF2 JF3 4S3 4S4 PLP MMR JT2`.

**Двигатель / DPF / GPF / PHEV:**  
`commLearnCAN`, `getLearnSupportInfo`, `show_APS_Func`, `getFuelMeasurement`, `commDpfReadListCAN`, `listSetDpfListCAN`, `DpfWriteListCAN`, `commDpfWriteCAN`, `setGpfDataValue`, `commGpfWriteData`, `listSetInjListKWP`, `commInjListKWP`, `listSetPumpListKWP`, `commPumpListKWP`, `PhevKeepAliveStart` / `Stop` / `Terminate` / `TaskInitStart`.

**EyeSight / RAB / DMS / PSM / A/C:**  
`preCrushReadSave`, `preCrushSave2`, `preCrushSave3`, `setPreCrushSaveHistoryList`, `setPreCrushSelectData`, `CameraImgReadSave` (`AdaCameraNormal.dat`, `AdaCameraSpecial.dat`), `RABSave` (DID `11B2`), `saveDriverMonitoring` / `writeDriverMonitoring`, `saveSeatAndMirrorMemory` / `writeSeatAndMirrorMemory`, `saveAirConditioner` / `writeAirConditioner`.

**UDS DID / FHI Mode A8 / DTC:**  
`ReadWriteDidListData`, `ReadWriteDidListDataSupport`, `readSupportDidData`, `WriteCalibrationData`, `getDidData_HexString`, `getDidData_VariableValue`, `modeA8Wrap`, `chkA8SptInfoForBitWrap`, `getMode21DataPos`, `ReqMode3X`, `getROMID`, `getDTCdataP5`, `ReadDTCArea`, `CheckDTCArea`, `CheckDtcCode`.

**24 GUI-коллбэка** идут через единый мост `VA 0x10022F20` в `FHIUtilityNK.dll`:  
`PopupInjectorCodeInput`, `SaveAVCSLearning`, `OpenSaveDialogForMeter`, `PopUpImmMenuVehicleSel`, `PopUpImmMenuTypeSel`, `ImmMenuStatusCtrl`, `ImmMenuCgwDataSet`, `SaveVinCode`, `GetComSSMID`, `OutputTraceLog`, …

### 3.5 SecurityAccess — только карта вызовов

В DLL есть **несколько независимых путей** UDS `0x27`:

| Путь | CALLFUNC | Типичное применение |
|---|---|---|
| классический 2/4 байта | `GetSecurityAccessSelKey` / `cript_func` / `GetSecAccess` | AS1 / до-SGP immobilizer |
| TwoByte | `GetSecurityAccessSel2ByteKey` | короткий seed |
| AES 2018 CY | `SecurityAccess2018CY` → `SecurityAccess2018CY_AesKey` | SGP 2018+ (в т.ч. CGW) |
| DES | `scr_ext_in_DesSecurityAccess` | отдельные блоки |
| HTTP key | `HttpGetSecurityKey` / `HttpGetSecurity6ByteKey` | ответ считает сервер Subaru |
| универсальный | `SecurityAccessExecute` | выбирает AES или DES по типу ЭБУ |

Высокоуровневая последовательность разблокировки **CGW** (стандартные UDS-сервисы, без ключей):

1. `22 02 50` — тип алгоритма  
2. `22 02 51` — версия ключа  
3. `10 03` — extended session (`50 03`)  
4. `27 07` — seed (16 байт, ответ `67 07 …`)  
5. `27 08` + key — ответ `67 08`  
6. `31 01 02 00` — routine FilterRemove (`71 01 02 00`)

Отрицательные ответы, которые движок явно обрабатывает: NRC `0x21`, `0x33`, `0x36`, `0x78` (маски `$7F,*,$21` / `$7F,*,$78` / `$7F,*,$36`).

### 3.6 Главный диспетчер F2 `IMM-000.srp` (`41005`) и карта процедур

При входе в меню F2 (`Immobilizer etc. registration`) `IMM-000.srp` вызывает `PopUpImmMenuTypeSel`, проверяет ответ выбранного блока (`$3E,$00` → `$7E,$00` и идентификационные DID `0251` / `2047` / `1140` / `1062` / `115C`) и переводит в один из списков процедур (`B31`..`B43`):

| Ветка `IMM-000` | Тип системы | Адрес CAN / KWP | Пункт 6: **Remote Engine Start CM Registration** | Пункт 7: **Telematics CM Registration** |
|---|---|---|---|---|
| `B32` (`INT13=2, INT14=1`) | **B-type** (замок с ключом) | BIU `752 → 75A` | `40183` (`IMM-005.srp`): `31 01 40 05` → `31 03 40 05` | `40184` (`IMM-006.srp`): `31 01 40 07` |
| `B33` (`INT13=2, INT14=2`) | **B-type 2015+** (замок с ключом) | BIU `752 → 75A` | `40526` (`IMM-036.srp`): `31 01 40 05` → `31 03 40 05` | `40640` (`IMM-051.srp`) |
| `B38` (`INT13=6`) | **D-type** (Push-Start до SGP) | Keyless `751 → 759` | `40195` (`IMM-017.srp`): **`2E 11 B0 01` → `6E 11 B0`** | `40641` (`IMM-052.srp`): `ImbTlmCuRegist` (`2E 11 B2 01`) |
| `B40` (`INT13=8`) | **I-type** (Canada SGP) | `750 → 769` (`$C1`) | `40651` (`IMM-058.srp`): `31 01 40 05` → `31 03 40 05` | `40652` (`IMM-059.srp`): `31 01 40 06` |
| `B41` (`INT13=9`) | **G-type** (Key-Start SGP) | BIU `752 → 75A` | `40711` (`IMM-064.srp`): **`31 01 40 05` → `31 03 40 05`** | `40712` (`IMM-065.srp`): `31 01 40 06` |
| `B42` / `B43` (`INT13=10`) | **H-type** (Push-Start SGP) | Smart Key `7B4 → 7BC` | `40718` / `40789` (`IMM-071.srp`): **`2E 11 B0 01` → `6E 11 B0`** | `40719` / `40790` (`IMM-072.srp`): `2E 11 B2 01` |

Отдельный файл `RES-001.srp` (`40583`) содержит старую KWP-команду `$3B,$61,$30` → `$7B,$61` и в CAN-меню `IMM-000.srp` не используется.

Онлайн-эндпоинты (из `FHIUtilityWebNK.dll`, не из CtrlNK):

- `https://ssm-software.subaru.co.jp/lqji/int-auth/` — авторизация  
- `https://ssm-software.subaru.co.jp/lqje/keysend/` и `…/lqje/int-auth/` — security key  
- `https://ssm-software.subaru.co.jp/lqjm/getmackey/` — MAC-ключи синхронизации блоков  

Конфиг: `AreaCommon\Env\HttpData.ini`, `SFM.ini`. Лог: `C:/Users/Public/Documents/Subaru/SSM4/logs/WinHTTP_log.txt`.

---

## 4. GUI и брокер

### `FHIUtilityNK.dll` (531 968, экспорт `EntranceDLL`)

MFC-оболочка Utility. Тянет `EVBBROKER.dll`, `COMDLG32`, `SHELL32`. Содержит те же имена GUI-диалогов, что CtrlNK вызывает через мост, плюс коды ошибок Script Engine:

`ERROR_NOTMASTERKEY`, `ERROR_TIME_OUT`, `ERROR_COMMUNICATION`, `ERROR_FASTINIT`, `ERROR_RETRYOVER`, `ERROR_DENIAL`, `ERROR_NOTREG`, `ERROR_MASKEYCONF`, `ERROR_DENIAL_33/12/22/21`, `ERROR_A8DATA_NONSUPPORT`, `ERROR_PASSTHRU_CONNECT`, `ERROR_GET_BVOLT`, `FUNC_ERROR_CODE`, `SCRIPT_ENGINE_ERROR_CODE`.

Строка продукта: `SUBARU Select Monitor 4`. Лог операций: `FGDCErrorReportIF.dll` / `FGDC_ER_WriteOperationLog`.

### `eVbBroker.dll`

IPC между GUI и native-DLL. Экспорт: `EbStart/End/Kill`, `EbOpenPara/ClosePara/ReadPara/WritePara/SetPara/GetPara`, `EbSetString/GetString`, `EbSetData/GetpData`. Импорт `mfc100`.

### `UtilityExFHINK.dll`

Мост Script Engine → J2534. Экспорт `Ex2Initialize/Finalize`, `Ex2InitialCom/FinalCom`, `Ex2SendReceive`, `Ex2SetCommParam`, `Ex2PassThru*` (полный набор PassThru), `Ex2GetCallFuncList`, `Ex2GetParaFromBroker`.  
Грузит `\bin\J2534CtrlNK.dll`. C++-классы транспорта: `CComP5Can`, `CComCan_FHI`, `CComExCan_FHI`, `CComKwp`, `CKeepAliveThreadKWP`, `CComCanPSA`, `CComP5Can_Broadcast`, `CComCan_CCU`, `CComCan_DRS01`, `CComExCan_BDY08`.

---

## 5. J2534

### `J2534CtrlNK.dll`

SAE J2534-1 v04.04. Экспорт: `J2534CtrlInitialize/Finalize`, `CreateJ2534Class`, `GetDeviceInfo`, полный `PassThru*` (Connect, Disconnect, Read/WriteMsgs, Ioctl, фильтры, periodic, programming voltage, ReadVersion, GetLastError) и DSTI-осциллограф (`DstiOscCommand/GetParameter/SetParameter/ReadBuffer`).

Реестр: `SOFTWARE\PassThruSupport.04.04` (`Vendor`, `Device`, `FunctionLibrary`, `VIMDriver`). Протоколы: `ISO15765`, `ISO14230`, `ISO9141`, `J1850PWM`, `J1850VPW`, `SCI_A/B_ENGINE/TRANS`. Конфиг пользователя: `..\Env\UserCustom.ini`. Может грузить `ptshim32.dll`.

### `VsmVimControl.dll`

C++ обёртка над J2534 для VSM: `Open/Close`, `Connect/Disconnect`, `send_recv`, `send_directrecv`, `WriteMsgs/ReadMsgs/DirectReadMsgs`, `Start/StopMsgFilter`, `StartPeriodicMsg/ClearPeriodicMsgs`, `Ioctl`, `ReadVBatt`, `Lock/Unlock`, `SetJ2534RegistryPath`, DSTI-осциллограф. Кэш входящих: `CVsmCacheMsgList`.

---

## 6. VSM — диагностическое ядро

### `VsmDiagControl.dll`

Оркестратор. Классы: `CVsmDiagControl`, `CVsmVehicleCtrl`, `CVsmSystemCtrl`, `CVsmEcuCtrl`, `CVsmOscilloCtrl`. Методы: `OpenJ2534Device/CloseJ2534Device`, `ConnectEcu/EcuConnect/EcuDisconnect`, `CommandExecute`, `GetMountEcuList`, `GetSystemList`, `GetVinCode`, `GetCarCategoryVin`, `GetFunctionList`, `ReadVBatt`, `GetDatBuff` (Data Monitor buffer).

### `VsmDatabase.dll` / `VsmDataLib.dll`

Таблицы: `VehicleSystemTable`, `ParameterTable`, `DtcTable`, `UtilityTable`, `ActiveTestTable`, `CancelCodeTable`, `SpecialFunctionKeyTable`, `ApiTable` (`anSecurityAccess`, `enSecurityType`, `enKeyTable`, `CVsmRsKeyTable`, `CVsmRsKeyTableAES`, `anUdsVersion`, `enSsmId`).  
`VsmDataLib` — сериализация команд (`CVsmCmd*Snd/Rcv`, в т.ч. `CVsmCmdSecurityAccessSnd/Rcv`).

### `CommCtrlMainWrapper_DT.dll`

Единственный GUI-фасад: `Initialize / Execute / Finalize`. Внутри — десятки `CFGDCmdWrapper*::ExecuteCommand`: DTC (Current/History/Pending/Permanent/TestFailed/MemorizedDevelop), FFD, Data Monitor, Active Test, Customize, Cancel Code, VIN, J2534 config, Oscilloscope, Utility list, Behavior/SSR, ELCM, Hex Mode.

Training-вариант: `FHICCommCtrlMainWrapperTraining.dll` (тот же экспорт `Initialize/Execute/Finalize`, тянет `CommandDataLib` + `DatMonCommon`).

---

## 7. Протокольные движки `CMD_*.dll`

Общий контракт: `CMD_CreateInstance`, `CMD_DeleteInstance`, `CMD_Connect`, `CMD_Disconnect`, `CMD_IsConnected`, `CMD_GetEcuInfo`, `CMD_GetEcuFunctionList`, `CMD_DtmSetup/GetValue/Stop`, `CMD_GetJ2534ConfigParam`, `CMD_TesterPresent`. Дальше набор зависит от поколения шины.

| DLL | Шина / поколение | Отличия экспорта |
|---|---|---|
| `CMD_Phase5Can` | SGP, ISO 15765-4 11-bit 500 кбит/с, UDS `0x22` | `CMD_SessionControl`, `CMD_ClearDtcObd`, `CMD_GetConfirmed/Pending/Readiness/TestFailedDiagCode`, Active Test Method1–3, Predictive SSR, Multi FFD |
| `CMD_Phase4Can` | Gen4 CAN UDS | `CMD_SecurityAccess`, `CMD_MoveDiagSession`, `CMD_ClearDtc04/14`, `CMD_GetCurrent/HistoryDiagCode`, Cancel Code EGI, Customize (`Get/SetCtmItem*`), Special Function Key |
| `CMD_FhiCan` | фирменный FHI/SSM CAN (в т.ч. SID `0xA8`) | 158 экспортов: Active Test Method1–16, `CMD_SecurityAccess2018CY1`, `CMD_SecurityAccess2018CY1_CGW`, `CMD_SecurityAccessAES_AB`, `CMD_SecurityAccess_Selecter*`, `CMD_TwoPhasesOfCertification`, `CMD_GetCanBusConnectEcuList_CGW`, `CMD_ReadMemory/WriteMemory`, ELCM/Ed/Ed2 DTC, OnBoardMonitor, Cancel Code ASS/DMN/EGI/ES/RVD |
| `CMD_FhiCanEd2` | FHI CAN edition 2 | урезанный FhiCan (80 экспортов): Connect_Bvp/Es, ClearDtc31/Hpc, без 2018CY AES-селекторов |
| `CMD_SsmKwp` | классический SSM KWP | `CMD_ActKeepSession/MoveSession`, `CMD_ReadMemory/WriteMemory`, таблица `DtcSsmKwpTable` |
| `CMD_Kwp14230` | ISO 14230-4 | варианты `_Alt _Bc _Biu _Ps` (Airbag / Body / BIU / Power Seat), Customize destination |
| `CMD_Obd15765` | OBD на CAN | `CMD_GetMountEcuList`, `CMD_GetVinCode`, `CMD_GetVehicleInfo`, `CMD_GetPermanentDiagCode`, `CMD_OnBoardMonitorTest` (Mode 06) |
| `CMD_Can14230` | KWP по CAN | `CMD_SessionControl`, Cancel Code |
| `CMD_KwpGwCan` | KWP через шлюз | минимальный набор Connect/DTC/DTM/Act |
| `CMD_Oscillo` | DSTI scope | `CMD_GetOscSignalList`, `CMD_StartOsc/StopOsc`, `CMD_GetOscValue` |

PDB-пути внутри модулей: `C:\SSM4\VSSROOT\VSM_TeamProj\VsmProject-PATCH\_DLL\Release\CMD_*.pdb`.

---

## 8. Онлайн-клиент `FHIUtilityWebNK.dll`

Экспорт:

| Функция | Назначение |
|---|---|
| `HttpInitialize` | WinHTTP-сессия, прокси IE |
| `HttpUserAuth` | JSON-авторизация (`USER_AUTH`, `svauthkey`, `chKey`) |
| `HttpGetAccessKey` | получение access key |
| `HttpSvConnCheck` | проверка связи с сервером |
| `HttpSetUpdecisionSn` | серийный номер стенда / SFM |
| `HttpMacDataUpDownLoad` | загрузка/выгрузка MAC (`exmackeyk4`, `mstmackeym1..m3`, `exsafekey`, `slvsafekey`) |

Транспорт: `WinHttpOpen/Connect/OpenRequest/SendRequest/ReceiveResponse`, `Content-Type: application/json` и `application/x-www-form-urlencoded`. UI ожидания: `HttpCommWaitView`, `SvInputDlg`, `OneBtnDlg`. Язык UI подгружается satellite `FHIUtilityWebNK{EN,RU,…}.dll`.

---

## 9. Каталоги данных и утилиты

| DLL | Экспорт / заметка |
|---|---|
| `CommandDataLib.dll` | ~400 символов каталога команд Data Monitor |
| `DatMonCommon.dll` | 265 экспортов, зависит от `CommandDataLib` + `CommonDll` |
| `UtilityDB.dll` | 207 экспортов; сжатие через `DataCompress_DT` (`_DataEncode/_DataDecode`) |
| `GetUtilityString_DT.dll` | `GetUtilityString_K1/K2`, `CreateDbObject` |
| `AdaptDataCtrl_DT.dll` | singleton `CFGDAdaptDataCtrl`: translation, VDC/CMD codepage, help |
| `CommonDll.dll` | `CLog`, `CTrace`, `CriticalSection`, `ErrReportf` |
| `DataCompress_DT.DLL` | `_DataEncode@12`, `_DataDecode@12`, `_GetCompressVersion@0` |
| `DiagWordsTableWrapper1/2_DT.dll` | `Initialize/Execute/Finalize` |
| `ViewerDataCtrlWrapper_DT.dll` | то же |

---

## 10. Карта для QHub

Что из этой папки уже отражено в `/tools/obd-diag` (вкладка Subaru):

- каталог функций SSM4 и `.srp`-семейств — `src/lib/obd/subaru-ssm4-catalog.ts`
- живые DID / адаптации / F2 Immobilizer UI — `src/app/tools/obd-diag/SubaruSsmPanel.tsx`
- протоколы на стороне адаптера: `ATSP6` (ISO 15765-4 CAN 500k), UDS `22` / `19` / `10` / `27` / `31` / `2E` / `2F`

Что сознательно **не** переносится в QHub из этих DLL:

- встроенные AES/DES-таблицы и локальный расчёт Seed→Key
- точные CAN-посылки `keyAddAS1` / `keyDeleteAS1` / запись смарт-ключа
- клиент `ssm-software.subaru.co.jp` и MAC-ключи синхронизации блоков
- репрограммирование ЭБУ (`CMD_ReadMemory` / `CMD_WriteMemory` как flash)

Безопасный контур QHub: чтение DID, DTC, живые параметры, калибровки с явным подтверждением, seed **как сырой hex с ЭБУ** без локального вычисления key.

---

## 9. Подтверждённая на живом авто (2024 Outback Wilderness `BTAEYR8 + U45L`) цепочка записи приборной панели (`CGW-001.srp` + `MET-002/009.srp`)

1. **`763 → 76B` (Central Gateway)**:
   - `10 03` → `50 03`
   - `31 01 02 0C` → `7F 31 78` → `71 01 02 0C` (снятие SID-фильтра шлюза без `SecurityAccess`; для сравнения `31 01 02 00` требует `27 07 / 27 08` и без него возвращает `7F 31 33`).
2. **`783 → 78B` (Combination Meter)**:
   - `10 03` → `50 03`
   - `22 10 C2` → `62 10 C2 FF` (если `00` — выполняется `27 03 → 27 04` через `GetSecAccess` `idx=11/35` LE `mode=1`)
   - `2E 10 C2 FF` → `6E 10 C2` (открытие вариантной записи `MET-002/009 B06 C04`)
   - `2E A0 02 <02|03|05|06>` → `6E A0 02` (`02=U4`, `03=C0`, `05=U5`, `06=C5`)
   - `2E A0 11 <FF|00>` → `6E A0 11` (`FF=°F/MPH`, `00=°C/km/h`)
   - `2E 10 C2 00` → `6E 10 C2` (закрытие вариантной записи `MET-002 B26 C01`)
   - `10 01` → `50 01`

