# ADR 0010 — Marketing Site Architecture (Single Next.js App, Single Domain, Single Vercel Project)

- **Status**: ACCEPTED
- **Date**: 2026-06-26
- **Deciders**: Controller (grilling session)
- **Related**: ADR 0004 (gateway as mode), middleware.ts, auth.config.ts, sidebar.tsx

## Context

`aureliancollective.io` today runs a single Next.js 15 app on Vercel. The root (`/`) serves the staff console dashboard. Authenticated routes are split into two groups: `/portal/*` (any signed-in user) and everything else (staff-only). There is no public marketing surface — no homepage, no pricing, no blog — just `/login` and `/signup` as the only unauthenticated pages.

We need to add a public marketing site alongside the existing client portal and staff console. The marketing site must be authorable, SEO-friendly, and share the same domain so Auth.js JWT cookies work across all surfaces. It must not require a separate Vercel project, subdomain, or CMS lock-in.

This ADR records six architectural decisions from a grilling session about how to fit four surfaces (marketing, login, portal, console) into a single Next.js app on Vercel without breaking existing auth, middleware, or route protection.

---

## Decision 1: Single Domain — All Four Surfaces on `aureliancollective.io`

**Decision**: All four surfaces — (a) public marketing, (b) login/signup, (c) client portal, (d) staff console — live on `aureliancollective.io`. No subdomains.

**Rationale**: Auth.js issues a single JWT session cookie scoped to the domain. Subdomains (`app.`, `console.`, `www.`) would require cookie-domain gymnastics, CORS configuration, and a shared session store — none of which exist today. Keeping everything on one domain means zero auth changes, zero cookie scoping work, and zero cross-origin concerns. The route path is the boundary.

**Consequences**:
- No DNS changes, no `AUTH_TRUST_HOST` reconfiguration.
- Auth.js `session: { strategy: 'jwt' }` already works across all paths on the same domain — no code changes needed.
- SEO for marketing pages benefits from the same domain authority as the product (no domain split to dilute ranking).
- If a subdomain is ever needed later (e.g., `docs.aureliancollective.io`), it's an independent Next.js app with its own auth — not part of this ADR.

**Alternatives considered**: `www.aureliancollective.io` marketing + `app.aureliancollective.io` product (requires shared session store, CORS, cookie domain config — extra infrastructure for no business value at this scale). Rejected.

---

## Decision 2: Console at `/console` — Route Group Nesting

**Decision**: The staff console moves from root (`/`) to `/console` via `app/(console)/console/` nesting. The route group `(console)` retains its existing layout wrapper (sidebar, staff auth gating, console-specific styles). This frees root for the marketing homepage.

**Rationale**: The console is an authenticated operational surface — it should not occupy the domain root. Moving it under `/console` follows the convention already established by the portal at `/portal`. The `(console)` route group is preserved as-is; only the path segment changes from `/` to `/console`.

**Consequences**:
- Phase 0 is already complete: all console pages (`queue`, `disputes`, `engine`, `rulebook`, `clients`, `carriers`, `users`, `ingestion`, `policies`, `gateway-tags`, `gateway-readiness`) live under `app/(console)/console/`.
- All sidebar `href`s must change from root paths (e.g., `/queue`) to scoped paths (`/console/queue`).
- All inline hardcoded links in console pages (breadcrumbs, quick links, "← Back" links) must update.
- Staff users who bookmarked `/` will now land on the marketing homepage after login — auth redirect must send them to `/console` instead (see Decision 6).

**Alternatives considered**: Keep console at `/` and put marketing at `/site/*` (marketing feels secondary, `/` is too valuable for an authenticated surface); put marketing on a subdomain (see Decision 1). Rejected.

---

## Decision 3: Marketing Route Group — `app/(marketing)/` with Public Layout

**Decision**: A new `app/(marketing)/` route group owns all public marketing pages at root: `/`, `/about`, `/pricing`, `/blog/*`. It uses its own `layout.tsx` with a public nav, footer, and zero auth requirements. No auth wrapper, no session checks.

**Rationale**: Next.js route groups allow separate layouts for different path segments without affecting the URL structure. The `(marketing)` group has a layout that renders a public-header + footer chrome distinct from both the console sidebar layout and the portal layout. Marketing pages are statically renderable (or ISR-rendered) without touching the auth layer.

