import { createClient } from '@supabase/supabase-js';
import type { TriageState } from './types.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Queries Supabase for office config and on-call provider info based on the called phone number.
 * Used to initialize TriageState when a new WebSocket connection arrives.
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
    // Look up office by phone number
    const { data: office, error: officeError } = await supabase
      .from('offices')
      .select('id, name, spanish_enabled, use_conversation_relay')
      .contains('phone_numbers', [calledPhone])
      .eq('is_active', true)
      .limit(1)
      .single();

    if (officeError || !office) {
      console.error(`No office found for phone ${calledPhone}:`, officeError);
      return null;
    }

    // Look up today's on-call assignment
    const today = new Date().toISOString().split('T')[0];
    const { data: assignment } = await supabase
      .from('oncall_assignments')
      .select('*')
      .eq('office_id', office.id)
      .eq('assignment_date', today)
      .eq('status', 'active')
      .single();

    const onCallProvider = assignment
      ? {
          name: assignment.provider_name,
          phone: assignment.provider_phone.replace(/[^\d+]/g, '').startsWith('+')
            ? assignment.provider_phone.replace(/[^\d+]/g, '')
            : '+1' + assignment.provider_phone.replace(/\D/g, ''),
        }
      : { name: 'On-Call Provider', phone: '+15125551001' };

    // Check routing type — only ask for patient's doctor when routing is 'own_patients_only'
    let requiresPatientDoctorConfirmation = false;
    if (assignment?.provider_user_id) {
      const { data: routingConfig } = await supabase
        .from('provider_routing_config')
        .select('routing_type')
        .eq('provider_user_id', assignment.provider_user_id)
        .eq('is_active', true)
        .single();
      requiresPatientDoctorConfirmation = routingConfig?.routing_type === 'own_patients_only';
    }

    // Look up provider routing config for provider directory
    const { data: configs } = await supabase
      .from('provider_routing_config')
      .select('*')
      .eq('office_id', office.id)
      .eq('is_active', true);

    const providerDirectory: Record<string, { name: string; phone: string }> = {};
    if (configs) {
      for (const config of configs) {
        const formattedPhone = config.provider_phone.replace(/[^\d+]/g, '').startsWith('+')
          ? config.provider_phone.replace(/[^\d+]/g, '')
          : '+1' + config.provider_phone.replace(/\D/g, '');
        const provider = { name: config.provider_name, phone: formattedPhone };
        const keywords: string[] = config.match_keywords || config.provider_name.toLowerCase().split(/\s+/);
        for (const keyword of keywords) {
          providerDirectory[keyword.toLowerCase()] = provider;
        }
      }
    }

    return {
      officeId: office.id,
      officeName: office.name,
      spanishEnabled: office.spanish_enabled ?? false,
      onCallProvider,
      providerDirectory,
      requiresPatientDoctorConfirmation,
    };
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
      serviceLine: 'General Ophthalmology', // Default for Hill Country Eye Center
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
        isPrescriptionRequest: state.intake.isPrescriptionRequest,
        medicationRequested: state.intake.medicationRequested,
        patientDoctor: state.intake.patientDoctor,
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
          'Authorization': `Bearer ${supabaseKey}`,
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
