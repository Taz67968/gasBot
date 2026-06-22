# GasBot Agent PWA

Standalone mobile-first Progressive Web App for Delivery Agents.

## Features
- Fully responsive mobile shell (max 420px)
- Real-time assignment offers via simulated WebSocket
- 90-second countdown OfferAlertModal with progress bar
- Active route view with native maps launch
- Hand-payment confirmation with mandatory security toggle
- Offline-first with IndexedDB queue + Background Sync
- Service Worker with Workbox (NetworkFirst + CacheFirst)

## Tech Stack
- React 18 + TypeScript
- Tailwind CSS
- Vite + VitePWA
- Workbox 7
- idb (IndexedDB wrapper)

## Quick Start

```bash
cd agent-pwa
npm install
npm run dev
```

Open http://localhost:5174 on a mobile device or Chrome DevTools mobile emulator.

## Offline Testing

1. Go offline in DevTools (Application → Offline)
2. Accept an assignment
3. Trigger "Confirm Cash & Complete Delivery" → it will be queued in IndexedDB
4. Go back online → the queue flushes automatically via Background Sync or `online` event

## Service Worker

The service worker (`public/sw.js`) uses:
- **CacheFirst** for static assets
- **NetworkFirst** for API routes (with expiration)
- **Background Sync** registration for `sync-payments`

## Production Notes

- Replace simulated offers with a real WebSocket connection to your backend
- Add proper JWT authentication from the backend AuthModule
- Use the real `/api/v1/payments/agent-confirm` endpoint (already implemented in the NestJS backend)
- Add push notifications for assignment offers (Web Push + VAPID)
- Store agent JWT in IndexedDB or secure storage

## Folder Structure

```
agent-pwa/
├── public/
│   └── sw.js                 # Workbox + Background Sync SW
├── src/
│   ├── components/
│   │   ├── OfferAlertModal.tsx
│   │   ├── ActiveRouteView.tsx
│   │   └── HandPaymentVerification.tsx
│   ├── hooks/
│   │   └── useOfflineSync.ts
│   ├── App.tsx               # Main driver control shell
│   └── types.ts
└── ...
```

Built for high-reliability operation in low-connectivity regions across Central Africa.
