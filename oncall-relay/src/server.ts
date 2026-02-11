/**
 * server.ts — HTTP + WebSocket server for Twilio ConversationRelay.
 *
 * Runs on Fly.io and handles real-time voice conversations via WebSocket.
 * Each WebSocket connection represents one phone call.
 *
 * This server does NOT write to Supabase during the call — only at the end
 * via the conversation-relay-complete edge function.
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { processInput } from './triage-machine.js';
import { getOnCallInfo, saveCompletedIntake } from './supabase-client.js';
import type {
  TriageState,
  TwilioInboundMessage,
  ServerTextResponse,
  ServerEndResponse,
} from './types.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

// Track active connections for health check reporting
const activeConnections = new Map<string, { ws: WebSocket; state: TriageState }>();

// ============================================================================
// HTTP SERVER — health check endpoint
// ============================================================================
const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      connections: activeConnections.size,
      uptime: process.uptime(),
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ============================================================================
// WEBSOCKET SERVER — /intake path
// ============================================================================
const wss = new WebSocketServer({ server, path: '/intake' });

wss.on('connection', (ws: WebSocket) => {
  let callSid: string | null = null;
  let state: TriageState | null = null;
  let saved = false;

  console.log('New WebSocket connection');

  ws.on('message', async (data: Buffer) => {
    try {
      const message: TwilioInboundMessage = JSON.parse(data.toString());

      switch (message.type) {
        // ====================================================================
        // SETUP — first message from Twilio with call metadata
        // ====================================================================
        case 'setup': {
          callSid = message.callSid;
          const callerPhone = message.from;
          const calledPhone = message.to;

          console.log(`[${callSid}] Setup: ${callerPhone} → ${calledPhone}`);

          // Look up office config and on-call provider
          const info = await getOnCallInfo(calledPhone);

          if (!info) {
            console.error(`[${callSid}] Failed to get on-call info for ${calledPhone}`);
            sendText(ws, "I'm sorry, we're having technical difficulties. If this is an emergency, hang up and dial 911. Lo sentimos, estamos teniendo dificultades técnicas. Si esto es una emergencia, cuelgue y marque el 9 1 1.", true);
            setTimeout(() => sendEnd(ws), 4000);
            return;
          }

          // Initialize triage state
          // IMPORTANT: After setup, Twilio plays the welcomeGreeting from the TwiML config,
          // then waits for the caller to speak. The server does NOT send any text here.
          state = {
            stage: info.spanishEnabled ? 'language_gate' : 'established_gate',
            lang: 'en',
            spanishEnabled: info.spanishEnabled,
            intake: { symptoms: [] },
            officeName: info.officeName,
            officeId: info.officeId,
            callerPhone,
            calledPhone,
            callSid: message.callSid,
            transcript: [],
            retryCounts: {},
            onCallProvider: info.onCallProvider,
            providerDirectory: info.providerDirectory,
            requiresPatientDoctorConfirmation: info.requiresPatientDoctorConfirmation,
          };

          activeConnections.set(callSid, { ws, state });
          console.log(`[${callSid}] State initialized: stage=${state.stage}, spanish=${info.spanishEnabled}`);
          break;
        }

        // ====================================================================
        // PROMPT — caller's speech transcription
        // ====================================================================
        case 'prompt': {
          if (!state || !callSid) {
            console.error('Received prompt before setup');
            return;
          }

          console.log(`[${callSid}] Prompt: "${message.voicePrompt}" (stage=${state.stage})`);

          const result = processInput(state, message.voicePrompt, null);
          state.stage = result.nextStage;

          console.log(`[${callSid}] → Response: stage=${result.nextStage}, endCall=${result.endCall}`);
          sendText(ws, result.responseText, true);

          if (result.endCall) {
            // Wait for TTS to complete before ending
            setTimeout(async () => {
              sendEnd(ws);
              if (!saved) {
                saved = true;
                await saveCompletedIntake(state!);
              }
            }, 4000);
          }
          break;
        }

        // ====================================================================
        // DTMF — caller pressed a button
        // ====================================================================
        case 'dtmf': {
          if (!state || !callSid) {
            console.error('Received DTMF before setup');
            return;
          }

          console.log(`[${callSid}] DTMF: ${message.digit} (stage=${state.stage})`);

          // DTMF 0 = voicemail escape (same as voice webhook)
          if (message.digit === '0' && state.stage !== 'language_gate' && state.stage !== 'complete') {
            state.transcript.push({ role: 'system', content: 'Caller pressed 0 — voicemail escape', ts: new Date().toISOString() });
            state.intake.disposition = state.intake.disposition || 'NEXT_BUSINESS_DAY';
            state.intake.dispositionReason = state.intake.dispositionReason || 'Caller pressed 0 for voicemail';

            sendText(ws,
              state.lang === 'es'
                ? "Desafortunadamente no puedo grabar un mensaje de voz en este modo. Por favor llame de nuevo y oprima 0 al inicio de la llamada para dejar un mensaje de voz. Si esto es una emergencia, cuelgue y marque el 9 1 1. Adiós."
                : "Unfortunately I can't record a voicemail in this mode. Please call back and press 0 at the start of the call to leave a voicemail. If this is an emergency, please hang up and dial 911. Goodbye.",
              true
            );
            setTimeout(async () => {
              sendEnd(ws);
              if (!saved) {
                saved = true;
                await saveCompletedIntake(state!);
              }
            }, 4000);
            return;
          }

          const result = processInput(state, null, message.digit);
          state.stage = result.nextStage;

          sendText(ws, result.responseText, true);

          if (result.endCall) {
            setTimeout(async () => {
              sendEnd(ws);
              if (!saved) {
                saved = true;
                await saveCompletedIntake(state!);
              }
            }, 4000);
          }
          break;
        }

        // ====================================================================
        // INTERRUPT — caller interrupted TTS (logged only)
        // ====================================================================
        case 'interrupt': {
          if (callSid) {
            console.log(`[${callSid}] Interrupt after ${message.durationUntilInterruptMs}ms: "${message.utteranceUntilInterrupt}"`);
          }
          // ConversationRelay handles interruption natively.
          // The next 'prompt' message will contain the caller's full utterance.
          break;
        }

        // ====================================================================
        // END — Twilio signals call ended
        // ====================================================================
        case 'end': {
          console.log(`[${callSid || 'unknown'}] Call ended by Twilio`);

          if (state && !saved) {
            saved = true;
            // Save whatever data was collected (caller may have hung up mid-triage)
            if (!state.intake.disposition) {
              state.intake.disposition = 'NEXT_BUSINESS_DAY';
              state.intake.dispositionReason = 'Caller hung up before triage completed';
            }
            await saveCompletedIntake(state);
          }
          break;
        }
      }
    } catch (err) {
      console.error(`[${callSid || 'unknown'}] Error processing message:`, err);

      // Send bilingual error message to caller
      try {
        const errorMsg = (state?.lang === 'es')
          ? "Lo sentimos, estamos teniendo dificultades técnicas. Si esto es una emergencia, cuelgue y marque el 9 1 1. We're sorry, we're having technical difficulties. If this is an emergency, hang up and dial 911."
          : "I'm sorry, we're having technical difficulties. If this is an emergency, hang up and dial 911.";
        sendText(ws, errorMsg, true);
        setTimeout(() => sendEnd(ws), 4000);
      } catch {
        // WebSocket may already be closed
      }

      // Save whatever we have
      if (state && !saved) {
        saved = true;
        if (!state.intake.disposition) {
          state.intake.disposition = 'NEXT_BUSINESS_DAY';
          state.intake.dispositionReason = 'Technical error during triage';
        }
        await saveCompletedIntake(state);
      }
    }
  });

  ws.on('close', () => {
    console.log(`[${callSid || 'unknown'}] WebSocket closed`);
    if (callSid) {
      activeConnections.delete(callSid);
    }
  });

  ws.on('error', (err) => {
    console.error(`[${callSid || 'unknown'}] WebSocket error:`, err);
  });
});

// ============================================================================
// MESSAGE SENDERS
// ============================================================================

function sendText(ws: WebSocket, text: string, last: boolean): void {
  if (ws.readyState !== WebSocket.OPEN) return;

  const msg: ServerTextResponse = {
    type: 'text',
    token: text,
    last,
  };
  ws.send(JSON.stringify(msg));
}

function sendEnd(ws: WebSocket): void {
  if (ws.readyState !== WebSocket.OPEN) return;

  const msg: ServerEndResponse = { type: 'end' };
  ws.send(JSON.stringify(msg));
}

// ============================================================================
// START SERVER
// ============================================================================
server.listen(PORT, () => {
  console.log(`OnCall Relay server listening on port ${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`  WebSocket:    ws://localhost:${PORT}/intake`);
});

// ============================================================================
// GRACEFUL SHUTDOWN — drain connections on SIGTERM (Fly.io deploy/scale)
// ============================================================================
const shutdown = () => {
  console.log('SIGTERM received — draining connections');

  // Save all active intakes BEFORE closing WebSockets
  const savePromises: Promise<void>[] = [];
  for (const [sid, conn] of activeConnections) {
    if (conn.state) {
      if (!conn.state.intake.disposition) {
        conn.state.intake.disposition = 'NEXT_BUSINESS_DAY';
        conn.state.intake.dispositionReason = 'Server shutdown during triage';
      }
      savePromises.push(
        saveCompletedIntake(conn.state).then(() => {
          console.log(`[${sid}] Intake saved during shutdown`);
        }).catch((err) => {
          console.error(`[${sid}] Failed to save intake during shutdown:`, err);
        })
      );
    }
    conn.ws.close();
  }

  // Wait for all saves, then shut down HTTP server
  Promise.allSettled(savePromises).then((results) => {
    const saved = results.filter(r => r.status === 'fulfilled').length;
    console.log(`Shutdown: saved ${saved}/${results.length} active intakes`);

    wss.close(() => {
      console.log('All WebSocket connections closed');
      server.close(() => {
        console.log('HTTP server closed — exiting');
        process.exit(0);
      });
    });
  });

  // Force exit after 10 seconds if draining stalls
  setTimeout(() => {
    console.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
