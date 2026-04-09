# Q2 Profit Dashboard

Real-time Q2 2026 profit tracking dashboard for Appodeal revenue_ops and competitors campaigns.

## Features

- **Top 3 Bundles by Profit** - Leaderboard of highest-performing payload tags
- **Q2 Profit Tracker** - Progress toward $110K target with pacing indicators
- **Time Context** - Days elapsed/remaining in Q2 (Apr 1 - Jun 30)
- **Auto-refresh** - Dashboard updates every 5 minutes
- **Server-side caching** - 5-minute cache to avoid hammering BI2 API

## Setup

```bash
cd /Users/lotbot/.openclaw/workspace/q2-dashboard
npm install
```

## Environment

Set the API token (or it defaults to the configured value):

```bash
export APPGROWTH_API_TOKEN="3c7004b4df8f7c9d645f8745f299bcdc"
```

## Run

```bash
npm start
```

Dashboard available at: **http://localhost:3470**

## API Endpoints

- `GET /` - Dashboard UI
- `GET /api/profit` - JSON profit data
- `GET /health` - Health check

## Data Source

- **BI2 API**: `https://app.appgrowth.com/bi2/`
- **Filters**: `role: ['revenue_ops', 'competitors']`
- **Date Range**: 2026-04-01 to 2026-06-30
- **Measures**: profit, revenue, gross_spend

## Future Integrations

- Confluence learnings section
- Campaign health score tracking
