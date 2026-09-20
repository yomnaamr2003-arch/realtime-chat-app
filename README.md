# Wire — Real-Time Chat & Notification Web App

An intermediate full-stack project: registered users exchange messages in
direct conversations, see message history, get notified of new activity,
and see who's online — all in real time over WebSockets.

Built to learn: client-server communication, authentication, relational
data modeling, and real-time (Socket.IO) application development.

## Features

- Email/password registration & login (bcrypt-hashed passwords, JWT auth)
- Direct conversations with message history (paginated)
- Real-time message delivery over Socket.IO, with a REST fallback
- Online/offline presence indicators, tracked across multiple tabs
- Typing indicators
- Persistent in-app notifications for new messages, with unread state
- SQLite storage (file-based, zero external services required)

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 18+ |
| Server | Express |
| Real-time | Socket.IO |
| Database | SQLite via `better-sqlite3` |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Frontend | Vanilla HTML/CSS/JS (no build step) |

## Project structure

```
chat-app/
├── server.js                  # Express + Socket.IO entry point
├── src/
│   ├── db.js                  # SQLite connection + schema
│   ├── auth.js                # password hashing, JWT sign/verify
│   ├── seed.js                # demo data (alice/bob) for local testing
│   ├── middleware/auth.js     # requireAuth Express middleware
│   ├── models/                # User, Conversation, Message data access
│   ├── routes/                # auth, users, conversations, messages, notifications
│   ├── services/messageService.js  # shared send-message logic (REST + sockets)
│   └── sockets/index.js       # Socket.IO auth handshake + event handlers
├── public/                    # static frontend (index.html, css/, js/)
├── Dockerfile / docker-compose.yml
├── render.yaml                 # free-tier deployment config (Render.com)
├── .github/workflows/ci.yml    # install → boot → health-check on every push
├── ROLLBACK.md                 # rollback strategy + evidence log
└── scripts/rollback.sh         # tag-based rollback helper
```

## Getting started

```bash
npm install
cp .env.example .env
# edit .env and set a real JWT_SECRET

npm run seed   # optional: creates alice@example.com / bob@example.com (password123)
npm start      # http://localhost:3000
```

For local development with auto-restart: `npm run dev` (requires `nodemon`,
already listed in devDependencies).

## How it works

### Authentication

- `POST /api/auth/register` and `POST /api/auth/login` return a JWT, set
  both as an `httpOnly` cookie and in the JSON body (so the same token can
  be used for REST calls and the Socket.IO handshake).
- `requireAuth` middleware (`src/middleware/auth.js`) reads the token from
  the `Authorization: Bearer` header or the cookie.
- The Socket.IO server uses an `io.use()` auth middleware
  (`src/sockets/index.js`) that verifies the same JWT before allowing a
  connection — unauthenticated sockets are rejected at handshake time.

### Data model

- `users` — account + presence (`is_online`, `last_seen`).
- `conversations` / `conversation_participants` — supports both direct
  (2-person) and group conversations; `createDirect` reuses an existing
  thread between two users instead of creating duplicates.
- `messages` — belongs to a conversation and a sender.
- `notifications` — one row per recipient per message, so read/unread state
  is per-user.

### Real-time layer

- Each authenticated socket joins a `user:<id>` room (for direct
  notifications) and a `conversation:<id>` room per conversation it
  belongs to.
- `message:send` validates the sender is a participant, persists the
  message, then broadcasts `message:new` to the conversation room and
  `notification:new` to every other participant's user room.
- Presence: an in-memory connection counter per user means a user is only
  marked offline once their *last* open tab/socket disconnects, so
  multi-tab usage doesn't flicker the online indicator.
- `typing:start` / `typing:stop` are relayed to the other participants in
  a conversation room (not persisted).

### Validation & security basics

- Server-side validation on register (email format, username charset,
  password length) via `validator`.
- Message bodies are trimmed, length-capped, and HTML-escaped before
  storage/broadcast (`src/services/messageService.js`) to prevent stored
  XSS in the chat.
- Passwords are hashed with bcrypt (cost factor 12), never stored or
  returned in plain text (`User.toPublic` strips `password_hash`).
- `helmet` sets standard security headers.

## API reference (REST)

All routes except `/api/auth/register` and `/api/auth/login` require auth.

| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Clear the session cookie |
| GET  | `/api/auth/me` | Current user |
| GET  | `/api/users/search?q=` | Find users by username/email |
| GET  | `/api/conversations` | List my conversations |
| POST | `/api/conversations/direct` | Start/reuse a direct conversation |
| POST | `/api/conversations/group` | Create a group conversation |
| GET  | `/api/conversations/:id/messages?before=&limit=` | Paginated history |
| POST | `/api/conversations/:id/read` | Mark a conversation read up to a message |
| POST | `/api/messages` | Send a message (REST fallback for `message:send`) |
| GET  | `/api/notifications` | List my notifications |
| POST | `/api/notifications/:id/read` | Mark one notification read |
| POST | `/api/notifications/read-all` | Mark all read |
| GET  | `/api/health` | Liveness/health check (used by deploy + rollback) |

## Socket.IO events

| Direction | Event | Payload |
|---|---|---|
| client→server | `conversation:join` | `conversationId` |
| client→server | `message:send` | `{ conversationId, body }`, ack `{ ok, message }` |
| client→server | `typing:start` / `typing:stop` | `conversationId` |
| server→client | `message:new` | full message object |
| server→client | `notification:new` | `{ conversationId, message }` |
| server→client | `presence:update` | `{ userId, isOnline, lastSeen }` |
| server→client | `typing:start` / `typing:stop` | `{ conversationId, userId, username }` |

## Deployment

This repo is set up for a free-tier deploy on Render.com via `render.yaml`
(Blueprint), or self-hosting via Docker (`Dockerfile` / `docker-compose.yml`).
See `render.yaml` for the exact service config, and `ROLLBACK.md` for the
rollback procedure and evidence log.

**To deploy on Render (free):**
1. Push this repo to a public GitHub repository.
2. In Render, choose "New +" → "Blueprint" and point it at the repo —
   `render.yaml` is picked up automatically.
3. Render generates `JWT_SECRET` for you and provisions a 1GB persistent
   disk for the SQLite file.
4. After the first deploy, tag the commit (`git tag v1.0.0 && git push
   --tags`) so `scripts/rollback.sh` has something to roll back to.

## Testing it locally with two users

1. `npm run seed`
2. Open two browser windows (or one regular + one incognito).
3. Log in as `alice@example.com` / `password123` in one, `bob@example.com`
   / `password123` in the other.
4. Search for the other user, start a conversation, and send messages —
   you should see them arrive instantly, with typing indicators and the
   online dot updating live.

## Notes / possible next steps

- Group conversation UI (the API supports it; the frontend currently only
  starts direct conversations from search).
- Read receipts beyond conversation-level `last_read_message_id`.
- Message editing/deletion (schema already has an `edited_at` column).
- Swap SQLite for Postgres if deploying somewhere without persistent disks.
