# OnCall Relay Server

WebSocket server for Twilio ConversationRelay — handles real-time voice triage for after-hours medical calls.

## Deployment (Railway)

### First-time setup

1. **Create a Railway project** at [railway.app](https://railway.app)
2. **Connect your GitHub repo** and set the **root directory** to `oncall-relay`
3. **Add environment variables** in the Railway dashboard:

   | Variable | Description |
   |---|---|
   | `PORT` | Set to `8080` (Railway also auto-sets this) |
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key (NOT the anon key) |
   | `SMS_ALERTS_ENABLED` | `false` to disable health-check SMS alerts |

4. Railway will auto-detect the Dockerfile and deploy.

### How deploys work

- Every push to `main` that changes files in `oncall-relay/` triggers a new deploy automatically (if you enable auto-deploy in Railway).
- Railway builds from `oncall-relay/Dockerfile` and runs `node dist/server.js`.
- The health check endpoint is `GET /health`.

### Manual deploy

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project (run from oncall-relay/ directory)
cd oncall-relay
railway link

# Deploy
railway up
```

### Verify deployment

```bash
curl https://YOUR-APP.up.railway.app/health
# Should return: {"status":"ok","connections":0,"uptime":...}
```

## Local development

```bash
cd oncall-relay
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

## Architecture

- **server.ts** — HTTP + WebSocket server. Health check on `/health`, WebSocket on `/intake`.
- **triage-machine.ts** — Deterministic state machine for call triage (language gate → established patient → symptoms → disposition).
- **supabase-client.ts** — Looks up on-call info and saves completed intakes via the Supabase edge function.
- **types.ts** — Shared TypeScript types for triage state, Twilio messages, and server responses.
