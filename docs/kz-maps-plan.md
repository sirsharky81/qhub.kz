# KZ Maps — план сервиса карт, треков и мест Казахстана

**Статус:** черновик плана  
**Маршрут:** `/tools/kz-maps`  
**Отдельно от:** Family Map (семейная геолокация — не трогаем на старте)

---

## 1) Цели и критерии успеха

### Продукт

Сервис для Казахстана: карты, запись и обмен треками, личные точки, публичный каталог достопримечательностей, построение маршрутов. Работает в браузере и в Capacitor-приложении; офлайн — как Organic Maps, но через открытый стек (OSM + PMTiles).

### Definition of Done (MVP, фаза 1)

- Карта KZ онлайн с attribution OSM.
- Запись GPS-трека, пауза, сохранение в GPX.
- Импорт GPX, отображение трека и waypoints на карте.
- Личные точки: добавить / редактировать / удалить / экспорт GPX.
- Каталог ≥ 20 seed-мест с координатами и кратким описанием.
- Маршрут онлайн между 2+ точками (пеший / авто / вело) через OSRM на VPS.
- Карточка места + «построить маршрут сюда».

### Definition of Done (фаза 2)

- Каталог регионов для скачивания карт (PMTiles).
- Офлайн: карта региона + `places.json` региона на устройстве.
- Просмотр своих треков и каталога мест без сети.

### Definition of Done (фаза 3)

- Предложение места пользователем + модерация в админке.
- Snap трека к дорогам (онлайн).
- Офлайн-маршрутизация или упрощённый офлайн-навигационный режим (TBD).

---

## 2) Что не делаем на старте

- Не копируем формат Organic Maps (`.mwm`) — используем PMTiles + MapLibre.
- Не заменяем Family Map и не смешиваем семейную геолокацию с походными треками.
- Не используем `tile.openstreetmap.org` как основной tile-сервер в продакшене.
- Не подключаем платный Mapbox/MapTiler как обязательную зависимость.
- Полноценный офлайн-навигатор «как Яндекс» — только фаза 3+.

---

## 3) Архитектура

```text
┌─────────────────────────────────────────────────────────────┐
│  Client: /tools/kz-maps (Next.js + MapLibre GL)              │
├─────────────────────────────────────────────────────────────┤
│  Слои карты                                                 │
│    • База (мир): внешний бесплатный fallback                │
│    • KZ overlay: свои тайлы/PMTiles с bounds Казахстана     │
│    • Пины: каталог мест + личные waypoints                  │
│    • Линии: треки (GPX), маршруты (OSRM)                    │
├─────────────────────────────────────────────────────────────┤
│  Локально на устройстве                                     │
│    • IndexedDB / OPFS: метаданные, черновики треков         │
│    • Capacitor Filesystem: скачанные .pmtiles + bundles     │
├─────────────────────────────────────────────────────────────┤
│  VPS (qhub.kz)                                              │
│    • nginx: /tiles/kz/, /kz-maps/bundles/*.pmtiles          │
│    • OSRM: маршруты по графу KZ (Docker)                    │
│    • Next API: places, tracks, suggest, regions             │
│    • Redis: места, пользовательские треки (мета), pending   │
└─────────────────────────────────────────────────────────────┘
```

### Карты: «хитрая» схема без платного tile API

| Зона | Источник |
|------|----------|
| Внутри bbox KZ | Свои тайлы/PMTiles на VPS |
| Вне KZ | Внешний бесплатный fallback (OpenFreeMap и т.п.) |
| Решение | Dual-layer в MapLibre **или** tile-proxy `/tiles/{z}/{x}/{y}` на VPS |

**Bbox Казахстана (старт):** `[[40.56, 46.47], [55.45, 87.36]]`

---

## 4) Модели данных

### 4.1 Публичное место (достопримечательность)

```ts
type KzPlaceCategory =
  | "nature"
  | "viewpoint"
  | "waterfall"
  | "lake"
  | "petroglyphs"
  | "historic"
  | "trail"
  | "urban";

type KzPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;           // "almaty-city", "almaty-oblast", ...
  category: KzPlaceCategory;
  summary: string;          // 1–3 предложения, обязательно
  description?: string;     // markdown, опционально
  tags: string[];
  photos?: string[];        // URL, 0–5
  difficulty?: "easy" | "medium" | "hard";
  season?: ("spring" | "summer" | "autumn" | "winter")[];
  linkedTrackIds?: string[];
  source: "qhub" | "osm" | "community";
  osmId?: number;
  published: boolean;
  updatedAt: number;
};
```

**Отдельно от личных waypoints пользователя** — разные таблицы/ключи Redis, разные слои на карте.

### 4.2 Личная точка пользователя

```ts
type UserWaypoint = {
  id: string;
  userId: string;           // сессия / телефон / anonymous token — TBD
  name: string;
  lat: number;
  lng: number;
  note?: string;
  icon?: string;
  createdAt: number;
  updatedAt: number;
};
```

