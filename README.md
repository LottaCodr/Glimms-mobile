## GLIMMS

AI‑powered personal styling and outfit recommendations built with **Expo**, **React Native**, and **Expo Router**.

GLIMMS helps users:

- Discover outfit ideas tailored to their **weather**, **occasion**, and **style vibe**
- Upload pieces from their **closet** and get smart combinations
- Save favorite looks and manage styles over time

---

### Tech Stack

- **Framework**: Expo + React Native
- **Navigation**: Expo Router (file‑based routing)
- **State Management**: Zustand
- **Data Fetching**: TanStack Query
- **UI**: React Native, Expo components, custom theming via `ThemeProvider`

---

### App Structure (High Level)

- **Onboarding / Setup**
  - `app/index.tsx`: initial entry / splash
  - `app/(onboarding)`: onboarding flow
  - `app/screens/style-setup.tsx`: collect weather, occasion, color preferences, vibe
  - `app/screens/processing.tsx`: shows progress while generating recommendations
  - `app/screens/results.tsx`: displays suggested outfits and actions

- **Main Tabs** (`app/(tabs)`)
  - `home.tsx`: hero recommendations, trending styles
  - `closet.tsx`: manage and browse uploaded wardrobe items
  - `upload.tsx`: upload / capture new items
  - `saved.tsx`: saved styles and looks
  - `profile.tsx`: account and preferences

- **Key Folders**
  - `components/`: reusable UI (home, closet, saved styles, layout, etc.)
  - `hooks/`: domain hooks (`useUpload`, `useAITagging`, `useAuth`, `useTheme`, etc.)
  - `services/`: API integration (`style.service.ts`, `upload.service.ts`, `weather.service.ts`, etc.)
  - `store/`: Zustand stores for AI, auth, closet, style setup, outfits, uploads, user
  - `constants/`: routes, copy, and limits

For some additional implementation notes, see `PROJECT.md`.

---

### Getting Started

1. **Install dependencies**

   ```bash
   npm ci
   ```

2. **Run the app with the project-local Expo CLI**

   ```bash
   npm run start
   # or, to discard the Metro cache
   npm run start -- --clear
   ```

   Avoid the legacy global `expo start` command. Using the local CLI keeps Expo,
   Metro, and Expo Router on the versions recorded in `package-lock.json`.

3. **Open on a device / emulator**

   From the Expo CLI UI you can:

   - Run on an **Android emulator**
   - Run on an **iOS simulator**
   - Use **Expo Go** on a physical device

---

### Available Scripts

- `npm run start` – start the Expo dev server
- `npm run android` – run the app on Android
- `npm run ios` – run the app on iOS
- `npm run web` – run the app in a web browser
- `npm run lint` – run ESLint on the project
- `npm run reset-project` – reset to a fresh Expo project template (use with caution)

---

### Environment & Config

- Project configuration: `app.json`
- Environment / API config: `config/env.ts` (add your keys and base URLs here as needed)

If you introduce new environment values, prefer reading them from `env.ts` so configuration stays in one place.

---

### Windows / Android troubleshooting

If Metro reports an invalid `require.context` call, first make sure the local CLI
and locked dependencies are being used:

```powershell
# Stop any Expo/Metro terminal first, then run from the project directory.
Remove-Item -Recurse -Force node_modules, .expo -ErrorAction SilentlyContinue
npm ci
npm run start -- --clear
```

If port 8081 remains occupied, find and stop only the process using it:

```powershell
Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

For a physical phone, keep the computer and phone on the same network and use
LAN mode. If LAN discovery is blocked, use `npm run start -- --tunnel`. A QR code
containing `127.0.0.1` is only reachable from the computer itself.

`cmd: Can't find service: package` is an Android emulator/ADB failure, not a
Metro bundle error. Wait until Android has fully booted, then cold-boot the
emulator and restart ADB:

```powershell
adb kill-server
adb start-server
adb devices
```

If `adb shell cmd package list packages` still says that the `package` service
is missing, wipe/recreate that Android Virtual Device with a current Google APIs
system image.

---

### Development Notes

- The app uses **Expo Router**; screens are defined by files in the `app` directory.
- Bottom tab navigation is configured in `app/(tabs)/_layout.tsx`, which wires up icons, colors, and animations.
- Global theming is provided by `provider/ThemeProvider.tsx` and tokens under `styles/tokens`.

Before shipping to production, be sure to:

- Fill in real API calls in `services/*`
- Wire onboarding + auth flows under `app/(auth)` and `app/(onboarding)`
- Review limits and copy in `constants/`

---

### License

Internal / private project. No license specified yet.