**Consequences**:
- `app/(marketing)/layout.tsx` — public nav + footer, `<html>` + `<body>` already provided by root layout.
- `app/(marketing)/page.tsx` — marketing homepage at `/`.
- `app/(marketing)/about/page.tsx` — `/about`.
- `app/(marketing)/pricing/page.tsx` — `/pricing`.
- `app/(marketing)/blog/[slug]/page.tsx` — `/blog/[slug]`.
- Zero impact on portal or console layouts — route groups are isolated.
- No auth redirect interference — middleware `authorized` callback must explicitly allow these paths (see Decision 6).

**Alternatives considered**: Single catch-all layout with conditional chrome (couples marketing and product rendering logic; harder to reason about auth boundaries). Rejected.

---

## Decision 4: MDX Content — Markdown-Based Authoring, CMS-Ready

**Decision**: Marketing pages use MDX via `@next/mdx` for markdown-based content authoring. The route structure (`/about/page.tsx`, `/blog/[slug]/page.tsx`) renders `.mdx` files. CMS-ready: the file-system route pattern means swapping to a headless CMS later requires only changing the data source in `generateStaticParams` and `page.tsx` — not restructuring the route tree.

**Rationale**: MDX gives content authors a familiar markdown surface with the ability to embed React components (CTAs, pricing tables, testimonial carousels) when needed. The `@next/mdx` package is maintained by Vercel and integrates natively with the App Router. When the team is ready for a CMS (Contentful, Sanity, etc.), the route files become thin wrappers that fetch from the CMS API — the URL structure, layout groups, and navigation are unchanged.

**Consequences**:
- `next.config.ts` must add `mdxRs: true` and configure `pageExtensions: ['ts', 'tsx', 'mdx']`.
- Blog authors work in `.mdx` files with frontmatter — no CMS UI yet, but no migration either.
- Static generation via `generateStaticParams()` for blog posts at build time; ISR for new posts without redeploy.
- No database dependency for marketing content — marketing pages stay fast and cacheable.
- If the team never adopts a CMS, no cost — the MDX files remain the canonical source.

