# iPhone / PWA: как не сломать скролл (OBD и главная QHub)

## Главная страница (`/`)

1. **На iPhone не монтировать dnd-kit вообще** — только кнопки ↑↓ (`useCoarsePointer`); на desktop — drag за ⋮⋮, `autoScroll={false}`.
2. **Не вешать `{...listeners}` dnd-kit на всю карточку** — iOS путает скролл с drag при смене направления свайпа.
3. **Не использовать `touch-action: pan-y` на `body`** вместе с overscroll — может усилить дрожь при «вниз‑вверх‑вниз».
4. **`.app-card:hover` transform только для `(hover: hover)`** — на touch ложный hover при инерции двигает карточки.
5. **Не использовать `overflow-hidden` на больших секциях hero** — достаточно `overflow-x-clip`; `hidden` создаёт лишний scrollport.
6. **Не дублировать `overflow-x-clip` на обёртке в `layout.tsx` и `body`** — горизонталь режет только `html` в `globals.css`.
7. **Стабильная высота счётчиков hero** (`HomeStats`) до загрузки каталога — иначе скачок при первом скролле.
8. **Главная — нативный scroll документа**, не `position:fixed` inner pane (на iOS после rubber-band сверху inner pane дёргается). Используйте `HomeIosScrollGuard` — блок только pull-down на `scrollTop=0`.
9. **На touch отключать `.bg-dot-grid`** (см. `globals.css`) — иначе дрожь при скролле вниз по hero.
10. **Не возвращать `html/body { height:100% }` + flex-обёртку** в `layout.tsx`.

---

# OBD (`/tools/obd-diag`)

Центральный экран `/tools/obd-diag` должен иметь **один** вертикальный scrollport. Дрожание почти всегда из‑за второго скроллера или частых перерисовок во время жеста (особенно у верхней части страницы).

## Нельзя

1. **`overflow-y: auto/hidden/scroll` или `overflow-x: hidden` на `body`/`html`** — iOS создаёт второй scrollport. Горизонталь только `overflow-x: clip` на `html` (см. `globals.css`).
2. **Вложенные скроллеры** — `max-h-*` + `overflow-y-auto` внутри `ObdScrollShell` (списки DID, дампы, лента CAN). Контент должен растягивать **общую** панель.
3. **Частый `setState` в циклах** (CAN ATMA, Live UDS, TCM, руль, live PID) **без паузы на время скролла** — используйте `useObdScroll().deferUiUpdate()` или ref + один flush в `registerScrollFlush`.
4. **Менять высоту шапки при скролле** — блоки «Проверка Bluetooth», подсказки transport, баннер «подключите адаптер» не должны внезапно появляться/исчезать без резервирования места, если пользователь уже скроллит.
5. **Второй `position: fixed` scrollport** с `overflowY: auto` вне `ObdScrollShell` — вся страница OBD живёт в `ObdScrollShell` (`layout.tsx`).

## Нужно

- Любой новый live‑опрос: обновлять ref в цикле, UI — через `deferUiUpdate` или flush после `scrollEnd`.
- Длинные таблицы: `overflow-x-clip`, `table-fixed`, `break-all`, без горизонтального скролла.
- Тест на iPhone PWA: скролл **с самого верха** (rubber band) без адаптера и с включённым Live CAN/TCM.

## Где смотреть код

- `ObdScrollShell.tsx` — фиксация document + единственная прокрутка.
- `ObdScrollContext.tsx` — `deferUiUpdate`, `registerScrollFlush`, `scrollingRef`.
