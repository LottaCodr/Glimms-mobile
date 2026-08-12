# GLIMMS Project Notes

GLIMMS is an Expo + React Native app for personalized styling and outfit suggestions.

## Backend Integration (glimms-api)

Implemented per `FRONTEND_INTEGRATION.md` (glimms-api, arena/019ff0c9-glimms-api):

- **Client** (`services/api.client.ts`): axios against `EXPO_PUBLIC_API_URL` with Bearer attach, `X-Request-Id` propagation, and single-flight 401→refresh with request queueing. Refresh rotates **and persists both tokens** (refresh tokens are single-use server-side). On refresh failure, tokens are cleared and `onAuthFailure` signs the user out.
- **Auth** (`services/auth.services.ts`, `store/auth.store.ts`): register/login/logout + session hydrate with proactive refresh. Screens: `app/(auth)/login.tsx`, `app/(auth)/register.tsx`, `app/(onboarding)/sign-up.tsx`.
- **Scan flow (v1)**: camera/gallery (`app/screens/scan.tsx`) → `POST /v1/design-sessions` → presigned PUTs straight to S3 (`services/sessions.service.ts::uploadImageToS3`) → `/images/complete` → realtime progress on `app/session/[id].tsx` via Socket.IO `subscribe:session` (REST polling fallback). Legacy job events render at `app/jobs/[id].tsx` (push deep-link target).
- **Catalog** (`app/screens/wardrobe.tsx`, `app/catalog/[id].tsx`): infinite scroll with `includeUrls=true`, tag/category filters, item detail with palette/styleTags/attributes and inline edit; expired presigned URLs are re-fetched on image error.
- **Saved designs** (`app/screens/saved.tsx`, `app/saved/[id].tsx`): list/favorite/delete with optimistic favorite toggles; detail hydrates from the query cache.
- **Subscriptions** (`app/paywall.tsx`, `hooks/useSubscription.ts`): env-configured Stripe price IDs → hosted Checkout in expo-web-browser → poll `/api/subscriptions/me` until webhook flips to active.
- **Push** (`services/notifications.service.ts`): native FCM/APNs device tokens (not Expo tokens) registered after login and removed on logout; `data.screen === "designs"` taps deep-link to the job screen.
- **Analytics**: fire-and-forget `POST /api/analytics/track` on scan/save/login; dashboard pills from `GET /api/analytics/me`.
- **Offline**: scans taken offline are queued (AsyncStorage) and auto-flushed on reconnect (`store/offlineQueue.store.ts`).
- **Route guard** (`app/_layout.tsx`): unauthenticated users are confined to `(onboarding)`/`(auth)`; splash routes by session state. React Query provider lives in the root layout and covers every route.

Config: `config/env.ts` reads `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WS_URL` / `EXPO_PUBLIC_STRIPE_*_PRICE_ID` (see `.env.example`). For physical devices use your LAN IP and add it to the backend `ALLOWED_ORIGINS`.

## UI / UX System

- **No emojis in UI** — all iconography is `@expo/vector-icons` (the React Native equivalent of react-icons, which is DOM/SVG-only) via `components/ui/Icon.tsx` (`AppIcon` + `Icons` semantic aliases).
- Reusable primitives in `components/ui/`: `IconButton`, `Chip`, `EmptyState`, `SectionHeader`, `Skeleton`/`TileGridSkeleton`, `PrimaryButton` (gold/outline/ghost/danger variants).
- **Toast system**: `store/toast.store.ts` (`toast.success/error/info/warning`) + animated `<Toaster/>` mounted in the root layout; non-blocking success/error feedback instead of Alert where appropriate.
- Brand-consistent auth screens (dark + gold, icon fields, password strength hint, inline API error boxes), activity feed (`app/activity.tsx`), preferences editor (`app/preferences.tsx`), full-screen upload veil while sessions upload, skeleton loading on home/wardrobe/saved.
- Haptics on tab presses, shutter, buttons (`expo-haptics`).
- Accessibility labels on all icon-only controls.

## Main Flow

1. Splash screen (`app/index.tsx`) → auth restore → onboarding or tabs
2. Onboarding quiz → `PUT /api/users/me/preferences` after registration
3. Scan tab (`app/(tabs)/upload.tsx` → `app/screens/scan.tsx`) → v1 session
4. Progress + results (`app/session/[id].tsx`) → save looks
5. Wardrobe (`closet`) and Saved tabs read from the API

## Run Locally

```bash
npm install
cp .env.example .env   # set EXPO_PUBLIC_API_URL (not API_URL)
npm run start          # wrapper: IPv4-first, skips Expo's remote version fetch
```

If `expo start` itself prints `TypeError: fetch failed` under
`getNativeModuleVersionsAsync`, use `npm start` or `npm run start:offline`.
That error is Expo CLI failing to reach `api.expo.dev`, not an app bug.

Other scripts:

- `npm run android`
- `npm run ios`
- `npm run web`
- `npm run lint`

## Current Status

- Auth, preferences, v1 scan/session pipeline, catalog, saved designs, subscriptions and push notifications are wired to glimms-api.
- UI refreshed end-to-end on the dark-gold design system; emojis replaced with icons.
- Legacy demo screens (`app/screens/style-setup.tsx`, `processing.tsx`, `results.tsx`) are still routable for UI reference but are not part of the integrated flow.
- Known gaps (backend-side, per guide §12/§13): no `/subscriptions/prices` or `/portal` endpoints (price IDs live in env), and push tokens must be native FCM/APNs (needs a dev/prod build, not Expo Go).

