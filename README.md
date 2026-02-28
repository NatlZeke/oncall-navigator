# OnCall Navigator

After-hours medical call triage system with AI-powered voice intake and provider escalation.

## Project Structure

```
├── src/                  # React frontend (Vite + Tailwind + shadcn)
├── supabase/functions/   # Edge functions (auth, webhooks, notifications)
├── oncall-relay/         # WebSocket relay server (deployed to Railway)
│   ├── Dockerfile
│   ├── railway.toml
│   └── src/
└── package.json
```

## Frontend

```bash
npm install
npm run dev
```

## Relay Server

The real-time voice triage server lives in `oncall-relay/` and is deployed separately to **Railway**. See [oncall-relay/README.md](oncall-relay/README.md) for deployment instructions.

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Lovable Cloud (database, auth, edge functions)
- **Voice Relay**: Node.js WebSocket server on Railway
- **Telephony**: Twilio ConversationRelay
