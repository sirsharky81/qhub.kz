# iPhone / PWA: как не сломать скролл (OBD и главная QHub)

## Главная страница (`/`)

1. **Не вешать `{...listeners}` dnd-kit на всю карточку избранного** — только на ручку ⋮⋮; иначе iOS путает вертикальный скролл с drag (`autoScroll={false}` в `DndContext`).
2. **Не использовать `overflow-hidden` на больших секциях hero** — достаточно `overflow-x-clip`; `hidden` создаёт лишний scrollport.
3. **Не дублировать `overflow-x-clip` на обёртке в `layout.tsx` и `body`** — горизонталь режет только `html` в `globals.css`.
4. **Избегать резкого появления блока «Избранное»** после hydrate без резерва места — иначе скачок layout у стыка hero / favorites.

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
