/**
 * triage-machine.ts — Pure state machine for voice triage.
 *
 * This file ports the clinical decision logic from twilio-voice-webhook/index.ts
 * (the <Gather> flow) into a function-based state machine for ConversationRelay.
 *
 * CRITICAL: All clinical decisions must produce IDENTICAL outcomes to the <Gather> flow.
 * A doctor receiving an SMS should NOT be able to tell which transport was used.
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
        "I understand you'd like to leave a message. Unfortunately I can't record a voicemail in this mode. Please call back and press zero at the start of the call to leave a voicemail. If this is an emergency, please hang up and dial nine one one. Goodbye.",
        "Entiendo que desea dejar un mensaje. Desafortunadamente no puedo grabar un mensaje de voz en este modo. Por favor llame de nuevo y oprima cero al inicio de la llamada para dejar un mensaje de voz. Si esto es una emergencia, cuelgue y marque el nueve uno uno. Adiós."
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
          `¿Es usted un paciente establecido con ${state.officeName}?`
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
            `Are you an established patient with ${state.officeName}? Say yes or no.`,
            `¿Es usted un paciente establecido con ${state.officeName}? Diga sí o no.`
          ),
          // Retry exhausted fallback: non-patient deflection
          () => ({
            responseText: t(state.lang,
              "I'm having trouble hearing you. After-hours support is available for established patients only. If this is an emergency, please go to the nearest emergency room or call nine one one. Otherwise, please call our office during business hours. Goodbye.",
              "Tengo dificultad para escucharle. El servicio fuera de horario está disponible solo para pacientes establecidos. Si esto es una emergencia, por favor vaya a la sala de emergencias más cercana o llame al nueve uno uno. De lo contrario, por favor llame a nuestra oficina durante el horario de atención. Adiós."
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
            "Thanks for calling. After-hours support is available for established patients only. If this is an emergency, please go to the nearest emergency room or call nine one one. Otherwise, please call our office during business hours to schedule an appointment. Goodbye.",
            "Gracias por llamar. El servicio fuera de horario está disponible solo para pacientes establecidos. Si esto es una emergencia, por favor vaya a la sala de emergencias más cercana o llame al nueve uno uno. De lo contrario, por favor llame a nuestra oficina durante el horario de atención para hacer una cita. Adiós."
          ),
          nextStage: 'complete',
          endCall: true,
        };
      }

      // Check for prescription shortcut in the response
      if (input && isPrescriptionRequest(input)) {
        state.intake.isPrescriptionRequest = true;
        return {
          responseText: t(state.lang,
            "I can help with your prescription request. Let me get a few details. What is your full name?",
            "Puedo ayudarle con su solicitud de receta. Necesito algunos detalles. ¿Cuál es su nombre completo?"
          ),
          nextStage: 'prescription_name',
          endCall: false,
        };
      }

      return {
        responseText: t(state.lang,
          "Great, I'll collect a few quick details. What is your full name?",
          "Muy bien, voy a tomar algunos datos rápidos. ¿Cuál es su nombre completo?"
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
          t(state.lang, "I didn't catch that. Can I get your full name?", "No le escuché. ¿Puede darme su nombre completo?"),
          () => {
            state.intake.patientName = 'Not provided';
            return {
              responseText: t(state.lang, "What is your date of birth?", "¿Cuál es su fecha de nacimiento?"),
              nextStage: 'ask_dob' as const,
              endCall: false,
            };
          }
        );
      }
      state.intake.patientName = input || 'Not provided';
      return {
        responseText: t(state.lang, "What is your date of birth?", "¿Cuál es su fecha de nacimiento?"),
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
          t(state.lang, "What is your date of birth?", "¿Cuál es su fecha de nacimiento?"),
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
            `Can I reach you at the number you're calling from? Say yes, or tell me a different number.`,
            `¿Podemos llamarle al número desde el que llama? Diga sí, o dígame un número diferente.`
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
          `I have your callback number as ${spokenCallback}. Is that correct?`,
          `Tengo su número de devolución de llamada como ${spokenCallback}. ¿Es correcto?`
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
            `I have ${formatPhoneForTTS(state.intake.callbackNumber!)}. Is that correct? Say yes or no.`,
            `Tengo ${formatPhoneForTTS(state.intake.callbackNumber!)}. ¿Es correcto? Diga sí o no.`
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
            "Have you had eye surgery in the last 14 days? Say yes or no.",
            "¿Ha tenido cirugía de ojos en los últimos 14 días? Diga sí o no."
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
            "Got it. Can you briefly tell me what's going on? Please describe what you're experiencing.",
            "Entendido. ¿Puede decirme brevemente qué le pasa? Por favor describa lo que está experimentando."
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
            "Please describe what you're experiencing.",
            "Por favor describa lo que está experimentando."
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
      const hasRedFlagKeywords = /\b(vision loss|can't see|blind|curtain|shadow|chemical|splash|trauma|hit|punch|no puedo ver|ciego|cortina|sombra|químico|golpe)\b/i.test(input.toLowerCase());

      if (hasRedFlagKeywords) {
        state.intake.disposition = 'ER_NOW';
        state.intake.dispositionReason = 'Post-operative patient with red flag symptoms';
      } else {
        state.intake.disposition = 'URGENT_CALLBACK';
        state.intake.dispositionReason = 'Post-operative patient concern';
      }
      return dispositionResponse(state);
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
          "Thank you for that information. Is this getting worse right now, or has it been about the same?",
          "Gracias por esa información. ¿Esto está empeorando ahora mismo, o ha estado más o menos igual?"
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
            "Is this getting worse right now, or has it been about the same? Say worse or same.",
            "¿Esto está empeorando ahora mismo, o ha estado más o menos igual? Diga peor o igual."
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
      return dispositionResponse(state);
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
                `Can I reach you at the number you're calling from? Say yes, or tell me a different number.`,
                `¿Podemos llamarle al número desde el que llama? Diga sí, o dígame un número diferente.`
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
          `Can I reach you at the number you're calling from? Say yes, or tell me a different number.`,
          `¿Podemos llamarle al número desde el que llama? Diga sí, o dígame un número diferente.`
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
          responseText: t(state.lang, "What is your date of birth?", "¿Cuál es su fecha de nacimiento?"),
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
          t(state.lang, "What is your date of birth?", "¿Cuál es su fecha de nacimiento?"),
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
        responseText: t(state.lang, "Goodbye.", "Adiós."),
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
      `Can I reach you at the number you're calling from? Say yes, or tell me a different number.`,
      `¿Podemos llamarle al número desde el que llama? Diga sí, o dígame un número diferente.`
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
        `Which doctor do you see at ${state.officeName}? For example, ${nameList}.`,
        `¿Con qué doctor se atiende en ${state.officeName}? Por ejemplo, ${nameList}.`
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
    'Now I need to ask a few quick safety questions. Have you had eye surgery in the last 14 days?',
    'Ahora necesito hacerle unas preguntas rápidas de seguridad. ¿Ha tenido cirugía de ojos en los últimos 14 días?'
  )}`;
}

function dispositionResponse(state: TriageState): TriageResult {
  const disposition = state.intake.disposition!;

  switch (disposition) {
    case 'ER_NOW':
      return {
        responseText: t(state.lang,
          "Thank you for that information. Based on what you've described, you should go to the nearest emergency room right away. This is a time-sensitive eye concern that needs immediate attention. We are also notifying the on-call doctor. Goodbye.",
          "Gracias por esa información. Basado en lo que ha descrito, debe ir a la sala de emergencias más cercana de inmediato. Esta es una preocupación ocular que requiere atención inmediata. También estamos notificando al doctor de guardia. Adiós."
        ),
        nextStage: 'complete',
        endCall: true,
        disposition: 'ER_NOW',
      };

    case 'URGENT_CALLBACK':
      return {
        responseText: t(state.lang,
          "Thank you for that information. Let me get this to the right place. I'm sending your information to the on-call doctor now. They will call you back shortly. If your condition worsens or you develop an emergency, please go to the nearest emergency room or call nine one one. Goodbye.",
          "Gracias por esa información. Permítame enviar esto al lugar correcto. Estoy enviando su información al doctor de guardia ahora. Le devolverán la llamada pronto. Si su condición empeora o tiene una emergencia, por favor vaya a la sala de emergencias más cercana o llame al nueve uno uno. Adiós."
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
      `Thank you for that information. Based on what you've described, this can be handled during our next business day. Please call ${state.officeName} when the office opens and we'll be happy to help you. If your condition worsens or you develop sudden vision loss, severe pain, or an eye injury, please go to the nearest emergency room or call nine one one. Goodbye.`,
      `Gracias por esa información. Basado en lo que ha descrito, esto puede ser atendido durante nuestro próximo día hábil. Por favor llame a ${state.officeName} cuando abra la oficina y con gusto le atenderemos. Si su condición empeora o desarrolla pérdida repentina de visión, dolor severo, o una lesión en el ojo, por favor vaya a la sala de emergencias más cercana o llame al nueve uno uno. Adiós.`
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
    "Are you having sudden vision loss or a major sudden change in vision?",
    "¿Tiene pérdida repentina de visión o un cambio importante y repentino en su visión?"
  );
}

function redFlag2Text(lang: Lang): string {
  return t(lang,
    "Do you see new flashes or floaters together with a curtain or shadow in your vision?",
    "¿Ve destellos o puntos flotantes nuevos junto con una cortina o sombra en su visión?"
  );
}

function redFlag3Text(lang: Lang): string {
  return t(lang,
    "Are you having severe eye pain right now?",
    "¿Tiene dolor severo en el ojo en este momento?"
  );
}

function redFlag4Text(lang: Lang): string {
  return t(lang,
    "Was there any trauma to your eye or any chemical exposure?",
    "¿Hubo algún trauma en su ojo o exposición a químicos?"
  );
}

function briefComplaintText(lang: Lang): string {
  return t(lang,
    "Good. Now, in your own words, what's going on with your eyes tonight? Please briefly describe your concern.",
    "Bien. Ahora, con sus propias palabras, ¿qué le pasa con sus ojos esta noche? Por favor describa brevemente su preocupación."
  );
}

function prescriptionSafetyText(lang: Lang): string {
  return t(lang,
    "Just to confirm—are you having sudden vision loss, severe eye pain, or an eye injury right now?",
    "Solo para confirmar—¿tiene pérdida repentina de visión, dolor severo en el ojo, o una lesión en el ojo en este momento?"
  );
}
