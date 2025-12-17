import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mock on-call data - in production this would come from the database
// Maps Twilio phone numbers to office on-call information
const mockOnCallData: Record<string, { officeName: string; primaryProvider: { name: string; phone: string }; backupProvider?: { name: string; phone: string } }> = {
  '+15125281144': {
    officeName: 'Cedar Park Main Office',
    primaryProvider: { name: 'Dr. Vincent A. Restivo, M.D.', phone: '+15125551001' },
    backupProvider: { name: 'Dr. Todd R. Shepler, M.D.', phone: '+15125551002' },
  },
  '+15125281155': {
    officeName: 'Georgetown Office',
    primaryProvider: { name: 'Dr. Chelsea Devitt, O.D., FAAO', phone: '+15125551004' },
    backupProvider: { name: 'Dr. Nathan E. Osterman, O.D.', phone: '+15125551003' },
  },
};

// Default fallback on-call info
const defaultOnCall = {
  officeName: 'On-Call Service',
  primaryProvider: { name: 'On-Call Provider', phone: '+15125551001' },
  backupProvider: { name: 'Backup Provider', phone: '+15125551002' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const callSid = formData.get('CallSid') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const callStatus = formData.get('CallStatus') as string;
    const digits = formData.get('Digits') as string;
    const speechResult = formData.get('SpeechResult') as string;

    console.log('Twilio Voice Webhook received:', { callSid, from, to, callStatus, digits, speechResult });

    // Get on-call information based on the called number
    const onCallInfo = mockOnCallData[to] || defaultOnCall;
    const primaryPhone = onCallInfo.primaryProvider.phone;
    const backupPhone = onCallInfo.backupProvider?.phone || primaryPhone;

    console.log('On-call info for', to, ':', {
      office: onCallInfo.officeName,
      primary: onCallInfo.primaryProvider.name,
      primaryPhone,
      backup: onCallInfo.backupProvider?.name,
      backupPhone
    });

    // Check if we have an existing conversation for this call
    const { data: existingConversation } = await supabase
      .from('twilio_conversations')
      .select('*')
      .eq('call_sid', callSid)
      .single();

    if (!existingConversation) {
      // New call - create conversation record with on-call info
      const { data: newConversation, error: insertError } = await supabase
        .from('twilio_conversations')
        .insert({
          call_sid: callSid,
          caller_phone: from,
          called_phone: to,
          conversation_type: 'voice',
          status: 'in_progress',
          metadata: { 
            initial_status: callStatus,
            office_name: onCallInfo.officeName,
            oncall_primary_name: onCallInfo.primaryProvider.name,
            oncall_primary_phone: primaryPhone,
            oncall_backup_name: onCallInfo.backupProvider?.name,
            oncall_backup_phone: backupPhone
          }
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating conversation:', insertError);
      }

      // Initial greeting TwiML
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling ${escapeXml(onCallInfo.officeName)}. This is the on-call answering service.</Say>
  <Gather input="speech dtmf" timeout="5" speechTimeout="auto" action="${supabaseUrl}/functions/v1/twilio-voice-webhook">
    <Say voice="alice">Please briefly describe the reason for your call, or press 1 for emergencies, 2 to speak with the on-call provider, or 3 to leave a message.</Say>
  </Gather>
  <Say voice="alice">I didn't receive any input. Goodbye.</Say>
</Response>`;

      return new Response(twiml, {
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      });
    }

    // Get on-call phones from conversation metadata
    const oncallPrimaryPhone = existingConversation.metadata?.oncall_primary_phone || primaryPhone;
    const oncallBackupPhone = existingConversation.metadata?.oncall_backup_phone || backupPhone;
    const oncallPrimaryName = existingConversation.metadata?.oncall_primary_name || 'the on-call provider';
    const officeName = existingConversation.metadata?.office_name || onCallInfo.officeName;

    // Handle user input
    let responseAction = 'continue';
    let twiml = '';

    if (digits === '1') {
      // Emergency - connect to on-call provider immediately
      console.log('Emergency transfer to primary:', oncallPrimaryPhone);
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This is an emergency. Connecting you to ${escapeXml(oncallPrimaryName)} now. Please hold.</Say>
  <Dial timeout="30" callerId="${to}">
    <Number>${oncallPrimaryPhone}</Number>
  </Dial>
  <Say voice="alice">${escapeXml(oncallPrimaryName)} is unavailable. Attempting to reach the backup provider.</Say>
  <Dial timeout="30" callerId="${to}">
    <Number>${oncallBackupPhone}</Number>
  </Dial>
  <Say voice="alice">All on-call providers are currently unavailable. Please call 911 for emergencies or leave a message after the beep.</Say>
  <Record maxLength="120" action="${supabaseUrl}/functions/v1/twilio-voice-webhook" />
</Response>`;
      responseAction = 'emergency_transfer';
    } else if (digits === '2') {
      // Transfer to on-call
      console.log('Regular transfer to primary:', oncallPrimaryPhone);
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while I connect you to ${escapeXml(oncallPrimaryName)}.</Say>
  <Dial timeout="30" callerId="${to}">
    <Number>${oncallPrimaryPhone}</Number>
  </Dial>
  <Say voice="alice">${escapeXml(oncallPrimaryName)} is currently unavailable. Would you like to try the backup provider? Press 1 for yes, or stay on the line to leave a message.</Say>
  <Gather input="dtmf" timeout="5" action="${supabaseUrl}/functions/v1/twilio-voice-webhook?action=backup">
  </Gather>
  <Say voice="alice">Please leave a message after the beep.</Say>
  <Record maxLength="120" action="${supabaseUrl}/functions/v1/twilio-voice-webhook" />
</Response>`;
      responseAction = 'transfer';
    } else if (digits === '3' || speechResult) {
      // Leave message or AI conversation
      const message = speechResult || 'Caller requested to leave a message';
      
      // Update conversation with transcript
      await supabase
        .from('twilio_conversations')
        .update({
          transcript: [...(existingConversation.transcript || []), { role: 'caller', content: message, timestamp: new Date().toISOString() }],
          metadata: { ...existingConversation.metadata, last_input: message }
        })
        .eq('id', existingConversation.id);

      // Use AI to generate response
      const aiResponse = await generateAIResponse(message, existingConversation);
      
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(aiResponse)}</Say>
  <Gather input="speech" timeout="5" speechTimeout="auto" action="${supabaseUrl}/functions/v1/twilio-voice-webhook">
    <Say voice="alice">Is there anything else I can help you with?</Say>
  </Gather>
  <Say voice="alice">Thank you for calling ${escapeXml(officeName)}. Goodbye.</Say>
</Response>`;
      responseAction = 'ai_response';
    } else {
      // Check for backup transfer action
      const url = new URL(req.url);
      const action = url.searchParams.get('action');
      
      if (action === 'backup' && digits === '1') {
        console.log('Backup transfer to:', oncallBackupPhone);
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you to the backup provider now.</Say>
  <Dial timeout="30" callerId="${to}">
    <Number>${oncallBackupPhone}</Number>
  </Dial>
  <Say voice="alice">The backup provider is also unavailable. Please leave a message after the beep.</Say>
  <Record maxLength="120" action="${supabaseUrl}/functions/v1/twilio-voice-webhook" />
</Response>`;
        responseAction = 'backup_transfer';
      } else {
        // Default response
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" timeout="5" speechTimeout="auto" action="${supabaseUrl}/functions/v1/twilio-voice-webhook">
    <Say voice="alice">I'm sorry, I didn't understand. Press 1 for emergencies, 2 to speak with the on-call provider, or 3 to leave a message.</Say>
  </Gather>
  <Say voice="alice">Goodbye.</Say>
</Response>`;
      }
    }

    // Log the action
    await supabase
      .from('notification_logs')
      .insert({
        notification_type: 'voice_interaction',
        recipient_phone: from,
        content: { action: responseAction, digits, speechResult, oncall_phone: oncallPrimaryPhone },
        status: 'completed',
        metadata: { call_sid: callSid, office: officeName }
      });

    return new Response(twiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });

  } catch (error) {
    console.error('Error in twilio-voice-webhook:', error);
    
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're experiencing technical difficulties. Please try again later or call the main office number.</Say>
</Response>`;

    return new Response(errorTwiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  }
});

async function generateAIResponse(userMessage: string, conversation: any): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return "I've noted your message and will have the on-call provider contact you shortly.";
  }

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a professional medical answering service AI for ${conversation.metadata?.office_name || 'a medical office'}. You help callers by:
1. Gathering basic information about their medical concern
2. Assessing urgency (but always recommend 911 for true emergencies)
3. Taking messages for the on-call provider
4. Providing general guidance while being clear you're not providing medical advice

Keep responses brief and clear (under 50 words) as they will be spoken via phone.
Never provide specific medical diagnoses or treatment recommendations.
Always encourage callers to seek emergency care if symptoms sound serious.`
          },
          ...(conversation.transcript || []).map((t: any) => ({
            role: t.role === 'caller' ? 'user' : 'assistant',
            content: t.content
          })),
          { role: 'user', content: userMessage }
        ],
      }),
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I've noted your message. A provider will contact you soon.";
  } catch (error) {
    console.error('AI response error:', error);
    return "I've recorded your message. The on-call provider will be notified.";
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
