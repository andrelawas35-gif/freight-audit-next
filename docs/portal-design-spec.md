# Aurelian Collective — Client Portal Design Spec

Spec for the three client-facing pages: **Sign in**, **Client dashboard**, **Upload file**.
Matches the live implementation. Use as the brief for Claude Design.

## Shared design tokens (dark theme)

From `app/globals.css`.

| Token | Value (oklch) | Use |
|-------|--------------|-----|
| `--surface` | `0.215 0.006 80` | cards, header bars |
| `--surface-sunk` | `0.20 0.005 80` | page background, input fields |
| `--surface-2` | `0.245 0.006 80` | raised elements |
| `--hover` | `0.27 0.007 80` | hover states |
| `--ink` | `0.96 0.003 80` | primary text |
| `--ink-2` | `0.80 0.005 80` | secondary text |
| `--ink-3` | `0.62 0.006 80` | muted labels |
| `--ink-faint` | `0.46 0.005 80` | faint/sub text |
| `--line` | `0.30 0.006 80` | borders |
| `--line-2` | `0.265 0.006 80` | inner row dividers |
| `--green` / `--green-ink` | `0.74 0.15 152` / `0.80 0.16 152` | recovered $ |
| `--amber` / `--amber-ink` | `0.78 0.15 70` / `0.84 0.14 75` | in-dispute $ |
| `--blue` / `--blue-ink` | `0.70 0.14 244` / `0.78 0.13 244` | primary buttons / links |

- **Radii:** `--radius-sm` 5px · `--radius` 8px · `--radius-lg` 11px
- **Type:** system sans for UI; `mono` class for numbers/IDs.

---

## 1. Sign in (`/login`)

Full-viewport, centered, `--surface-sunk` background, 24px padding. Centered column max-width **380px**.

```
        Aurelian Collective          ← 19px / weight 800, centered
   Freight Audit · Client Portal     ← 12.5px, --ink-3   (22px gap below)

  ┌──────────────────────────┐
  │ Sign in            15/700  │       card: --surface, 1px --line,
  │ [error banner if any]      │       radius-lg, 24px padding
  │ Email                      │       label 11.5px/600 --ink-2
  │ [ you@company.com        ] │       input: sunk bg, --line, 5px radius,
  │ Password                   │              9x11px pad, 13px
  │ [ ........               ] │
  │ [      Sign in          ]  │       blue btn, full width, 700
  │   No account? Create one   │       12px, link in --blue-ink
  └──────────────────────────┘
```

- **Error banner:** red-tinted (`oklch(0.30 0.08 25)` bg, `oklch(0.86 0.10 25)` text), 8x11px, 12px. Copy: "Invalid email or password."
- **Button states:** default blue; disabled = 0.6 opacity, label "Please wait…".

### Signup (`/signup`)
Same shell. Title "Create your account". Fields: Your name, Company, Email, Password (helper "At least 8 characters"). Footer: "Already have an account? Sign in".

---

## 2. Client dashboard (`/portal`)

**Shell (portal layout):** sticky top header, 52px tall, `--surface` bg, bottom `--line` border, 20px horizontal padding:

`[Aurelian Collective 800/15]  [Dashboard] [Upload data]  …  [user name 12.5 --ink-3]  [Sign out btn]`

Content area: max-width **1040px**, centered, 24px padding.

```
Company Name                              ← 20px / 800
Freight overcharge recovery, working on your behalf.   ← 13px --ink-3

┌─────────┬──────────┬──────────┬──────────┐  4-col grid, 12px gap
│Recovered│In dispute│ Active   │  Total   │
│ $12,400 │  $3,200  │ disputes │ disputes │  stat cards
│ (green) │ (amber)  │    5     │    18    │
└─────────┴──────────┴──────────┴──────────┘

┌────────────────────┬────────────────────┐  2-col grid, 16px gap
│ Recently recovered │ Working on your     │
│                    │ behalf              │
│ DISP-001    $2,100 │ DISP-014    $640    │  rows: ID(mono 12/600)
│ Jun 12      (green)│ In review   (amber) │       + sub(10.5 faint)
│ ────────────────── │ ──────────────────  │       + amount(mono 13/700)
│ … up to 6 rows     │ … up to 6 rows      │
└────────────────────┴────────────────────┘
```

- **Stat card:** `--surface` bg, 1px `--line`, radius 8px, 14x16px pad. Label 11px uppercase `--ink-3`; value 24px/800 (green/amber/default tone).

**Data (scoped to logged-in client's `clientId`):**
- **Recovered** = sum `Recovery amount` where `Status = 'Won'`
- **In dispute** = sum `Disputed amount` where status not Won/Closed
- **Active disputes** = count not Won/Closed · **Total** = all disputes
- **Recently recovered** = Won disputes (ID, resolved date, recovery $)
- **Working on your behalf** = open disputes (ID, status, disputed $)

**States:**
- Empty lists: "No recoveries yet." / "No open disputes." (12.5px `--ink-faint`)
- No client linked: heading "Welcome" + contact-account-manager message (no stats).

---

## 3. Upload file (`/portal/upload`)

Same portal shell. Content max-width **620px**.

```
Upload shipment data                       ← 20px / 800
Upload a CSV export from your WMS or        ← 13px --ink-3
shipping platform. We match it against
carrier invoices to find overcharges.

┌──────────────────────────────────────┐  card: surface, line, radius 8, 20px pad
│ Shipment CSV file        12.5/600      │
│ [ Choose file ]                        │  native file input, .csv
│ [   Upload & stage   ]                 │  blue btn, 9x16px, 700
└──────────────────────────────────────┘

[result banner — green on success / red on error]

Accepted columns                           ← 12.5/700 --ink-2
Headers are matched flexibly (case-insensitive).
Include at least a tracking number or PRO number.
Other recognized columns: carrier, weight, length,
width, height, origin zip, destination zip, address
type, service level, ship date, reference/order number.
```

**Result banner states:**
- **Success** (green-soft bg, green-line border, green-ink text): "Staged **N** shipment(s) from M row(s). X skipped (no tracking/PRO). Y failed."
- **Error** (red-tinted): e.g. "Please choose a CSV file to upload." / "No usable rows found…"
- **Pending:** button "Uploading…", 0.6 opacity.

---

## Source files

- **Sign in:** `app/(auth)/layout.tsx`, `components/auth/login-form.tsx`, `components/auth/auth-ui.tsx`
- **Dashboard:** `app/(portal)/portal/page.tsx`, `app/(portal)/portal/layout.tsx`
- **Upload:** `app/(portal)/portal/upload/page.tsx`, `components/portal/upload-form.tsx`
