import type { TriageState } from './types.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

/**
 * Calls the get-oncall-info edge function to look up office config and on-call provider.
 * This replaces direct database queries — no service role key needed.
 */
export async function getOnCallInfo(calledPhone: string): Promise<{
  officeId: string;
  officeName: string;
  spanishEnabled: boolean;
  onCallProvider: { name: string; phone: string };
  providerDirectory: Record<string, { name: string; phone: string }>;
  requiresPatientDoctorConfirmation: boolean;
} | null> {
  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/get-oncall-info`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ calledPhone }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error(`get-oncall-info failed (${response.status}):`, err);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('Failed to get on-call info:', err);
    return null;
  }
}

/**
 * Calls the conversation-relay-complete edge function to save intake data,
 * create escalations, and send SMS notifications.
 */
export async function saveCompletedIntake(state: TriageState): Promise<void> {
  try {
    const payload = {
      callSid: state.callSid,
      callerPhone: state.callerPhone,
      calledPhone: state.calledPhone,
      officeId: state.officeId,
      officeName: state.officeName,
      lang: state.lang,
      serviceLine: 'General Ophthalmology',
      intake: {
        patientName: state.intake.patientName,
        dateOfBirth: state.intake.dateOfBirth,
        callbackNumber: state.intake.callbackNumber || state.callerPhone,
        isEstablishedPatient: state.intake.isEstablishedPatient,
        hasRecentSurgery: state.intake.hasRecentSurgery,
        hasVisionLoss: state.intake.hasVisionLoss,
        hasFlashesWithCurtain: state.intake.hasFlashesWithCurtain,
        hasSeverePain: state.intake.hasSeverePain,
        hasTraumaChemical: state.intake.hasTraumaChemical,
        isWorsening: state.intake.isWorsening,
        stabilityResponse: state.intake.stabilityResponse,
        symptomOnset: state.intake.symptomOnset,
        isPrescriptionRequest: state.intake.isPrescriptionRequest,
        medicationRequested: state.intake.medicationRequested,
        patientDoctor: state.intake.patientDoctor,
        matchedProviderName: state.intake.matchedProviderName,
        matchedProviderPhone: state.intake.matchedProviderPhone,
        symptoms: state.intake.symptoms,
        primaryComplaint: state.intake.primaryComplaint,
        disposition: state.intake.disposition || 'NEXT_BUSINESS_DAY',
        dispositionReason: state.intake.dispositionReason || 'Call ended before triage completed',
      },
      transcript: state.transcript,
    };

    const response = await fetch(
      `${supabaseUrl}/functions/v1/conversation-relay-complete`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error(`[${state.callSid}] conversation-relay-complete failed:`, result);
    } else {
      console.log(`[${state.callSid}] Intake saved: disposition=${result.disposition}, escalationId=${result.escalationId}`);
    }
  } catch (err) {
    console.error(`[${state.callSid}] Error saving completed intake:`, err);
  }
}