### 4.3 Трек

```ts
type UserTrackMeta = {
  id: string;
  userId: string;
  name: string;
  region?: string;
  distanceM: number;
  durationSec: number;
  pointCount: number;
  gpxUrl?: string;          // или inline в Redis до лимита
  createdAt: number;
  isPublic: boolean;          // фаза 2+
};
```

**Файл GPX** — тело трека; метаданные в Redis, большие файлы — файловое хранилище VPS (`/var/www/qhub-data/kz-maps/tracks/`).

### 4.4 Регион офлайн-пакета

```ts
type KzMapRegion = {
  id: string;               // "almaty-oblast"
  name: string;
  bbox: [[number, number], [number, number]];
  pmtilesUrl: string;
  pmtilesBytes: number;
  placesBundleUrl: string;  // JSON мест региона
  placesCount: number;
  updatedAt: string;        // ISO date пакета
};
```

---

## 5) Redis-ключи (эскиз)

```text
qhub:kz-maps:place:{id}              → JSON KzPlace
qhub:kz-maps:region:{code}:places     → set place ids
qhub:kz-maps:pending:{id}           → JSON на модерацию

qhub:kz-maps:user:{uid}:waypoint:{id}
qhub:kz-maps:user:{uid}:track:{id}  → meta
qhub:kz-maps:user:{uid}:track-ids     → set
```

TTL для pending — 90 дней; опубликованные места — без TTL.

---

## 6) API (эскиз)

### Публичный каталог

```text
GET  /api/kz-maps/places?region=&category=&q=
GET  /api/kz-maps/places/{id}
GET  /api/kz-maps/places/nearby?lat=&lng=&radiusKm=30
GET  /api/kz-maps/regions
GET  /api/kz-maps/bundles/{region}/places.json
```

### Маршруты

```text
GET  /api/kz-maps/route?from=lat,lng&to=lat,lng&profile=foot|car|bike
POST /api/kz-maps/route/multi   // waypoints[]
POST /api/kz-maps/route/snap    // GPX → привязка к дорогам (фаза 3)
```

### Личное (auth TBD: cookie / PIN / QHub session)

```text
GET/POST/DELETE  /api/kz-maps/my/waypoints
GET/POST/DELETE  /api/kz-maps/my/tracks
POST             /api/kz-maps/my/tracks/upload   // multipart GPX
GET              /api/kz-maps/my/tracks/{id}/gpx
```

### Сообщество (фаза 3)

```text
POST /api/kz-maps/places/suggest
```

### Админ

```text
GET/PATCH /api/admin/kz-maps/places
GET/PATCH /api/admin/kz-maps/pending
```

---

## 7) Клиент: экраны

```text
/tools/kz-maps
├── /                     — карта (главный экран)
├── /places               — каталог достопримечательностей
├── /places/[id]          — карточка места
├── /tracks               — мои треки
├── /tracks/record        — запись GPS
├── /tracks/import        — импорт GPX
├── /waypoints            — мои точки
├── /route                — построитель маршрута
├── /maps                 — скачать регионы (офлайн)
└── /settings             — слои, единицы, хранилище
```

### Слои на карте (переключатели)

- Достопримечательности (каталог)
- Мои точки
- Мои треки
- Маршрут (временный)
- Скачанный офлайн-регион

---

## 8) Структура файлов в репозитории (целевая)

```text
src/app/tools/kz-maps/
  page.tsx
  KzMapsHomeClient.tsx
  places/
  tracks/
  maps/                    # офлайн-загрузки
  components/
    KzMapView.tsx          # MapLibre wrapper
    PlaceCard.tsx
    TrackRecorder.tsx
    GpxImporter.tsx
    RouteBuilder.tsx
    RegionDownloadList.tsx

src/lib/kz-maps/
  types.ts
  places.ts
  gpx.ts
  route-client.ts
  regions.ts
  offline-storage.ts       # Capacitor FS + OPFS
  constants.ts

data/kz-places/
  index.json
  almaty-city.json
  almaty-oblast.json
  ...

src/app/api/kz-maps/
  places/
  route/
  regions/
  my/

public/kz-maps/            # иконки, маркеры категорий
```

---

## 9) Инфраструктура VPS

### 9.1 Карты

1. Скачать OSM extract Kazakhstan (Geofabrik).
2. Сгенерировать PMTiles по регионам (tilemaker / planetiler).
3. Раздавать nginx:

```nginx
location /kz-maps/bundles/ {
    alias /var/www/qhub-tiles/kz-maps/;
    expires 30d;
    add_header Cache-Control "public";
}
```

### 9.2 OSRM

```bash
# Docker, профили: foot, car, bike
# Граф только KZ — ~500MB–2GB RAM
```

### 9.3 Диск (оценка)

| Регион | PMTiles (z0–14) |
|--------|-----------------|
| Алматы (город) | ~50–100 MB |
| Алматинская обл. | ~150–300 MB |
| Весь KZ | ~1–2 GB |

---