**Alternatives considered**: Headless CMS from day one (adds a paid dependency, API latency, and content modeling overhead before there's enough content to justify it); plain JSX/TSX pages (no authoring story — developers write marketing copy, which is not sustainable). Rejected.

---

## Decision 5: Single Vercel Project — One Pipeline, One Deployment

**Decision**: All four surfaces deploy from a single Vercel project with a single build pipeline. No separate Vercel projects for marketing vs. product. The `ignoredBuildStep` hook can skip builds for marketing-only changes (e.g., editing an `.mdx` file doesn't rebuild the audit engine).

**Rationale**: A monorepo-style split (separate Vercel projects for marketing + product) adds build coordination, shared environment variable management, and two deployment pipelines for what is fundamentally one application with four route groups. Next.js already handles route-group-aware code splitting. The build step is the same for all groups. If traffic or team size justifies a split later, the route group isolation means the `app/(marketing)/` directory can be extracted into a separate Next.js app with no code changes — only deployment configuration.

**Consequences**:
- One `vercel.json`, one set of environment variables, one deployment preview URL per PR.
- `ignoredBuildStep` can check `git diff --name-only HEAD^ HEAD` for marketing-only file changes and skip the build payload.
- Route groups already provide code-splitting boundaries — marketing code is not in the portal/console bundle and vice versa.
- If the team grows to a dedicated marketing engineering pod, a split is a deployment reconfiguration, not a code migration.

**Alternatives considered**: Two Vercel projects (one for marketing, one for product — doubles deployment surface, requires cross-project env var sync, creates a fake "microservice" boundary around what is one app); Vercel monorepo with `turbo.json` (overkill for a single Next.js app — monorepo tooling adds complexity without benefit). Rejected.

---

## Decision 6: Three-Tier Middleware — Public, Authenticated, Staff

**Decision**: The `authorized` callback in `auth.config.ts` is refactored from a two-tier model (public auth pages + everything-else-is-staff) to a three-tier model:

| Tier | Paths | Access Rule |
|------|-------|-------------|
| **Public (no auth)** | `/`, `/about`, `/pricing`, `/blog/*`, `/login`, `/signup`, `/api/*` | Always allowed |
| **Authenticated** | `/portal/*` | Any signed-in user (client or staff) |
| **Staff** | `/console/*` | Signed-in user with `role === 'staff'` |

**Rationale**: The current authorized callback treats everything except `/login`, `/signup`, and `/portal` as staff-only. Adding marketing pages at root requires explicitly whitelisting those paths as public. The `/api/*` routes have their own authentication (ingest secret, cron secret, or staff session) and should not be gated by middleware. This three-tier model matches the mental model: public surfaces, client-facing product, staff operations.

**Consequences**:
- `auth.config.ts` `authorized` callback changes:
  - Staff redirect on login: `'/'` → `'/console'` (line 37).
  - Public paths added: `/`, `/about`, `/pricing`, `/blog`, `/api`.
  - Catch-all logic flips: instead of "everything else is staff-only," the default is "everything else redirects to login," and only `/console/*` gates on `role === 'staff'`.
- `/api/*` is explicitly allowed through — each route handles its own auth.
- Non-staff users who navigate to `/console/*` are redirected to `/portal`.
- Unauthenticated users who navigate to `/portal/*` or `/console/*` are redirected to `/login`.

**Alternatives considered**: Keep current catch-all and add individual path whitelists (brittle — every new marketing page requires a middleware update); use Next.js `matcher` config instead of `authorized` callback (less expressive — can't check `role` from the `matcher` pattern). Rejected.

---

## Route Map

```
/                                          → (marketing)/page.tsx                      Marketing homepage
/about                                     → (marketing)/about/page.tsx                About
/pricing                                   → (marketing)/pricing/page.tsx              Pricing
/blog/[slug]                               → (marketing)/blog/[slug]/page.tsx          Blog post
/login                                     → (auth)/login/page.tsx                     Login
/signup                                    → (auth)/signup/page.tsx                    Signup
/portal                                    → (portal)/portal/page.tsx                  Client dashboard
/portal/upload                             → (portal)/portal/upload/page.tsx
/portal/disputes                           → (portal)/portal/disputes/page.tsx
/portal/invoices                           → (portal)/portal/invoices/page.tsx
/portal/reports                            → (portal)/portal/reports/page.tsx
/portal/settings                           → (portal)/portal/settings/page.tsx
/portal/help                               → (portal)/portal/help/page.tsx
/console                                   → (console)/console/page.tsx                Staff dashboard
/console/queue                             → (console)/console/queue/page.tsx
/console/disputes                          → (console)/console/disputes/page.tsx
/console/engine                            → (console)/console/engine/page.tsx
/console/rulebook                          → (console)/console/rulebook/page.tsx
/console/clients                           → (console)/console/clients/page.tsx
/console/carriers                          → (console)/console/carriers/page.tsx
/console/users                             → (console)/console/users/page.tsx
/console/ingestion                         → (console)/console/ingestion/page.tsx
/console/ingestion/3pl                     → (console)/console/ingestion/3pl/page.tsx
/console/ingestion/exceptions              → (console)/console/ingestion/exceptions/page.tsx
/console/policies                          → (console)/console/policies/page.tsx
/console/policies/[policyId]               → (console)/console/policies/[policyId]/page.tsx
/console/policies/[policyId]/rules         → (console)/console/policies/[policyId]/rules/page.tsx
/console/policies/[policyId]/backtests     → (console)/console/policies/[policyId]/backtests/page.tsx
/console/gateway-tags                      → (console)/console/gateway-tags/page.tsx
/console/gateway-readiness                 → (console)/console/gateway-readiness/page.tsx
/console/gateway-readiness/[clientId]      → (console)/console/gateway-readiness/[clientId]/page.tsx
/api/*                                     → API routes (unchanged)
```

---

## Changes Required

| # | File / Area | Change | Phase |
|---|-------------|--------|-------|
| 1 | `app/(console)/console/` | ✅ Already moved — no action needed | 0 (done) |
| 2 | `components/sidebar.tsx` | Update NAV array: all `href` values from root paths (`/queue`) to scoped paths (`/console/queue`). Update "Today" href from `/` to `/console`. | 1 |
| 3 | `auth.config.ts` | `authorized` callback: staff redirect `'/'` → `'/console'` (line 37). Add public path whitelist (`/`, `/about`, `/pricing`, `/blog`, `/api`). Flip catch-all from staff-gate to login-gate — only `/console/*` requires `role === 'staff'`. | 1 |
| 4 | `app/(console)/console/**/*.tsx` | Update all hardcoded inline links: `/queue` → `/console/queue`, `/ingestion` → `/console/ingestion`, `/ingestion/3pl` → `/console/ingestion/3pl`, `/ingestion/exceptions` → `/console/ingestion/exceptions`, `/rulebook` → `/console/rulebook`, `/engine` → `/console/engine`, `/gateway-tags` → `/console/gateway-tags`. | 1 |
| 5 | `app/(marketing)/layout.tsx` | Create public layout: nav bar (logo, About, Pricing, Blog links + Login CTA) + footer. No auth wrapper. | 2 |
| 6 | `app/(marketing)/page.tsx` | Create marketing homepage at `/`. | 2 |
| 7 | `app/(marketing)/about/page.tsx` | Create `/about`. | 2 |
| 8 | `app/(marketing)/pricing/page.tsx` | Create `/pricing`. | 2 |
| 9 | `app/(marketing)/blog/[slug]/page.tsx` | Create blog post route with MDX rendering. | 2 |
| 10 | `next.config.ts` | Add `mdxRs: true`, configure `pageExtensions: ['ts', 'tsx', 'mdx']`. | 2 |
| 11 | TypeScript + tests | Verify all links resolve, no broken routes, middleware covers all path tiers. | 3 |

---

## Implementation Phases

### Phase 0 — Blocking (✅ Complete)
Move all console pages under `app/(console)/console/`. The directory tree already reflects this structure. All 19 console page files are nested correctly.

### Phase 1 — Middleware + Auth + Internal Links
1. Update `components/sidebar.tsx` NAV array: all hrefs to `/console/*` paths.
2. Refactor `auth.config.ts` `authorized` callback to three-tier model:
   - Public paths: `/`, `/about`, `/pricing`, `/blog`, `/login`, `/signup`, `/api`
   - Authenticated: `/portal/*`
   - Staff: `/console/*`
3. Update all inline hardcoded links inside `app/(console)/console/` pages (breadcrumbs, quick links, back links).
4. Staff redirect on login: `'/'` → `'/console'`.

### Phase 2 — Marketing Route Group
1. Create `app/(marketing)/layout.tsx` — public nav + footer, no auth.
2. Create `app/(marketing)/page.tsx` — marketing homepage.
3. Create `app/(marketing)/about/page.tsx`, `app/(marketing)/pricing/page.tsx`.
4. Create `app/(marketing)/blog/[slug]/page.tsx` with MDX rendering.
5. Configure `@next/mdx` in `next.config.ts`.

### Phase 3 — Verification
1. Run `npm run build` to confirm all routes resolve and no broken imports.
2. Run `npm test` for existing test suite.
3. Manual link audit: verify every sidebar link, breadcrumb, and inline reference resolves.
4. Verify middleware behavior: public pages load unauthenticated, portal redirects to login, console rejects non-staff.

---

## Consequences Summary

| Dimension | Impact |
|-----------|--------|
| **Domain** | Single domain — no DNS changes, no cookie scoping, no CORS configuration. |
| **Routing** | Three route groups: `(marketing)` at root, `(auth)` for login/signup, `(portal)` at `/portal`, `(console)` at `/console`. |
| **Auth** | Three-tier middleware: public paths open, `/portal/*` requires login, `/console/*` requires staff role. Auth.js JWT unchanged. |
| **Content** | MDX files in `app/(marketing)/` for marketing pages. CMS-ready — route structure doesn't change when swapping to headless CMS. |
| **Deployment** | Single Vercel project, single pipeline. `ignoredBuildStep` can skip builds for marketing-only changes. Splittable later without code changes. |
| **Console UX** | Sidebar links and inline references all move to `/console/*` paths. Staff login redirects to `/console`. Bookmarks to `/` now land on marketing homepage. |
| **Marketing UX** | Public homepage at `/`, About at `/about`, Pricing at `/pricing`, Blog at `/blog/*`. Public nav with Login CTA. |
| **Risk** | Low — Phase 0 (hardest structural change) is complete. Remaining phases are link updates, auth config refactor, and new file creation. |
