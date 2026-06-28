# Guitar Tuner — Acceptance Checklist (Section G)

Manual verification on real devices before removing `beta: true`.

## Metrics

- [ ] First stable note <450 ms (E2/E1, clean pluck)
- [ ] Frequency error ≤1 cent (sustained, confidence ≥70%)
- [ ] UI needle FPS ≥60 (30 sec average, DevTools Performance)
- [ ] CPU <10% on mid-range Android (60 sec active tuning)
- [ ] RAM <40 MB (worklet + buffers + IndexedDB)
- [ ] False positives <1% (10 min noise, no instrument)
- [ ] Resume from background <300 ms (iOS + Android)

## iOS devices (F.3)

Test on each: Safari, installed PWA, lock screen return, orientation change, Bluetooth mic.

- [ ] iPhone SE
- [ ] iPhone 13/14
- [ ] iPhone 15/16
- [ ] iPad

## Scenarios

- [ ] Permission granted first launch
- [ ] Permission denied → iOS Safari instructions shown
- [ ] PWA standalone first getUserMedia fail → hint shown
- [ ] MicSelector hidden when device labels empty
- [ ] AudioWorklet fallback banner on unsupported browsers
- [ ] Instrument/tuning switch shows "Listening..." briefly
- [ ] A4 calibration persists after reload (IndexedDB)
