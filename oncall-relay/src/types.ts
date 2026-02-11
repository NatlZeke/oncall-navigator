export type Lang = 'en' | 'es';
export type Disposition = 'ER_NOW' | 'URGENT_CALLBACK' | 'NEXT_BUSINESS_DAY';

// All triage stages — must match the stages in twilio-voice-webhook/index.ts
export type TriageStage =
  | 'language_gate' | 'established_gate' | 'collect_name' | 'ask_dob'
  | 'ask_callback' | 'confirm_callback' | 'ask_patient_doctor' | 'ask_postop' | 'postop_complaint'
  | 'redflag_1' | 'redflag_2' | 'redflag_3' | 'redflag_4'
  | 'brief_complaint' | 'stability_check'
  | 'prescription_name' | 'prescription_callback' | 'prescription_medication'
  | 'prescription_safety' | 'prescription_emergency_dob'
  | 'complete';

export interface IntakeData {
  patientName?: string;
  dateOfBirth?: string;
  callbackNumber?: string;
  callbackConfirmed?: boolean;
  isEstablishedPatient?: boolean;
  hasRecentSurgery?: boolean;
  hasVisionLoss?: boolean;
  hasFlashesWithCurtain?: boolean;
  hasSeverePain?: boolean;
  hasTraumaChemical?: boolean;
  isWorsening?: boolean;
  stabilityResponse?: string;
  isPrescriptionRequest?: boolean;
  medicationRequested?: string;
  safetyCheckCompleted?: boolean;
  patientDoctor?: string;
  symptoms: string[];
  primaryComplaint?: string;
  disposition?: Disposition;
  dispositionReason?: string;
}

// Twilio ConversationRelay sends these message types over WebSocket
export interface TwilioSetupMessage {
  type: 'setup';
  callSid: string;
  from: string;    // Caller phone (E.164)
  to: string;      // Called phone (E.164)
  customParameters?: Record<string, string>;
}

export interface TwilioPromptMessage {
  type: 'prompt';
  voicePrompt: string;  // The STT transcription of what the caller said
  lang?: string;
  confidence?: number;
}

export interface TwilioDtmfMessage {
  type: 'dtmf';
  digit: string;
}

export interface TwilioInterruptMessage {
  type: 'interrupt';
  utteranceUntilInterrupt: string;
  durationUntilInterruptMs: number;
}

export interface TwilioEndMessage {
  type: 'end';
  handoffData?: string;
}

export type TwilioInboundMessage = TwilioSetupMessage | TwilioPromptMessage | TwilioDtmfMessage | TwilioInterruptMessage | TwilioEndMessage;

// Server sends these back to Twilio
export interface ServerTextResponse {
  type: 'text';
  token: string;    // Text for Twilio to speak via TTS
  last: boolean;    // true = this is the final segment, Twilio starts listening after TTS
}

export interface ServerEndResponse {
  type: 'end';
  handoffData?: string;
}

export type ServerOutboundMessage = ServerTextResponse | ServerEndResponse;

// Internal state for a single call
export interface TriageState {
  stage: TriageStage;
  lang: Lang;
  spanishEnabled: boolean;
  intake: IntakeData;
  officeName: string;
  officeId: string;
  callerPhone: string;
  calledPhone: string;
  callSid: string;
  transcript: Array<{ role: string; content: string; ts: string }>;
  retryCounts: Record<string, number>;
  onCallProvider: { name: string; phone: string };
  providerDirectory: Record<string, { name: string; phone: string }>;
  requiresPatientDoctorConfirmation: boolean;
}

export interface TriageResult {
  responseText: string;  // What to say to the caller
  nextStage: TriageStage;
  endCall: boolean;      // true = hang up after speaking
  disposition?: Disposition;
}
