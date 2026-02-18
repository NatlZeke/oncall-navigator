/**
 * triage-machine.ts — Pure state machine for voice triage.
 *
 * This file ports the clinical decision logic from twilio-voice-webhook/index.ts
 * (the <Gather> flow) into a function-based state machine for ConversationRelay.
 *
 * CRITICAL: All clinical decisions must produce IDENTICAL outcomes to the <Gather> flow.
 * A doctor receiving an SMS should NOT be able to tell which transport was used.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │                    CLINICAL TRIAGE FLOW DIAGRAM                     │
 * ├──────────────────────────────────────────────────────────────────────┤
 * │                                                                      │
 * │  [Spanish enabled?]──Y──► language_gate ──► established_gate         │
 * │          │                                       │                   │
 * │          N────────────────────────────────► established_gate         │
 * │                                                  │                   │
 * │                          ┌──── N ── "Not established" ── END        │
 * │                          │                                           │
 * │                    [Established?]                                    │
 * │                          │                                           │
 * │                          Y                                           │
 * │                          │                                           │
 * │                   [Rx shortcut?]──Y──► prescription_doctor           │
 * │                          │               ► prescription_name         │
 * │                          N               ► prescription_callback     │
 * │                          │               ► prescription_medication   │
 * │                          ▼               ► prescription_safety       │
 * │                    collect_name                   │                   │
 * │                    ask_dob          [Emergent?]──Y──► Rx emergency   │
 * │                    ask_callback           │          DOB ► red flags │
 * │                    ask_patient_doctor     N──► NEXT_BUSINESS_DAY     │
 * │                          │                                           │
 * │                          ▼                                           │
 * │                   [Post-op <14d?]                                    │
 * │                     │          │                                     │
 * │                     Y          N                                     │
 * │                     │          │                                     │
 * │                     ▼          ▼                                     │
 * │              postop_complaint  redflag_1: Vision loss?               │
 * │                     │          redflag_2: Flashes + curtain?         │
 * │              [Red flag         redflag_3: Severe pain?              │
 * │               keywords?]       redflag_4: Trauma / chemical?        │
 * │               │       │              │           │                   │
 * │               Y       N         Any YES     All NO                  │
 * │               │       │              │           │                   │
 * │               ▼       ▼              ▼           ▼                   │
 * │            ER_NOW  URGENT_CB      ER_NOW   brief_complaint           │
 * │                                            ask_onset                 │
 * │                                            stability_check           │
 * │                                              │          │            │
 * │                                           Worse      Same            │
 * │                                              │          │            │
 * │                                              ▼          ▼            │
 * │                                     confirm_details                  │
 * │                                        │       │                     │
 * │                                      Yes      No                    │
 * │                                        │       ▼                     │
 * │                                        │  correct_details            │
 * │                                        ▼       │                     │
 * │                                        URGENT_CB   NEXT_BIZ_DAY     │
 * │                                                                      │
 * │  DISPOSITIONS:                                                       │
 * │    ER_NOW ─────────► "Go to ER" + notify on-call doctor             │
 * │    URGENT_CALLBACK ► "Doctor will call back" + SMS to provider      │
 * │    NEXT_BUSINESS_DAY ► "Call office when open"                      │
 * │                                                                      │
 * │  FAIL-SAFES: All retry exhaustions escalate (URGENT_CALLBACK),      │
 * │              never deflect. 911 disclaimer on every exit path.       │
 * │                                                                      │
 * │  ROUTING: When patient names a doctor, escalation goes to that      │
 * │           doctor regardless of who is on-call. Otherwise, default   │
 * │           on-call provider receives the notification.                │
 * │                                                                      │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import type { TriageState, TriageResult, Disposition, Lang } from './types.js';

// ============================================================================
// TTS HELPERS — ElevenLabs pronunciation normalization
// ============================================================================

/**
 * Formats a phone number for natural ElevenLabs TTS pronunciation.
 * "+15125551234" → "five one two, five five five, one two three four"
 * Falls back to digit-by-digit if format is unexpected.
 */
function formatPhoneForTTS(phone: string): string {
  const digitWords: Record<string, string> = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
  };

  const digits = phone.replace(/\D/g, '');
  // Strip leading country code "1" for US numbers
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  if (local.length === 10) {
    const area = local.slice(0, 3).split('').map(d => digitWords[d]).join(' ');
    const prefix = local.slice(3, 6).split('').map(d => digitWords[d]).join(' ');
    const line = local.slice(6).split('').map(d => digitWords[d]).join(' ');
    return `${area}, ${prefix}, ${line}`;
  }

  // Non-standard length — just read digit by digit
  return local.split('').map(d => digitWords[d] || d).join(' ');
}

// ============================================================================
// DETECTION HELPERS — ported from twilio-voice-webhook/index.ts
// ============================================================================

const PRESCRIPTION_KEYWORDS = [
  'refill', 'prescription', 'medication', 'drops', 'eye drops',
  'medicine', 'rx', 'renew', 'renewal', 'out of', 'ran out',
  'need more', 'running low',
  'receta', 'medicamento', 'gotas', 'medicina', 'resurtir', 'necesito más', 'se me acabó'
];

