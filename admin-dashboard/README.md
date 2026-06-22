# GasBot Operations Console

Enterprise monitoring dashboard for supervisors and administrators.

## Tech Stack
- Vite + React 18 + TypeScript
- Tailwind CSS
- react-leaflet (for live maps)
- Pure browser CSV export

## Setup & Run

```bash
cd admin-dashboard
npm install
npm run dev
```

Open http://localhost:5175

## Features Implemented

- **Live Map**: react-leaflet with simulated real-time agent positions via WebSocket pattern. Color-coded markers by status. Clickable popups.
- **Product Catalog**: Full CRUD for cylinders + zone management (polygon points).
- **Transactions Table**: Advanced filtering (status, date, reference, agent), client-side sorting, and instant CSV export.
- **Auth Context**: Mock login with token persistence (ready for real JWT integration).
- **Layout**: Clean, professional dark theme suitable for operations monitoring.

## Real-time Integration Notes

The map currently uses simulated updates. To connect to the real backend:
- Replace the mock interval in `LiveMapDashboard.tsx` with a real `WebSocket` connection to `ws://localhost:3000/ws/agents` (or use Server-Sent Events).
- The backend would need to emit `AgentLocationUpdate` events (see types).

## Next Steps for Production
- Add real JWT validation against the existing NestJS AuthModule.
- Connect product catalog to backend CRUD endpoints.
- Wire transactions table to real `/api` data.
- Add role-based access (ADMIN vs SUPERVISOR).
- Implement proper Leaflet marker clustering for large fleets.

Built as a high-density, data-rich administrative tool for GasBot operations.
