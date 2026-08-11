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
   npm install
   ```

2. **Run the app**

   ```bash
   npm run start
   # or
   npx expo start
   ```

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
