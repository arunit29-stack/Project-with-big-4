# Classroom But Better (CBB)

Next.js 15 app with memory-only JWT auth (EXIT_ON_CLOSE), role-based routing, and real-time notifications.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login).

### Demo accounts

| Email | Password | Role | Home |
|-------|----------|------|------|
| student@cbb.edu | password | student | `/class` |
| teacher@cbb.edu | password | teacher | `/dashboard` |
| admin@cbb.edu | password | admin | `/admin` |

### Student `/class`

- Course grid from `GET /api/students/me/courses` (SWR)
- **Join a Class** → `POST` with course code (optimistic update + revalidate)
- Try code `BIO-101-A` (enrolment open) or create a course as teacher first

### Teacher `/dashboard`

- Course grid from `GET /api/teachers/me/courses` (SWR)
- **Create Course** modal → `POST` with name, code, description, enrolment toggle

### Course shell

- `/class/[courseId]` and `/dashboard/[courseId]`
- Sidebar tabs; active tab in `?tab=` (e.g. `?tab=content-library`)
- AI Assistant tab disabled (Phase 2)
- All UI strings in `src/locales/en.json`

### Content library (`?tab=content-library`)

- Folder tree: weeks → topics → PDFs / videos
- **PDF:** react-pdf viewer (pages, zoom, fullscreen, download); students can highlight + per-page notes (private, persisted via `POST /api/courses/:courseId/annotations`)
- **Video:** HLS player (hls.js), chapters, searchable transcript, timestamped student notes
- **Teacher upload:** tus-js-client resumable upload with progress % and “Resuming upload…” on retry
- Students only see **Ready** items; teachers see status chips (Uploading / Processing / Ready / Failed + retry)

Set `INSTITUTION_SSO_CONFIGURED=true` in `.env.local` to show the institution SSO button.

## Auth architecture

- **Token storage:** in-memory only via `AuthProvider` (React Context + `useReducer`). Never `localStorage` / `sessionStorage`.
- **Refresh:** token is cleared; user must sign in again.
- **Guards:** `withAuth` → `/login`; `withRole(['teacher'])` → role home.
- **EXIT_ON_CLOSE:** `beforeunload` + `visibilitychange` → `navigator.sendBeacon('/api/auth/session-beacon', token)`.

## Notifications

- Bell in top nav on authenticated pages.
- WebSocket: `/ws/notifications` (requires a custom Node server or reverse proxy; Next.js API routes do not upgrade WS by default).
- Drawer open → `PATCH /api/notifications/read-all`
- Clear all → `DELETE /api/notifications`
# Project-with-big-4