## 10) Seed-контент: стартовые места (примеры)

| id | Название | Регион |
|----|----------|--------|
| charyn-canyon | Чарынский каньон | almaty-oblast |
| kolsay-lake-1 | Озеро Кольсай (нижнее) | almaty-oblast |
| kaindy-lake | Озеро Каинды | almaty-oblast |
| tamgaly-tas | Тамгалы-Тас | almaty-oblast |
| big-almaty-lake | Большое Алматинское озеро | almaty-city |
| medeu-shymbulak | Медеу / Шымбулак | almaty-city |
| khan-tengri-base | Базовые виды Заилийского Алатау | almaty-oblast |
| turkestan-mausoleum | Мавзолей Ходжи Ахмеда Ясави | turkestan |
| boszhira | Бозжира | mangystau |
| singing-dune | Поющий бархан | almaty-oblast |

Описания — русский текст, 2–4 предложения, без копипаста из Wikipedia дословно.

---

## 11) Фазы и сроки (оценка)

### Фаза 1 — MVP (3–5 недель)

| # | Задача | Приоритет |
|---|--------|-----------|
| 1.1 | Типы, `data/kz-places/` seed, запись в `apps.ts` (beta) | P0 |
| 1.2 | MapLibre + онлайн KZ tiles (dual-layer или proxy) | P0 |
| 1.3 | Слой каталога мест + карточка + список с фильтрами | P0 |
| 1.4 | GPS-запись трека → GPX export | P0 | ✅ |
| 1.5 | GPX import + отрисовка | P0 | ✅ |
| 1.6 | Личные waypoints (localStorage → API) | P1 |
| 1.7 | OSRM на VPS + UI «маршрут» | P1 | ✅ |
| 1.8 | «Построить маршрут» из карточки места | P1 | ✅ |

### Фаза 2 — Офлайн карты (2–3 недели)

| # | Задача | Приоритет |
|---|--------|-----------|
| 2.1 | Генерация PMTiles по регионам KZ | P0 |
| 2.2 | Экран «Скачать карты» + progress | P0 |
| 2.3 | Capacitor Filesystem storage | P0 |
| 2.4 | Офлайн places bundle per region | P1 |
| 2.5 | Синк треков на сервер | P1 |

### Фаза 3 — Сообщество и продвинутое (3+ недель)

| # | Задача | Приоритет |
|---|--------|-----------|
| 3.1 | Форма «предложить место» | P1 |
| 3.2 | Админ-модерация | P1 |
| 3.3 | Snap GPX к дорогам | P2 |
| 3.4 | Публичные треки / «популярные маршруты к месту» | P2 |
| 3.5 | Офлайн-маршрутизация (исследование) | P3 |

---

## 12) Зависимости npm (новые)

```text
maplibre-gl
pmtiles
@maplibre/maplibre-gl-geocoder   // опционально
@turf/turf                       // геометрия, bbox, distance
gpxparser / @tmcw/togeojson      // GPX parse
```

Leaflet **не** используем в этом сервисе.

---

## 13) Capacitor / мобилка

- **Запись трека в фоне:** `@capacitor/geolocation` + Background Geolocation plugin (фаза 1.4+).
- **Офлайн файлы:** `@capacitor/filesystem` для `.pmtiles`.
- **Разрешения:** location always / when in use — отдельный экран объяснения.
- **allowNavigation:** если tile-proxy только на `qhub.kz` — внешние домены не нужны.

---

## 14) Риски

| Риск | Митигация |
|------|-----------|
| OSRM RAM на VPS | Только KZ extract; лимит запросов |
| Большие PMTiles | Регионы, не вся страна сразу |
| iOS убивает запись трека | Foreground service / честный UX «держите экран» на MVP |
| Дубликаты мест | Модерация + dedup по расстоянию 100m |
| Авторские права на фото | Только свои / CC / пользовательские с согласием |

---

## 15) Метрики успеха (после запуска)

- ≥ 50 опубликованных мест в каталоге (3 месяца).
- ≥ 100 скачанных офлайн-регионов (6 месяцев).
- Среднее время построения маршрута < 2 с (онлайн).
- Crash-free запись трека > 95% сессий на Android.

---

## 16) Следующий шаг (когда начнём код)

1. ~~Создать `docs/kz-maps-plan.md`~~ ✅  
2. ~~`src/data/kz-places/*.json` — seed мест~~ ✅  
3. ~~Скелет `/tools/kz-maps` + запись в `apps.ts`~~ ✅  
4. ~~MapLibre + онлайн-слой KZ (фаза 1.2)~~ ✅  
5. Параллельно: скрипт `scripts/kz-maps/generate-pmtiles.sh` для VPS.

---

## Связанные документы

- `docs/vps.md` — деплой и nginx  
- `MIGRATION_AUDIT.md` — Capacitor / static export ограничения  
- Family Map: `src/app/tools/family/components/FamilyMap.tsx` — **не мигрируем**, только переиспользуем опыт tile-proxy
