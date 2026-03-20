# Ticket Booking System Backend

Express and Prisma backend for user authentication, event management, seat locking, and ticket booking flows.

## Overview

This repository exposes a small HTTP API for:

- user signup and signin
- creating and listing events
- locking seats with Redis before purchase
- confirming bookings and issuing ticket tokens
- listing a user's booked tickets
- cancelling booked tickets and restoring event capacity

The service uses PostgreSQL through Prisma and stores short-lived seat locks in Redis.

## Tech Stack

- Node.js
- TypeScript
- Express
- Prisma
- PostgreSQL
- Redis
- Zod
- JSON Web Tokens

## Project Structure

```text
.
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── lib/db.ts
│   ├── middleware.ts
│   ├── routes/
│   │   ├── event.ts
│   │   ├── ticket.ts
│   │   └── user.ts
│   └── index.ts
├── dist/
└── package.json
```

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the project root with the variables used by the code:

```env
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/ticket_booking
USER_SECRET=replace-this
JWT_SECRET=replace-this
TICKET_SECRET=replace-this
```

Runtime dependencies inferred from the code:

- PostgreSQL must be available through `DATABASE_URL`.
- Redis is expected on the default local connection because `ioredis` is initialized with `new Redis()`.

## Quick Start

Generate the Prisma client and apply migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

Start the API:

```bash
npm run start
```

The server mounts these route groups:

- `/api/auth/s1/user`
- `/api/events`
- `/api/ticket`

Authenticated routes expect an `Authorization: Bearer <token>` header.

## API Endpoints

### Auth

`POST /api/auth/s1/user/signup`

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

`POST /api/auth/s1/user/signin`

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

### Events

`POST /api/events/addevent`

Requires authentication.

```json
{
  "eventName": "Coldplay Live",
  "eventDetail": "Mumbai stadium show",
  "availableTickets": 500
}
```

`GET /api/events/getallevents`

Returns events with `availableTickets > 0`, ordered by `eventName`.

### Tickets

`POST /api/ticket/lockseat`

Requires authentication.

```json
{
  "eventId": "event-uuid",
  "seatNumber": "A-12"
}
```

Locks the seat in Redis for 5 minutes.

`POST /api/ticket/confirmbooking`

Requires authentication.

```json
{
  "eventId": "event-uuid",
  "seatNumber": "A-12",
  "venue": "VIP"
}
```

Valid `venue` values:

- `VIP`
- `REGULAR`
- `BALCONY`

`GET /api/ticket/mytickets`

Requires authentication. Returns booked tickets for the current user and includes event name and detail.

`POST /api/ticket/cancel`

Requires authentication.

```json
{
  "ticketId": "ticket-uuid"
}
```

Cancelling a ticket marks it as `CANCELLED`, removes the linked seat row, and increments the event's available ticket count.

## Data Model

The Prisma schema defines:

- `User`
- `Event`
- `Ticket`
- `Seat`

Ticket status values:

- `AVAILABLE`
- `BOOKED`
- `RESERVED`
- `CANCELLED`

Seat venue values:

- `VIP`
- `REGULAR`
- `BALCONY`

## Development Notes

- The only package script is `npm run start`, which runs `tsc -b && node dist/index.js`.
- `typescript` is not currently listed in `devDependencies`, so `npm run start` expects `tsc` to already be available in the environment.
- Authentication tokens are signed with `USER_SECRET` in `src/routes/user.ts`, while middleware verification uses `JWT_SECRET` in `src/middleware.ts`. In the current code, authenticated routes work only if those values match.
- No automated test suite is configured. `npm test` currently exits with the default placeholder command.

## License

Licensed under the ISC license.
