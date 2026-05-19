# Storage Helper

A floorplan-based storage and item locator. React frontend on GitHub Pages, Firestore as the only persistence layer. No backend.

## Stack

- React 18 + Vite (static build to `dist/`)
- Firestore (`firebase` v10) — the only DB
- React Router (hash-free, basename = repo path)
- Deployed via GitHub Actions to GitHub Pages

## Data model

```
floorplans/{floorplanId}                          { name, width, height }
  units/{unitId}                                  { name, kind, x, y, w, h }
    items/{itemId}                                { name, quantity, tags[], notes, photoUrl,
                                                    storageUnitId, floorplanId,
                                                    nameLower, tagsLower }
```

`nameLower` / `tagsLower` are stored to support case-insensitive substring search via a `collectionGroup('items')` scan (client-side filtering — fine for personal-scale inventories).

## Local development

```
cp .env.example .env
# fill in Firebase web-app config from the Firebase Console
npm install
npm run dev
```

Then open the printed URL.

## Build

```
npm run build
```

Outputs `dist/` (fully static — HTML/JS/CSS only).

## Deploy to GitHub Pages

1. Push to GitHub. Repo name will be used as the base path (`/<repo>/`).
2. In repo **Settings → Pages**, set Source = "GitHub Actions".
3. In **Settings → Secrets and variables → Actions**, add repository secrets:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. Push to `main`. The `Deploy to GitHub Pages` workflow builds and publishes.

The workflow copies `index.html` to `404.html` so client-side routing survives deep links.

## Firestore setup

1. Create a Firebase project, enable Firestore in **production** mode.
2. Register a Web app and copy the config into the repo secrets above.
3. Deploy the security rules in `firestore.rules`:

   ```
   firebase deploy --only firestore:rules
   ```

   The included rules are open-read/open-write with shape validation. They are **not** `allow read, write: if true` — but they are still permissive (no auth). Add auth and tighten before sharing the URL publicly.

## Features

- **Floorplans**: create with name + canvas dimensions. Listed on the home page.
- **Editor**: drag to move, drag corner handle to resize, click empty canvas to deselect. Each unit has a name and kind (box/shelf/drawer/room/cabinet).
- **Items**: add/edit/delete inside a unit's panel. Deleting a unit that contains items is blocked — move/delete them first.
- **Search**: the top bar searches across all items (name and tags, case-insensitive substring). Clicking a result jumps to the floorplan and highlights the unit (pulsing red outline).

## Non-goals

Auth, real-time multi-user, mobile-native, 3D, offline-first, image uploads.
