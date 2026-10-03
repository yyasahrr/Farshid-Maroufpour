# Backend & Database

This salon booking system is a Next.js 16 app backed by PostgreSQL, accessed
through Drizzle ORM. The schema lives in `src/db/schema.ts`; migrations are
generated from it and applied with `drizzle-kit`.

## Tech stack

- **Runtime**: Node 20+, Next.js 16 (App Router)
- **Database**: PostgreSQL 16 (local dev via Docker Compose)
- **ORM**: Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `pg`)
- **Validation**: Zod
- **Auth**: signed session cookie + scrypt password hashing + OTP (preview mode)

## Local setup

### 1. Start PostgreSQL

```bash
npm run db:up
```

This starts a `postgres:16-alpine` container on `127.0.0.1:5434` with the
database `app_db`, and runs `scripts/seed.sql` on first boot.

To stop / wipe:

```bash
npm run db:down     # stop, keep data
npm run db:reset    # stop and wipe the data volume
```

### 2. Apply migrations

```bash
npm run db:setup
# equivalent to:
npm run db:migrate
npm run db:seed
```

`db:migrate` applies every migration in `drizzle/`. `db:seed` runs
`scripts/seed.sql`, which truncates and re-inserts the demo data (staff,
barbers, services, schedule, sample appointments, classes, products).

### 3. Start the app

```bash
npm install
npm run dev
# http://localhost:5000
```

## Environment

Copy `.env.local` (already present) and adjust as needed:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql://postgres@127.0.0.1:5434/app_db` |
| `SESSION_SECRET` | HMAC key for the session cookie (>= 32 chars) |
| `PAYMENT_WEBHOOK_SECRET` | Shared secret with the payment provider |
| `OTP_DEMO_MODE` | Preview-only fixed OTP (`123456`) |
| `OTP_DEMO_PHONES` | Comma-separated preview phones |
| `PAYMENT_DEMO_MODE` | Preview-only payment adapter |
| `BOOKING_POLICY_VERSION` | Current policy version clients must accept |

## Schema overview

| Table | Purpose |
|---|---|
| `users` | Staff + client accounts (phone, role, password hash) |
| `barbers` | Barber profiles, linked to a `users` row |
| `skills` / `barber_skills` | Skill catalogue and barber↔skill links |
| `services` | Service catalogue (price, duration, buffer, payment mode) |
| `barber_services` | Per-barber service overrides (price/duration) |
| `salon_schedule` / `barber_schedule` | Opening hours |
| `blocked_times` | Manual time blocks (vacation, meetings) |
| `appointments` | Bookings |
| `classes` / `class_registrations` | Academy workshops & masterclasses |
| `payments` | Payment records (deposit / full payment) |
| `portfolio_items` | Barber portfolio / gallery |
| `reviews` | Client reviews |
| `notifications` | In-app notifications for staff |
| `audit_logs` | Staff action trail |
| `app_secrets` | Generated signing keys |
| `otps` | OTP codes (preview mode) |
| `booking_policy_acceptance` | Policy acceptance records |
| `booking_holds` | Temporary slot holds |
| `products` | Shop catalogue |

## Migrations

Migrations are generated from the schema, never hand-written:

```bash
npm run db:generate
```

To rebuild from scratch:

```bash
npm run db:setup:reset
```

## API

REST endpoints under `/api`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | DB connectivity check |
| `GET` | `/api/auth/me` | Current session user |
| `POST` | `/api/auth/otp/send` | Request an OTP |
| `POST` | `/api/auth/otp/verify` | Verify an OTP |
| `POST` | `/api/auth/complete-onboarding` | First-time name step |
| `POST` | `/api/auth/policy/accept` | Record policy acceptance |
| `POST` | `/api/auth/logout` | Clear the session |
| `GET` | `/api/availability` | Slot availability for a barber/service/date |
| `GET` | `/api/available-barbers` | Barbers offering a service |
| `POST` | `/api/booking/hold` | Create a 10-minute slot hold |
| `POST` | `/api/booking/cancel` | Cancel a booking |
| `POST` | `/api/appointments` | Create an appointment |
| `GET` | `/api/appointments` | List appointments (staff) |
| `GET` | `/api/appointments/track` | Track an appointment by phone |
| `POST` | `/api/classes/register` | Register for a class |
| `POST` | `/api/payments/verify` | Verify a payment (signed webhook) |
| `GET` | `/api/customer/bookings` | Customer's bookings |
| `GET` | `/api/shop/products` | Shop catalogue |

## Demo credentials

Staff logins (passwords are the SHA-256 legacy digests seeded in
`scripts/seed.sql`; the login action upgrades them to scrypt on first sign-in):

| Phone | Password | Role |
|---|---|---|
| `09120000001` | `admin123` | SUPER_ADMIN |
| `09120000002` | `barber123` | BARBER |
| `09120000003` | `barber123` | BARBER |
| `09120000004` | `barber123` | BARBER |
| `09120000005` | `reception123` | RECEPTIONIST |