function isAffirmative(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  if (/\b(no|not|don't|didn't|haven't|never|nope|nah|nunca)\b/i.test(cleaned)) return false;
  return /\b(yes|yeah|yep|yup|correct|right|affirmative|uh-huh|mm-hmm|true|sí|si|correcto|claro|exacto|así es)\b/i.test(cleaned);
}

function containsAffirmative(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  if (/\b(no|not|don't|didn't|haven't|never|nunca)\b/i.test(cleaned)) return false;
  return /\b(yes|yeah|yep|yup|correct|right|i do|i am|i have|i had|uh-huh|mm-hmm|sí|si|correcto|claro|tengo|estoy)\b/i.test(cleaned);
}

function isWorseningLanguage(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  return /\b(worse|worsening|getting bad|getting worse|just started|new today|suddenly|just happened|just now|escalating|increasing|more severe|rapidly|acute|peor|empeorando|empeoró|de repente|acaba de empezar|más severo)\b/i.test(cleaned);
}

function isPrescriptionRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return PRESCRIPTION_KEYWORDS.some(k => lower.includes(k));
}

function isVoicemailRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(voicemail|leave a message|mensaje de voz|dejar un mensaje)\b/i.test(lower);
}

const MAX_RETRIES = 3;

// ============================================================================
// BILINGUAL PROMPT TEXT
// Ported from TwiML generators in twilio-voice-webhook/index.ts
// ============================================================================

function t(lang: Lang, en: string, es: string): string {
  return lang === 'es' ? es : en;
}

// ============================================================================
// MAIN STATE MACHINE
// ============================================================================

/**
 * Pure function: given the current triage state and the caller's input,
 * returns what to say next and what stage to transition to.
 *
 * Mutates state.intake, state.transcript, and state.retryCounts in place.
 */
export function processInput(
  state: TriageState,
  userText: string | null,
  digit: string | null
): TriageResult {
  const input = userText || '';
  const ts = new Date().toISOString();

  // Record transcript
  if (userText) {
    state.transcript.push({ role: 'caller', content: userText, ts });
  } else if (digit) {
    state.transcript.push({ role: 'caller', content: `pressed ${digit}`, ts });
  }

  // Voicemail escape at any stage
  if (userText && isVoicemailRequest(userText) && state.stage !== 'language_gate' && state.stage !== 'complete') {
    state.transcript.push({ role: 'system', content: 'Caller requested voicemail — ending call', ts });
    state.intake.disposition = state.intake.disposition || 'NEXT_BUSINESS_DAY';
    state.intake.dispositionReason = state.intake.dispositionReason || 'Caller requested voicemail';
    return {
      responseText: t(state.lang,
        "I understand you'd like to leave a message. Unfortunately, I can't record a voicemail in this mode. If you call back and press zero right away, you'll be able to leave one. And if this is an emergency, please hang up and dial nine one one. Take care.",
        "Entiendo que desea dejar un mensaje. Desafortunadamente, no puedo grabar un mensaje de voz en este modo. Si llama de nuevo y presiona cero al inicio, podrá dejar uno. Si esto es una emergencia, cuelgue y marque el nueve uno uno. Cuídese."
      ),
      nextStage: 'complete',
      endCall: true,
    };
  }

  switch (state.stage) {
    // ========================================================================
    // LANGUAGE GATE (only reached when spanishEnabled=true)
    // ========================================================================
    case 'language_gate': {
      if (digit === '2' || (input && /\b(español|spanish|dos|two)\b/i.test(input.toLowerCase()))) {
        state.lang = 'es';
      } else {
        state.lang = 'en';
      }
      state.transcript.push({ role: 'system', content: `Language selected: ${state.lang}`, ts });
      return {
        responseText: t(state.lang,
          `Are you an established patient with ${state.officeName}?`,
          `¿Es usted paciente establecido de ${state.officeName}?`
        ),
        nextStage: 'established_gate',
        endCall: false,
      };
    }

    // ========================================================================
    // ESTABLISHED PATIENT GATE
    // ========================================================================
    case 'established_gate': {
      if (!input && !digit) {
        return handleRetry(state, 'established_gate',
          t(state.lang,
            `Sorry, I didn't catch that. Are you an established patient with ${state.officeName}? Just say yes or no.`,
            `Disculpe, no le escuché. ¿Es usted paciente establecido de ${state.officeName}? Solo diga sí o no.`
          ),
          // Retry exhausted fallback: non-patient deflection
          () => ({
            responseText: t(state.lang,
              "I'm having trouble hearing you. Our after-hours service is for established patients only. If this is an emergency, please head to the nearest E R or call nine one one. Otherwise, give us a call when the office opens. Take care.",
              "Tengo dificultad para escucharle. Nuestro servicio fuera de horario es solo para pacientes establecidos. Si es una emergencia, vaya a la sala de emergencias más cercana o llame al nueve uno uno. De lo contrario, llámenos cuando abra la oficina. Cuídese."
            ),
            nextStage: 'complete' as const,
            endCall: true,
          })
        );
      }

      const isEstablished = isAffirmative(input) || digit === '1';
      state.intake.isEstablishedPatient = isEstablished;

      if (!isEstablished) {
        return {
          responseText: t(state.lang,
            "Thanks for calling. Our after-hours line is for established patients only. If this is an emergency, please head to the nearest E R or call nine one one. Otherwise, give us a call during office hours to schedule an appointment. Take care.",
            "Gracias por llamar. Nuestra línea fuera de horario es solo para pacientes establecidos. Si es una emergencia, vaya a la sala de emergencias más cercana o llame al nueve uno uno. De lo contrario, llámenos durante el horario de oficina para hacer una cita. Cuídese."
          ),
          nextStage: 'complete',
          endCall: true,
        };
      }

      // Check for prescription shortcut in the response
      if (input && isPrescriptionRequest(input)) {
        state.intake.isPrescriptionRequest = true;

        // Ask which doctor before proceeding to prescription details
        if (Object.keys(state.providerDirectory).length > 0) {
          const uniqueNames = [...new Set(Object.values(state.providerDirectory).map(p => p.name))];
          const nameList = uniqueNames.length <= 4
            ? uniqueNames.join(', ')
            : uniqueNames.slice(0, 4).join(', ');
          return {
            responseText: t(state.lang,
              `Sure, I can help with that prescription request. First, who's your doctor at ${state.officeName}? For example, ${nameList}. If you're not sure, just say I don't know.`,
              `Claro, puedo ayudarle con esa solicitud de receta. Primero, ¿quién es su doctor en ${state.officeName}? Por ejemplo, ${nameList}. Si no está seguro, solo diga no sé.`
            ),
            nextStage: 'prescription_doctor',
            endCall: false,
          };
        }

        return {
          responseText: t(state.lang,
            "Sure, I can help with that prescription request. Let me grab a few details. What's your full name?",
            "Claro, puedo ayudarle con esa solicitud de receta. Déjeme tomar algunos datos. ¿Cuál es su nombre completo?"
          ),
          nextStage: 'prescription_name',
          endCall: false,
        };
      }

      return {
        responseText: t(state.lang,
          "Great, let me grab a few quick details. What's your full name?",
          "Muy bien, déjeme tomar algunos datos rápidos. ¿Cuál es su nombre completo?"
        ),
        nextStage: 'collect_name',
        endCall: false,
      };
    }

    // ========================================================================
    // COLLECT NAME
    // ========================================================================
    case 'collect_name': {
      if (!input && !digit) {
        return handleRetry(state, 'collect_name',
          t(state.lang, "Sorry, I didn't catch that. Can you tell me your full name?", "Disculpe, no le escuché. ¿Me puede decir su nombre completo?"),
          () => {
            state.intake.patientName = 'Not provided';
            return {
              responseText: t(state.lang, "Got it. And what's your date of birth?", "Entendido. ¿Y cuál es su fecha de nacimiento?"),
              nextStage: 'ask_dob' as const,
              endCall: false,
            };
          }
        );
      }
      state.intake.patientName = input || 'Not provided';
      return {
        responseText: t(state.lang, "Got it. And what's your date of birth?", "Entendido. ¿Y cuál es su fecha de nacimiento?"),
        nextStage: 'ask_dob',
        endCall: false,
      };
    }

    // ========================================================================
    // ASK DOB
    // ========================================================================
    case 'ask_dob': {
      if (!input && !digit) {
        return handleRetry(state, 'ask_dob',
          t(state.lang, "Can you tell me your date of birth?", "¿Me puede decir su fecha de nacimiento?"),
          () => {
            state.intake.dateOfBirth = 'Not provided';
            return askCallback(state);
          }
        );
      }
      state.intake.dateOfBirth = input || digit || 'Not provided';
      return askCallback(state);
    }

    // ========================================================================
    // ASK CALLBACK
    // ========================================================================
    case 'ask_callback': {
      if (!input && !digit) {
        return handleRetry(state, 'ask_callback',
          t(state.lang,
            `Can we reach you at the number you're calling from, or is there a better number?`,
            `¿Podemos llamarle al número desde el que está llamando, o hay un mejor número?`
          ),
          () => {
            state.intake.callbackNumber = state.callerPhone;
            state.intake.callbackConfirmed = true;
            return transitionAfterCallback(state);
          }
        );
      }

      if (isAffirmative(input) || digit === '1') {
        state.intake.callbackNumber = state.callerPhone;
        state.intake.callbackConfirmed = true;
        return transitionAfterCallback(state);
      }

      // Caller provided a different number — confirm before proceeding
      state.intake.callbackNumber = input || digit || state.callerPhone;
      const spokenCallback = formatPhoneForTTS(state.intake.callbackNumber);
      return {
        responseText: t(state.lang,
          `Okay, I have ${spokenCallback}. Is that right?`,
          `Bien, tengo ${spokenCallback}. ¿Es correcto?`
        ),
        nextStage: 'confirm_callback',
        endCall: false,
      };
    }

    // ========================================================================
    // CONFIRM CALLBACK
    // ========================================================================
    case 'confirm_callback': {
      if (!input && !digit) {
        return handleRetry(state, 'confirm_callback',
          t(state.lang,
            `Just to confirm, I have ${formatPhoneForTTS(state.intake.callbackNumber!)}. Is that right?`,
            `Solo para confirmar, tengo ${formatPhoneForTTS(state.intake.callbackNumber!)}. ¿Está correcto?`
          ),
          () => {
            // Retry exhausted — accept current number
            state.intake.callbackConfirmed = true;
            return transitionAfterCallback(state);
          }
        );
      }

      if (isAffirmative(input) || digit === '1') {
        state.intake.callbackConfirmed = true;
        return transitionAfterCallback(state);
      }

      // Caller said no — ask for the number again
      return {
        responseText: t(state.lang,
          "No problem. What is the best number to reach you?",
          "No hay problema. ¿Cuál es el mejor número para contactarle?"
        ),
        nextStage: 'ask_callback',
        endCall: false,
      };
    }

    // ========================================================================
    // ASK PATIENT DOCTOR
    // ========================================================================
    case 'ask_patient_doctor': {
      if (!input && !digit) {
        return handleRetry(state, 'ask_patient_doctor',
          t(state.lang, "Which doctor do you see at our office?", "¿Con qué doctor se atiende en nuestra oficina?"),
          () => {
            // Default to on-call provider (no match)
            state.transcript.push({ role: 'system', content: 'Doctor selection skipped — using default on-call provider', ts });
            return {
              responseText: askPostOpText(state),
              nextStage: 'ask_postop' as const,
              endCall: false,
            };
          }
        );
      }

      if (input) {
        const doctorResponse = input.toLowerCase();
        state.intake.patientDoctor = input;

        // Check if patient explicitly doesn't know their doctor
        const dontKnowPatterns = /\b(don't know|do not know|not sure|unsure|no sé|no se|no recuerdo)\b/i;
        if (dontKnowPatterns.test(input)) {
          state.intake.patientDoctor = 'Unknown — patient unsure';
          state.transcript.push({ role: 'system', content: 'Patient does not know their doctor — using default on-call provider', ts });
          return {
            responseText: askPostOpText(state),
            nextStage: 'ask_postop',
            endCall: false,
          };
        }

        // Try to match spoken name against provider directory keywords
        let matched = false;
        for (const [keyword, provider] of Object.entries(state.providerDirectory)) {
          if (doctorResponse.includes(keyword)) {
            state.intake.matchedProviderName = provider.name;
            state.intake.matchedProviderPhone = provider.phone;
            state.transcript.push({ role: 'system', content: `Doctor matched: ${provider.name} (keyword: "${keyword}")`, ts });
            matched = true;
            break;
          }
        }

        if (!matched) {
          state.transcript.push({ role: 'system', content: `No provider match for: "${input}" — using default on-call provider`, ts });
        }
      }

      return {
        responseText: askPostOpText(state),
        nextStage: 'ask_postop',
        endCall: false,
      };
    }

    // ========================================================================
    // POST-OP CHECK
    // ========================================================================
    case 'ask_postop': {
      if (!input && !digit) {
        return handleRetry(state, 'ask_postop',
          t(state.lang,
            "Sorry, have you had any eye surgery in the last two weeks? Just say yes or no.",
            "Disculpe, ¿ha tenido alguna cirugía de ojos en las últimas dos semanas? Solo diga sí o no."
          ),
          () => {
            state.intake.hasRecentSurgery = false;
            return {
              responseText: redFlag1Text(state.lang),
              nextStage: 'redflag_1' as const,
              endCall: false,
            };
          }
        );
      }

      state.intake.hasRecentSurgery = isAffirmative(input) || digit === '1';

      if (state.intake.hasRecentSurgery) {
        state.intake.symptoms.push('post-operative concern');
        return {
          responseText: t(state.lang,
            "Okay, got it. Can you tell me briefly what's going on? Just describe what you're experiencing.",
            "Entendido. ¿Puede decirme brevemente qué le está pasando? Solo describa lo que está sintiendo."
          ),
          nextStage: 'postop_complaint',
          endCall: false,
        };
      }

      return {
        responseText: redFlag1Text(state.lang),
        nextStage: 'redflag_1',
        endCall: false,
      };
    }

    // ========================================================================
    // POST-OP COMPLAINT
    // ========================================================================
    case 'postop_complaint': {
      if (!input) {
        return handleRetry(state, 'postop_complaint',
          t(state.lang,
            "Can you describe what you're experiencing?",
            "¿Puede describir lo que está sintiendo?"
          ),
          () => {
            state.intake.primaryComplaint = 'Post-op concern (unable to capture details)';
            state.intake.disposition = 'URGENT_CALLBACK';
            state.intake.dispositionReason = 'Post-operative patient concern';
            return dispositionResponse(state);
          }
        );
      }

      state.intake.primaryComplaint = input;
      const hasRedFlagKeywords = /\b(vision loss|can't see|blind|curtain|shadow|chemical|splash|trauma|hit|punch|pus|discharge|oozing|swelling|swollen|redness.{0,10}worse|fever|no puedo ver|ciego|cortina|sombra|químico|golpe|pus|secreción|supurando|hinchazón|hinchado|enrojecimiento|fiebre)\b/i.test(input.toLowerCase());

      if (hasRedFlagKeywords) {
        state.intake.disposition = 'ER_NOW';
        state.intake.dispositionReason = 'Post-operative patient with red flag symptoms';
      } else {
        state.intake.disposition = 'URGENT_CALLBACK';
        state.intake.dispositionReason = 'Post-operative patient concern';
      }
      return confirmDetailsPrompt(state);
    }

    // ========================================================================
    // RED FLAG 1: Vision Loss
    // ========================================================================
    case 'redflag_1': {
      if (!input && !digit) {
        return handleRetry(state, 'redflag_1',
          redFlag1Text(state.lang),
          () => {
            state.intake.hasVisionLoss = false;
            return { responseText: redFlag2Text(state.lang), nextStage: 'redflag_2' as const, endCall: false };
          }
        );
      }
      state.intake.hasVisionLoss = isAffirmative(input) || digit === '1';
      if (state.intake.hasVisionLoss) {
        state.intake.disposition = 'ER_NOW';
        state.intake.dispositionReason = 'Sudden vision loss or major change';
        state.intake.symptoms.push('sudden vision loss');
        state.intake.primaryComplaint = 'Sudden vision loss';
        return dispositionResponse(state);
      }
      return { responseText: redFlag2Text(state.lang), nextStage: 'redflag_2', endCall: false };
    }

    // ========================================================================
    // RED FLAG 2: Flashes/Floaters with Curtain
    // ========================================================================
    case 'redflag_2': {
      if (!input && !digit) {
        return handleRetry(state, 'redflag_2',
          redFlag2Text(state.lang),
          () => {
            state.intake.hasFlashesWithCurtain = false;
            return { responseText: redFlag3Text(state.lang), nextStage: 'redflag_3' as const, endCall: false };
          }
        );
      }
      state.intake.hasFlashesWithCurtain = isAffirmative(input) || digit === '1';
      if (state.intake.hasFlashesWithCurtain) {
        state.intake.disposition = 'ER_NOW';
        state.intake.dispositionReason = 'Flashes/floaters with curtain/shadow - possible retinal detachment';
        state.intake.symptoms.push('flashes/floaters with curtain/shadow');
        state.intake.primaryComplaint = 'Flashes/floaters with visual field loss';
        return dispositionResponse(state);
      }
      return { responseText: redFlag3Text(state.lang), nextStage: 'redflag_3', endCall: false };
    }

    // ========================================================================
    // RED FLAG 3: Severe Pain
    // ========================================================================
    case 'redflag_3': {
      if (!input && !digit) {
        return handleRetry(state, 'redflag_3',
          redFlag3Text(state.lang),
          () => {
            state.intake.hasSeverePain = false;
            return { responseText: redFlag4Text(state.lang), nextStage: 'redflag_4' as const, endCall: false };
          }
        );
      }
      state.intake.hasSeverePain = isAffirmative(input) || digit === '1';
      if (state.intake.hasSeverePain) {
        state.intake.disposition = 'ER_NOW';
        state.intake.dispositionReason = 'Severe eye pain';
        state.intake.symptoms.push('severe eye pain');
        state.intake.primaryComplaint = 'Severe eye pain';
        return dispositionResponse(state);
      }
      return { responseText: redFlag4Text(state.lang), nextStage: 'redflag_4', endCall: false };
    }

    // ========================================================================
    // RED FLAG 4: Trauma / Chemical
    // ========================================================================
    case 'redflag_4': {
      if (!input && !digit) {
        return handleRetry(state, 'redflag_4',
          redFlag4Text(state.lang),
          () => {
            state.intake.hasTraumaChemical = false;
            return {
              responseText: briefComplaintText(state.lang),
              nextStage: 'brief_complaint' as const,
              endCall: false,
            };
          }
        );
      }
      state.intake.hasTraumaChemical = isAffirmative(input) || digit === '1';
      if (state.intake.hasTraumaChemical) {
        state.intake.disposition = 'ER_NOW';
        state.intake.dispositionReason = 'Eye trauma or chemical exposure';
        state.intake.symptoms.push('trauma/chemical exposure');
        state.intake.primaryComplaint = 'Eye trauma or chemical exposure';
        return dispositionResponse(state);
      }
      return {
        responseText: briefComplaintText(state.lang),
        nextStage: 'brief_complaint',
        endCall: false,
      };
    }

    // ========================================================================
    // BRIEF COMPLAINT
    // ========================================================================
    case 'brief_complaint': {
      if (!input) {
        return handleRetry(state, 'brief_complaint',
          briefComplaintText(state.lang),
          () => {
            state.intake.primaryComplaint = 'Unable to capture complaint';
            state.intake.disposition = 'URGENT_CALLBACK';
            state.intake.dispositionReason = 'Unable to capture complaint after retries — fail-safe escalation';
            return dispositionResponse(state);
          }
        );
      }

      state.intake.primaryComplaint = input;

      // Check for prescription request mid-flow
      if (isPrescriptionRequest(input)) {
        state.intake.isPrescriptionRequest = true;
        return {
          responseText: t(state.lang,
            "What medication do you need refilled?",
            "¿Qué medicamento necesita que le resurtan?"
          ),
          nextStage: 'prescription_medication',
          endCall: false,
        };
      }

      return {
        responseText: t(state.lang,
          "Thanks for that. And when did this start? For example, today, yesterday, or a few days ago.",
          "Gracias. ¿Y cuándo comenzó esto? Por ejemplo, hoy, ayer, o hace unos días."
        ),
        nextStage: 'ask_onset',
        endCall: false,
      };
    }

    // ========================================================================
    // SYMPTOM ONSET
    // ========================================================================
    case 'ask_onset': {
      if (!input && !digit) {
        return handleRetry(state, 'ask_onset',
          t(state.lang,
            "When did this start? Just give me a rough idea — today, yesterday, or longer.",
            "¿Cuándo comenzó esto? Solo una idea general — hoy, ayer, o hace más tiempo."
          ),
          () => {
            state.intake.symptomOnset = 'Not provided';
            return {
              responseText: t(state.lang,
                "No problem. Is this getting worse right now, or has it been staying about the same?",
                "No hay problema. ¿Esto está empeorando ahora mismo, o se ha mantenido más o menos igual?"
              ),
              nextStage: 'stability_check' as const,
              endCall: false,
            };
          }
        );
      }

      state.intake.symptomOnset = input || 'Not provided';
      return {
        responseText: t(state.lang,
          "Got it. Is this getting worse right now, or has it been staying about the same?",
          "Entendido. ¿Esto está empeorando ahora mismo, o se ha mantenido más o menos igual?"
        ),
        nextStage: 'stability_check',
        endCall: false,
      };
    }

    // ========================================================================
    // STABILITY CHECK
    // ========================================================================
    case 'stability_check': {
      if (!input && !digit) {
        return handleRetry(state, 'stability_check',
          t(state.lang,
            "Sorry, is this getting worse, or has it been about the same? Just say worse or same.",
            "Disculpe, ¿está empeorando, o se ha mantenido igual? Solo diga peor o igual."
          ),
          () => {
            // Fail-safe: escalate
            state.intake.isWorsening = true;
            state.intake.disposition = 'URGENT_CALLBACK';
            state.intake.dispositionReason = 'Could not determine stability — fail-safe escalation';
            return dispositionResponse(state);
          }
        );
      }

      state.intake.stabilityResponse = input || `pressed ${digit}`;
      const worsening = isWorseningLanguage(input) || digit === '1';
      state.intake.isWorsening = worsening;

      if (worsening) {
        state.intake.disposition = 'URGENT_CALLBACK';
        state.intake.dispositionReason = 'Condition worsening - urgent callback needed';
        state.intake.symptoms.push('worsening condition');
      } else {
        state.intake.disposition = 'NEXT_BUSINESS_DAY';
        state.intake.dispositionReason = 'Stable condition - next business day follow-up';
      }
      return confirmDetailsPrompt(state);
    }

    // ========================================================================
    // CONFIRM DETAILS (read-back before disposition)
    // ========================================================================
    case 'confirm_details': {
      if (!input && !digit) {
        // Don't retry — just proceed to disposition
        return dispositionResponse(state);
      }

      if (isAffirmative(input) || digit === '1') {
        // Confirmed — deliver disposition
        return dispositionResponse(state);
      }

      // Patient said no — ask what needs correcting
      return {
        responseText: t(state.lang,
          "No problem. What needs to be corrected — your name, or the callback number?",
          "No hay problema. ¿Qué necesita corregir — su nombre, o el número de contacto?"
        ),
        nextStage: 'correct_details',
        endCall: false,
      };
    }

    // ========================================================================
    // CORRECT DETAILS
    // ========================================================================
    case 'correct_details': {
      if (!input && !digit) {
        // Can't capture correction — proceed with what we have
        return dispositionResponse(state);
      }

      // Try to determine if they're correcting name or number
      const hasDigits = /\d{3,}/.test(input);
      if (hasDigits) {
        // Likely a phone number correction
        state.intake.callbackNumber = input;
        const spoken = formatPhoneForTTS(input);
        state.transcript.push({ role: 'system', content: `Callback number corrected to: ${input}`, ts });
        return {
          responseText: t(state.lang,
            `Got it, I've updated your callback number to ${spoken}. Thank you.`,
            `Entendido, he actualizado su número de contacto a ${spoken}. Gracias.`
          ),
          nextStage: 'complete' as any,
          endCall: false,
        };
      } else {
        // Likely a name correction
        state.intake.patientName = input;
        state.transcript.push({ role: 'system', content: `Patient name corrected to: ${input}`, ts });
        return dispositionResponse(state);
      }
    }

    // ========================================================================
    // PRESCRIPTION DOCTOR (asks doctor before prescription details)
    // ========================================================================
    case 'prescription_doctor': {
      if (!input && !digit) {
        return handleRetry(state, 'prescription_doctor',
          t(state.lang, "Which doctor do you see at our office? If you're not sure, just say I don't know.", "¿Con qué doctor se atiende en nuestra oficina? Si no está seguro, solo diga no sé."),
          () => {
            state.transcript.push({ role: 'system', content: 'Doctor selection skipped (prescription flow) — using default on-call provider', ts });
            return {
              responseText: t(state.lang,
                "No problem. Let me grab a few details. What's your full name?",
                "No hay problema. Déjeme tomar algunos datos. ¿Cuál es su nombre completo?"
              ),
              nextStage: 'prescription_name' as const,
              endCall: false,
            };
          }
        );
      }

      if (input) {
        const doctorResponse = input.toLowerCase();
        state.intake.patientDoctor = input;

        // Check if patient doesn't know
        const dontKnowPatterns = /\b(don't know|do not know|not sure|unsure|no sé|no se|no recuerdo)\b/i;
        if (dontKnowPatterns.test(input)) {
          state.intake.patientDoctor = 'Unknown — patient unsure';
          state.transcript.push({ role: 'system', content: 'Patient does not know their doctor (prescription flow) — using default on-call provider', ts });
        } else {
          // Try to match spoken name against provider directory keywords
          let matched = false;
          for (const [keyword, provider] of Object.entries(state.providerDirectory)) {
            if (doctorResponse.includes(keyword)) {
              state.intake.matchedProviderName = provider.name;
              state.intake.matchedProviderPhone = provider.phone;
              state.transcript.push({ role: 'system', content: `Doctor matched (prescription flow): ${provider.name} (keyword: "${keyword}")`, ts });
              matched = true;
              break;
            }
          }
          if (!matched) {
            state.transcript.push({ role: 'system', content: `No provider match for: "${input}" (prescription flow) — using default on-call provider`, ts });
          }
        }
      }

      return {
        responseText: t(state.lang,
          "Got it. Let me grab a few details. What's your full name?",
          "Entendido. Déjeme tomar algunos datos. ¿Cuál es su nombre completo?"
        ),
        nextStage: 'prescription_name',
        endCall: false,
      };
    }

    // ========================================================================
    // PRESCRIPTION FLOW
    // ========================================================================
    case 'prescription_name': {
      if (!input) {
        return handleRetry(state, 'prescription_name',
          t(state.lang, "Can I get your full name?", "¿Cuál es su nombre completo?"),
          () => {
            state.intake.patientName = 'Not provided';
            return {
              responseText: t(state.lang,
                `Can we reach you at the number you're calling from, or is there a better number?`,
                `¿Podemos llamarle al número desde el que está llamando, o hay un mejor número?`
              ),
              nextStage: 'prescription_callback' as const,
              endCall: false,
            };
          }
        );
      }
      state.intake.patientName = input;
      return {
        responseText: t(state.lang,
          `Can we reach you at the number you're calling from, or is there a better number?`,
          `¿Podemos llamarle al número desde el que está llamando, o hay un mejor número?`
        ),
        nextStage: 'prescription_callback',
        endCall: false,
      };
    }

    case 'prescription_callback': {
      if (!input && !digit) {
        return handleRetry(state, 'prescription_callback',
          t(state.lang,
            `Can I reach you at the number you're calling from?`,
            `¿Podemos llamarle al número desde el que llama?`
          ),
          () => {
            state.intake.callbackNumber = state.callerPhone;
            return {
              responseText: t(state.lang, "What medication do you need refilled?", "¿Qué medicamento necesita que le resurtan?"),
              nextStage: 'prescription_medication' as const,
              endCall: false,
            };
          }
        );
      }

      if (isAffirmative(input) || digit === '1') {
        state.intake.callbackNumber = state.callerPhone;
      } else {
        state.intake.callbackNumber = input || digit || state.callerPhone;
      }

      return {
        responseText: t(state.lang, "What medication do you need refilled?", "¿Qué medicamento necesita que le resurtan?"),
        nextStage: 'prescription_medication',
        endCall: false,
      };
    }

    case 'prescription_medication': {
      if (!input) {
        return handleRetry(state, 'prescription_medication',
          t(state.lang, "What medication do you need refilled?", "¿Qué medicamento necesita que le resurtan?"),
          () => {
            state.intake.medicationRequested = 'Not specified';
            return {
              responseText: prescriptionSafetyText(state.lang),
              nextStage: 'prescription_safety' as const,
              endCall: false,
            };
          }
        );
      }
      state.intake.medicationRequested = input;
      return {
        responseText: prescriptionSafetyText(state.lang),
        nextStage: 'prescription_safety',
        endCall: false,
      };
    }

    case 'prescription_safety': {
      if (!input && !digit) {
        return handleRetry(state, 'prescription_safety',
          prescriptionSafetyText(state.lang),
          () => {
            // Safety check not completed — default to next business day
            state.intake.disposition = 'NEXT_BUSINESS_DAY';
            state.intake.dispositionReason = 'Prescription request - safety check not completed (retry exhausted)';
            state.intake.primaryComplaint = `Prescription refill: ${state.intake.medicationRequested || 'unspecified'}`;
            return nextBusinessDayResponse(state);
          }
        );
      }

      const hasEmergentSymptoms = containsAffirmative(input) || digit === '1';

      if (hasEmergentSymptoms) {
        // Needs DOB then red flag screen
        return {
          responseText: t(state.lang, "Okay, I need to get a bit more information. What's your date of birth?", "Bien, necesito un poco más de información. ¿Cuál es su fecha de nacimiento?"),
          nextStage: 'prescription_emergency_dob',
          endCall: false,
        };
      }

      // No emergent symptoms — next business day
      state.intake.disposition = 'NEXT_BUSINESS_DAY';
      state.intake.dispositionReason = 'Prescription request - safety check passed';
      state.intake.safetyCheckCompleted = true;
      state.intake.primaryComplaint = `Prescription refill: ${state.intake.medicationRequested || 'unspecified'}`;
      return nextBusinessDayResponse(state);
    }

    case 'prescription_emergency_dob': {
      if (!input && !digit) {
        return handleRetry(state, 'prescription_emergency_dob',
          t(state.lang, "Okay, I need to get a bit more information. What's your date of birth?", "Bien, necesito un poco más de información. ¿Cuál es su fecha de nacimiento?"),
          () => {
            state.intake.dateOfBirth = 'Not provided';
            return { responseText: redFlag1Text(state.lang), nextStage: 'redflag_1' as const, endCall: false };
          }
        );
      }
      state.intake.dateOfBirth = input || digit || 'Not provided';
      return { responseText: redFlag1Text(state.lang), nextStage: 'redflag_1', endCall: false };
    }

    // ========================================================================
    // COMPLETE — should not receive input
    // ========================================================================
    case 'complete':
      return {
        responseText: t(state.lang, "Take care.", "Cuídese."),
        nextStage: 'complete',
        endCall: true,
      };

    default:
      return {
        responseText: t(state.lang,
          `Are you an established patient with ${state.officeName}?`,
          `¿Es usted un paciente establecido con ${state.officeName}?`
        ),
        nextStage: 'established_gate',
        endCall: false,
      };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function handleRetry(
  state: TriageState,
  stage: string,
  retryText: string,
  exhaustedFn: () => TriageResult
): TriageResult {
  const count = state.retryCounts[stage] || 0;
  if (count >= MAX_RETRIES) {
    return exhaustedFn();
  }
  state.retryCounts[stage] = count + 1;
  return {
    responseText: retryText,
    nextStage: state.stage, // stay on same stage
    endCall: false,
  };
}

function askCallback(state: TriageState): TriageResult {
  return {
    responseText: t(state.lang,
      `Can we reach you at the number you're calling from, or is there a better number?`,
      `¿Podemos llamarle al número desde el que está llamando, o hay un mejor número?`
    ),
    nextStage: 'ask_callback',
    endCall: false,
  };
}

function transitionAfterCallback(state: TriageState): TriageResult {
  // Always ask which doctor the patient sees — used for provider routing
  if (Object.keys(state.providerDirectory).length > 0) {
    // Build a list of unique provider names for the prompt
    const uniqueNames = [...new Set(Object.values(state.providerDirectory).map(p => p.name))];
    const nameList = uniqueNames.length <= 4
      ? uniqueNames.join(', ')
      : uniqueNames.slice(0, 4).join(', ');

    return {
      responseText: t(state.lang,
        `And who's your doctor at ${state.officeName}? For example, ${nameList}. If you're not sure, just say I don't know.`,
        `¿Y quién es su doctor en ${state.officeName}? Por ejemplo, ${nameList}. Si no está seguro, solo diga no sé.`
      ),
      nextStage: 'ask_patient_doctor',
      endCall: false,
    };
  }
  // No providers configured — skip doctor selection
  return {
    responseText: askPostOpText(state),
    nextStage: 'ask_postop',
    endCall: false,
  };
}

function askPostOpText(state: TriageState): string {
  const nameGreeting = state.intake.patientName && state.intake.patientName !== 'Not provided'
    ? t(state.lang, `Thank you, ${state.intake.patientName}.`, `Gracias, ${state.intake.patientName}.`)
    : t(state.lang, 'Thank you.', 'Gracias.');

  return `${nameGreeting} ${t(state.lang,
    'I just need to ask a few quick safety questions. Have you had any eye surgery in the last two weeks?',
    'Solo necesito hacerle unas preguntas rápidas de seguridad. ¿Ha tenido alguna cirugía de ojos en las últimas dos semanas?'
  )}`;
}

function confirmDetailsPrompt(state: TriageState): TriageResult {
  const name = state.intake.patientName || 'your name';
  const callback = state.intake.callbackNumber
    ? formatPhoneForTTS(state.intake.callbackNumber)
    : 'the number you called from';

  return {
    responseText: t(state.lang,
      `Just to make sure I have everything right — your name is ${name}, and we'll reach you at ${callback}. Is that correct?`,
      `Solo para confirmar que tengo todo correcto — su nombre es ${name}, y le contactaremos al ${callback}. ¿Es correcto?`
    ),
    nextStage: 'confirm_details',
    endCall: false,
  };
}

function dispositionResponse(state: TriageState): TriageResult {
  const disposition = state.intake.disposition!;

  switch (disposition) {
    case 'ER_NOW':
      return {
        responseText: t(state.lang,
          "Okay, based on what you've told me, you need to get to the nearest emergency room right away. This needs immediate attention. We're also notifying the on-call doctor now. Please take care of yourself.",
          "Bien, basado en lo que me ha dicho, necesita ir a la sala de emergencias más cercana de inmediato. Esto necesita atención inmediata. También estamos notificando al doctor de guardia ahora. Por favor, cuídese."
        ),
        nextStage: 'complete',
        endCall: true,
        disposition: 'ER_NOW',
      };

    case 'URGENT_CALLBACK':
      return {
        responseText: t(state.lang,
          "Okay, let me get this to the right place. I'm sending your information to the on-call doctor now, and they'll call you back shortly. If things get worse in the meantime, please head to the nearest E R or call nine one one. Take care.",
          "Bien, déjeme enviar esto al lugar correcto. Estoy enviando su información al doctor de guardia ahora, y le devolverán la llamada pronto. Si las cosas empeoran mientras tanto, vaya a la sala de emergencias más cercana o llame al nueve uno uno. Cuídese."
        ),
        nextStage: 'complete',
        endCall: true,
        disposition: 'URGENT_CALLBACK',
      };

    case 'NEXT_BUSINESS_DAY':
    default:
      return nextBusinessDayResponse(state);
  }
}

function nextBusinessDayResponse(state: TriageState): TriageResult {
  return {
    responseText: t(state.lang,
      `Based on what you've described, this is something that can be handled when the office opens. Please call ${state.officeName} during business hours and we'll take care of you. If things get worse, or you have sudden vision loss, severe pain, or an eye injury, head to the nearest E R or call nine one one. Take care.`,
      `Basado en lo que me ha dicho, esto es algo que se puede atender cuando abra la oficina. Por favor llame a ${state.officeName} durante el horario de oficina y le atenderemos. Si las cosas empeoran, o tiene pérdida repentina de visión, dolor severo, o una lesión en el ojo, vaya a la sala de emergencias más cercana o llame al nueve uno uno. Cuídese.`
    ),
    nextStage: 'complete',
    endCall: true,
    disposition: 'NEXT_BUSINESS_DAY',
  };
}

// ============================================================================
// RED FLAG PROMPT TEXT
// ============================================================================

function redFlag1Text(lang: Lang): string {
  return t(lang,
    "Are you having any sudden vision loss, or a big sudden change in your vision?",
    "¿Está teniendo alguna pérdida repentina de visión, o un cambio grande y repentino en su visión?"
  );
}

function redFlag2Text(lang: Lang): string {
  return t(lang,
    "Okay, next question. Are you seeing any new flashes or floaters, especially with a curtain or shadow across your vision?",
    "Bien, siguiente pregunta. ¿Está viendo destellos o puntos flotantes nuevos, especialmente con una cortina o sombra en su visión?"
  );
}

function redFlag3Text(lang: Lang): string {
  return t(lang,
    "Are you having any severe eye pain right now?",
    "¿Tiene algún dolor severo en el ojo en este momento?"
  );
}

function redFlag4Text(lang: Lang): string {
  return t(lang,
    "And has there been any injury to your eye, or any kind of chemical splash or exposure?",
    "¿Y ha tenido alguna lesión en el ojo, o algún tipo de contacto con químicos?"
  );
}

function briefComplaintText(lang: Lang): string {
  return t(lang,
    "Good. So in your own words, what's going on with your eyes tonight? Just give me a brief description.",
    "Bien. Con sus propias palabras, ¿qué le está pasando con sus ojos esta noche? Solo déme una breve descripción."
  );
}

function prescriptionSafetyText(lang: Lang): string {
  return t(lang,
    "Just to be safe — are you having any sudden vision loss, severe eye pain, or an eye injury right now?",
    "Solo por seguridad — ¿tiene pérdida repentina de visión, dolor severo en el ojo, o alguna lesión en el ojo en este momento?"
  );
}
