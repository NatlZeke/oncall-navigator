import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
};

// Validate Twilio webhook signature using HMAC-SHA1
async function validateTwilioSignature(
  req: Request,
  formData: FormData,
  authToken: string
): Promise<boolean> {
  const signature = req.headers.get('x-twilio-signature');
  if (!signature) {
    console.error('Missing X-Twilio-Signature header');
    return false;
  }

  const url = new URL(req.url);
  let fullUrl = url.toString();

  const params: [string, string][] = [];
  formData.forEach((value, key) => {
    params.push([key, value.toString()]);
  });
  params.sort((a, b) => a[0].localeCompare(b[0]));
  
  let data = fullUrl;
  for (const [key, value] of params) {
    data += key + value;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const calculatedSignature = base64Encode(signatureBytes);

  const isValid = signature === calculatedSignature;
  if (!isValid) {
    console.error('Invalid Twilio signature', { received: signature, calculated: calculatedSignature });
  }
  
  return isValid;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!twilioAuthToken) {
      console.error('TWILIO_AUTH_TOKEN not configured');
      return new Response('Server configuration error', { status: 500, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Clone request to read body twice
    const clonedReq = req.clone();
    const formDataForValidation = await clonedReq.formData();
    
    // Validate Twilio signature
    const isValid = await validateTwilioSignature(req, formDataForValidation, twilioAuthToken);
    if (!isValid) {
      console.error('Rejected request with invalid Twilio signature');
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    const formData = await req.formData();
    const messageSid = formData.get('MessageSid') as string;
    const messageStatus = formData.get('MessageStatus') as string;
    const errorCode = formData.get('ErrorCode') as string | null;
    const errorMessage = formData.get('ErrorMessage') as string | null;

    console.log('Twilio Status Webhook received:', { 
      messageSid, 
      messageStatus, 
      errorCode, 
      errorMessage 
    });

    // Map Twilio status to our status
    let status = messageStatus;
    if (['delivered', 'sent'].includes(messageStatus)) {
      status = 'delivered';
    } else if (['failed', 'undelivered'].includes(messageStatus)) {
      status = 'failed';
    } else if (['queued', 'sending', 'accepted'].includes(messageStatus)) {
      status = 'pending';
    }

    // Update the notification log with the delivery status
    const { error: updateError } = await supabase
      .from('notification_logs')
      .update({ 
        status,
        metadata: {
          delivery_status: messageStatus,
          error_code: errorCode,
          error_message: errorMessage,
          status_updated_at: new Date().toISOString()
        }
      })
      .eq('twilio_sid', messageSid);

    if (updateError) {
      console.error('Error updating notification status:', updateError);
    } else {
      console.log('Notification status updated:', { messageSid, status });
    }

    // Return 200 OK to Twilio
    return new Response('OK', {
      status: 200,
      headers: corsHeaders,
    });

  } catch (error) {
    console.error('Error in twilio-status-webhook:', error);
    return new Response('Error', {
      status: 500,
      headers: corsHeaders,
    });
  }
});
