# Dar Al Falak Cleaning Services

Web app with four areas: public website, Client, Admin and Super Admin dashboards.
Built with Next.js, PostgreSQL, Drizzle and Better Auth. English and Arabic, light and dark.

## Run it locally

Use two terminals.

```
npm run db:start     # terminal 1: private local database on port 5544, keep it running
npm run dev          # terminal 2: app at http://localhost:3000
```

Sign-in codes are printed in the `npm run dev` terminal until the email provider is connected.

## Create staff accounts

There is no public staff sign-up. The temporary password prints once.

```
npm run admin:create -- owner@yourcompany.com               # Super Admin
npm run admin:create -- dispatch@yourcompany.com --role=admin
```

Sign in at `/en/staff/login`. The first sign-in requires setting up an authenticator app.

## Admin dashboard

At `/en/admin` (Admins and the Super Admin). The team can:

- review, confirm, start, complete and cancel bookings (a cancel needs a reason, which the customer sees)
- send quotes for quote-only services; a quote job is confirmed only after the customer accepts
- assign cleaners; a cleaner cannot be on two overlapping jobs
- change a booking's time when the customer calls, record payments, and keep internal notes
- see the day's schedule and how many of the cleaner capacity are busy each half hour
- manage cleaners, view customers, complete deletion requests and handle website enquiries

Every change is checked on the server, runs under row-level security, and writes to the audit log.
Customer messages are queued for the notifications phase. The logic is in `src/lib/admin`.

## Checks

```
npm run typecheck
npm run lint
npm test             # needs the database and a dev server logging to .local/dev.log:
                     # npx next dev > .local/dev.log 2>&1
```

## Database changes

```
npm run db:generate  # after editing src/db/schema.ts
npm run db:migrate
npm run db:seed      # placeholder prices and settings
```

## Before going live

- Set `BETTER_AUTH_SECRET`, `DATABASE_URL` and `BETTER_AUTH_URL` on the host. The app uses the
  limited `daf_app` database account; migrations use the owner account (`DATABASE_OWNER_URL`).
- Make the site reachable only through Cloudflare. `CLIENT_IP_HEADER` trusts `cf-connecting-ip`,
  so direct access to the server would let visitors fake their IP and dodge rate limits.
- Connect an email provider in `src/lib/email.ts`. Sign-in codes fail in production until then.
- Replace the placeholder prices in `scripts/seed.ts` and set the real slot capacity.
- Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `TURNSTILE_SECRET_KEY`.
