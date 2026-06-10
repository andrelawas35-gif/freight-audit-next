# Freight Audit Console — Next.js Starter

This is your design files converted to a real Next.js app connected to Airtable.
It's set up so you can add your marketing site and client portal later
in the same codebase.

## What's inside

```
freight-audit-next/
├── app/                    ← pages (each folder = one URL)
│   ├── layout.tsx          ← sidebar + topbar shell (wraps every page)
│   ├── globals.css         ← your design tokens (dark/light, colors, etc.)
│   ├── page.tsx            ← "/" — Today dashboard (fetches from Airtable)
│   ├── queue/page.tsx      ← "/queue" — Audit queue
│   ├── disputes/page.tsx   ← "/disputes" — Disputes pipeline
│   ├── carriers/page.tsx   ← "/carriers" — Carrier scorecards
│   └── clients/page.tsx    ← "/clients" — Client portfolio
├── components/             ← reusable UI pieces
│   ├── sidebar.tsx         ← navigation sidebar
│   ├── topbar.tsx          ← page title bar
│   └── action-queue.tsx    ← interactive audit list
├── lib/                    ← backend logic (runs on server only)
│   ├── airtable.ts         ← reads/writes Airtable (YOUR PAT STAYS HERE)
│   ├── types.ts            ← TypeScript types matching your tables
│   └── format.ts           ← fmtUSD, fmtDate, etc.
├── .env.local.example      ← copy this to .env.local and add your PAT
├── package.json
└── tsconfig.json
```

## Setup (15 minutes)

### 1. Install Node.js
Download from https://nodejs.org (get the LTS version). Run the installer.

### 2. Open the project
Open a terminal (Mac: Terminal app, Windows: PowerShell) and navigate
to where you saved this folder:

```bash
cd path/to/freight-audit-next
```

### 3. Install dependencies
```bash
npm install
```

This downloads React, Next.js, and the Airtable library. Takes ~30 seconds.

### 4. Connect Airtable
Copy the example env file:

```bash
cp .env.local.example .env.local
```

Open .env.local in your code editor and paste your credentials:

```
AIRTABLE_PAT=patXXXXXXXXXXXXXX
AIRTABLE_BASE_ID=appXog9VElrqd3MQm
```

**To get your PAT:**
1. Go to https://airtable.com/create/tokens
2. Click "Create new token"
3. Name: "Freight Audit Console"
4. Scopes: check `data.records:read` and `data.records:write`
5. Access: select your freight audit base
6. Click "Create token" and copy it

### 5. Run it
```bash
npm run dev
```

Open http://localhost:3000 in your browser. You should see your
dashboard with real data from Airtable.

## How it connects to Airtable

```
Browser (your design)
    ↓ page loads
Next.js Server (runs on your machine / Vercel)
    ↓ uses your PAT (never sent to browser)
Airtable API
    ↓ returns records
Next.js Server
    ↓ renders HTML with real data
Browser (sees the finished page)
```

Your PAT is in .env.local which:
- Is NOT sent to the browser (server-side only)
- Is NOT committed to git (.gitignore)
- Is set as an environment variable on Vercel when you deploy

## How pages work

Every page follows the same pattern:

```tsx
// This runs on the SERVER, not in the browser
export default async function MyPage() {
  // 1. Fetch data from Airtable
  const records = await fetchRecords('Disputes', {
    filterByFormula: `{Status} = 'Open'`,
  });

  // 2. Render it
  return <DisputeTable disputes={records} />;
}
```

No useState, no useEffect, no loading spinners for data fetching.
The page waits for the data, then sends the finished HTML.

## Adding your design components

Your Claude design files map to this project like this:

| Your file              | Where it goes                          | What to change                          |
|------------------------|----------------------------------------|-----------------------------------------|
| `screen_dashboard.jsx` | `app/page.tsx`                         | Already converted — enhance with your full UI |
| `screen_queue.jsx`     | `app/queue/page.tsx` + `components/`   | Split interactive parts with 'use client' |
| `screen_disputes.jsx`  | `app/disputes/page.tsx` + `components/`| Same pattern                            |
| `screen_carriers.jsx`  | `app/carriers/page.tsx`                | Same pattern                            |
| `screen_clients.jsx`   | `app/clients/page.tsx`                 | Same pattern                            |
| `components.jsx`       | Split into `components/*.tsx`          | One file per component                  |
| `command_palette.jsx`  | `components/command-palette.tsx`       | Add 'use client', import in layout      |
| `data.js`              | DELETE — replaced by lib/airtable.ts   | Data comes from Airtable now            |
| `styles.css`           | `app/globals.css`                      | Already copied                          |
| `app.jsx`              | DELETE — replaced by layout.tsx        | Routing is file-based now               |
| `tweaks-panel.jsx`     | DELETE (design tool, not needed)       | Was for prototyping only                |

### Converting a screen (example)

Your old `screen_queue.jsx` starts with:
```jsx
function AuditQueue({ data, onAct, onDismiss, ... }) {
  const [selected, setSelected] = useState(new Set());
  // ... interactive UI
}
```

In Next.js, split it into two parts:

**Server part** — `app/queue/page.tsx`:
```tsx
import { fetchRecords } from '@/lib/airtable';
import { QueueView } from '@/components/queue-view';

export default async function QueuePage() {
  const results = await fetchRecords('Audit Results', {
    filterByFormula: `{Outcome} = 'FLAGGED'`,
  });
  return <QueueView results={results} />;
}
```

**Client part** — `components/queue-view.tsx`:
```tsx
'use client';
import { useState } from 'react';

export function QueueView({ results }: { results: any[] }) {
  const [selected, setSelected] = useState(new Set());
  // ... your existing interactive UI code goes here
  // Replace FA.auditResults with the `results` prop
  // Replace FA.RULES[r.rule] with inline data or a lookup
}
```

## Where the marketing site and client portal go

When you're ready, add these folders:

```
app/
├── (admin)/              ← internal tool (rename current pages into here)
│   ├── layout.tsx        ← admin sidebar
│   ├── page.tsx          ← today dashboard
│   ├── queue/
│   ├── disputes/
│   ├── carriers/
│   └── clients/
├── (marketing)/          ← public website
│   ├── layout.tsx        ← marketing header/footer
│   ├── page.tsx          ← homepage
│   ├── pricing/
│   └── contact/
└── (portal)/             ← client login portal
    ├── layout.tsx        ← portal nav (simpler)
    ├── dashboard/        ← client BI dashboard
    └── recoveries/       ← client recovery history
```

The parentheses `(admin)` are Next.js "route groups" — they let each
section have its own layout without affecting the URL. Same codebase,
same Airtable connection, same deploy.

## Deploy to Vercel

When ready to put it online:

1. Push to GitHub: `git init && git add . && git commit -m "initial" && git push`
2. Go to https://vercel.com, import the repo
3. Add environment variables (AIRTABLE_PAT, AIRTABLE_BASE_ID)
4. Deploy

Your internal tool is live. Add Vercel password protection for security
(Settings → Security → Password Protection).

## Next steps

1. ✅ Get it running locally with real Airtable data
2. Convert screen_queue.jsx (your most complex screen) next
3. Convert screen_disputes.jsx
4. Add write actions (file dispute → createRecord in Airtable)
5. Deploy to Vercel
6. Add marketing site pages
7. Add client portal with auth
