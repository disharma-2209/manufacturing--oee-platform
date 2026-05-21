# Manufacturing OEE Intelligence Platform

A full-stack AI-powered platform for analysing manufacturing downtime, computing OEE metrics, detecting correlations, and generating actionable insights using Anthropic Claude.

---

## Features

- **OEE Dashboard** — Overall Equipment Effectiveness with Availability, Performance, and Quality KPIs
- **Downtime Analysis** — Pareto charts, failure heatmaps, incident timelines, team performance
- **OEE Explorer** — Drill-down by production line with radar/bar chart comparisons
- **Correlation Engine** — Statistical correlation matrix across lines, shifts, equipment, and failure categories
- **AI Insights** — Streaming Claude-powered root cause analysis, action plans, shift comparisons, and predictive alerts
- **Action Plans** — Full CRUD with priority/status tracking, assignees, due dates, and Excel export
- **Reports** — Configurable weekly/monthly/custom reports exportable as PDF or Excel
- **Data Upload** — Drag-and-drop Excel/CSV ingestion or one-click synthetic demo data
- **Settings** — OEE goal thresholds, user management, and full audit log
- **Architecture** — Live system architecture diagram and API reference

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend runtime | Node.js 18 + TypeScript |
| Backend framework | Express 4 |
| Database | SQLite (better-sqlite3) |
| AI | Anthropic Claude claude-3-5-sonnet (SSE streaming) |
| Auth | JWT + bcryptjs + RBAC |
| Frontend framework | React 18 + Vite 5 |
| Styling | Tailwind CSS 3 |
| Charts | Recharts |
| State | Zustand + TanStack React Query v5 |
| Icons | Lucide React |
| Data parsing | xlsx (SheetJS) |

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- An [Anthropic API key](https://console.anthropic.com/) (optional — AI features disabled without it)

### 1. Clone and install

```bash
# Install backend dependencies
cd manufacturing-oee-platform/backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure environment

```bash
cd ../backend
cp ../.env.example .env
# Edit .env and set:
#   JWT_SECRET  — any long random string
#   ANTHROPIC_API_KEY — your Claude API key (or leave blank)
```

### 3. Start the backend

```bash
cd backend
npm run dev
# Runs on http://localhost:3001
```

### 4. Start the frontend

```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
```

### 5. First-run setup

1. Open `http://localhost:5173`
2. You will be redirected to `/setup` to create the admin account
3. Log in with your credentials
4. Go to **Data Upload** → click **Load Demo Data** to populate synthetic data
5. Explore the Dashboard, OEE Explorer, AI Insights, etc.

---

## Project Structure

```
manufacturing-oee-platform/
├── backend/
│   ├── src/
│   │   ├── db/           # Schema + initialisation
│   │   ├── middleware/   # Auth (JWT) + RBAC
│   │   ├── routes/       # auth, upload, analyze, ai, actions, settings
│   │   ├── services/     # excel-parser, oee-engine, correlation, ai-service, audit
│   │   ├── types/        # Shared TypeScript interfaces
│   │   └── index.ts      # Express app entry point
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/   # Sidebar, Header
│   │   │   ├── shared/   # KPICard
│   │   │   └── ui/       # Button (shadcn-style)
│   │   ├── lib/          # api-client, utils
│   │   ├── pages/        # All route pages
│   │   ├── store/        # Zustand auth store
│   │   ├── types/        # Frontend TypeScript types
│   │   ├── App.tsx       # Router + layout
│   │   └── main.tsx      # Entry point
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
├── .env.example
├── .gitignore
└── README.md
```

---

## Excel File Format

Upload a `.xlsx`, `.xls`, or `.csv` file with columns:

| Column | Description | Example |
|--------|-------------|---------|
| Report Time | Incident timestamp | `2024-01-08 08:30` |
| Line | Production line name | `Line A` |
| Equipment | Equipment ID | `SMT-01` |
| Shift | Shift name | `Morning` |
| Team | Maintenance team | `Maint A` |
| Category | Failure category | `Mechanical` |
| Root Cause | Root cause description | `Conveyor jam` |
| Duration (hrs) | Downtime duration | `1.5` |
| Planned Time (hrs) | Planned production time | `8.0` |
| Product | Product SKU | `IQ8-M` |
| Week | ISO week number | `1` |

Column names are matched case-insensitively with fuzzy matching.

---

## API Reference

See the **Architecture** page in the app for a full interactive endpoint listing.

Base URL: `http://localhost:3001/api`

All protected endpoints require: `Authorization: Bearer <JWT_TOKEN>`

---

## Development

```bash
# Backend — watch mode
cd backend && npm run dev

# Frontend — hot reload
cd frontend && npm run dev

# Build for production
cd backend && npm run build
cd frontend && npm run build
```

---

## License

Internal use — Enphase Energy Manufacturing Intelligence.
