# QHub Guitar Tuner — ТЗ v1.0 + Addendum v1.1

Client-only PWA инструмент: `/tools/guitar-tuner`

## Архитектура

- Pitch detection в `AudioWorkletProcessor` (`public/worklets/pitch-processor.js`)
- Main thread: только UI и `port.onmessage`
- Fallback: `AnalyserNode` + main-thread анализ 10 Hz
- Логика: `src/lib/guitar-tuner/`
- Настройки: IndexedDB (`qhub-guitar-tuner`)

## Алгоритмы

- **MPM** (основной) для диапазона <1000 Hz
- **YIN** (fallback) для chromatic >1000 Hz
- Octave correction, Confidence Score, stability gate
- Buffer: 4096 (гитара/укулеле), 8192 (бас)

## iOS

- Скрытие MicSelector без labels
- Resume AudioContext на `visibilitychange:visible`
- PWA-first getUserMedia hint
- Permission denied → инструкция Safari

## Метрики приёмки (раздел G addendum)

| Метрика | Цель |
|---------|------|
| Первая стабильная нота | <450 ms |
| Ошибка частоты | ≤1 cent (sustained) |
| UI FPS | ≥60 |
| CPU Android | <10% |
| RAM | <40 MB |
| Ложные срабатывания | <1% / 10 min |
| Resume из фона | <300 ms |

## Сборка worklet

```bash
npm run build:worklet
```

Включено в `npm run build` перед `next build`.

## Roadmap v2 (вне scope)

Adaptive buffer, Ultra Precision, Low Power, WASM pitch engine.
