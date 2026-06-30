# Android Build Notes — QHub Capacitor

## Local build
```
npm run build:capacitor
npx cap run android
```

## Permissions (AndroidManifest)
- `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` — passport photo, document scanner, QR scanner, guitar tuner
- `ACCESS_FINE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION`

## Google Play Data Safety (manual in Play Console)
- **Location** — Precise, collected for family safety, sent to qhub.kz backend
- **Device ID** — Push notification token
- **User content** — Messenger messages (E2E encrypted in transit)

## OEM battery optimization
Show `OemBatteryGuide` on Xiaomi/Oppo/Vivo/Huawei devices (`src/lib/platform/oem-guide.tsx`).

## Debug APK (CI)
`cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/`
