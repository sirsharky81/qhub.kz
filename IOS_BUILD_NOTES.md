# iOS Build Notes — QHub Capacitor

## Prerequisites
- Apple Developer account
- Mac or CI with macOS (GitHub Actions `macos-latest` / Codemagic)
- Xcode 15+

## Open project
```
npm run build:capacitor
open ios/App/App.xcworkspace
```

## Info.plist (background location)
Already required keys for `@capacitor-community/background-geolocation`:
- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `UIBackgroundModes` → `location`

## App Review checklist
- [ ] Purpose strings explain family safety use case (not generic)
- [ ] App Review Notes: parent/child demo accounts for reviewer
- [ ] Explain why `Always` location is required (background child safety)
- [ ] User education screen before system permission dialog
- [ ] Note: if child force-quits app via App Switcher, background tracking stops until reopen

## Privacy Manifest
- `ios/App/App/PrivacyInfo.xcprivacy` — Precise Location, User Content, no tracking

## Publication build
CI builds simulator only. Signed `.ipa` requires certificates in Codemagic or manual Xcode archive.
