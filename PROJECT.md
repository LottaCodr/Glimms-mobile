# GLIMMS Project Notes

GLIMMS is an Expo + React Native app for personalized styling and outfit suggestions.

## Main Flow

1. Splash screen (`app/index.tsx`)
2. Onboarding route (`/(onboarding)`)
3. Style setup (`app/screens/style-setup.tsx`)
4. Processing (`app/screens/processing.tsx`)
5. Results (`app/screens/results.tsx`)

## Run Locally

```bash
npm install
npm run start
```

Other scripts:

- `npm run android`
- `npm run ios`
- `npm run web`
- `npm run lint`

## Current Status

- UI screens for setup, processing, and results are in place.
- Style setup collects weather, occasion, color preference, and vibe.
- Processing screen currently simulates generation progress.
- Results screen currently renders sample data and actions.
