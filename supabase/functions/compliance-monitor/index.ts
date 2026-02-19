import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertConfig {
  id: string;
  office_id: string;
  alert_type: string;
  threshold_percent: number;
  enabled: boolean;
  notify_email: string[] | null;
  notify_phone: string[] | null;
  check_interval_hours: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    // Authentication check - require admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's auth context
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: hasAdminRole } = await supabase
      .rpc('has_role', { _user_id: user.id, _role: 'admin' });

    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Compliance monitor triggered by admin user:', user.id);

    const bodySchema = z.object({
      office_id: z.string().max(100).optional(),
      hours_lookback: z.number().int().min(1).max(720).optional(),
    });

    let body: z.infer<typeof bodySchema> = {};
    try {
      const raw = await req.json();
      const parseResult = bodySchema.safeParse(raw);
      body = parseResult.success ? parseResult.data : {};
    } catch {
      // No body provided, use defaults
    }

    const hoursLookback = body.hours_lookback || 24;
    const checkDate = new Date();
    checkDate.setHours(checkDate.getHours() - hoursLookback);

    console.log(`Compliance monitor running. Looking back ${hoursLookback} hours from ${checkDate.toISOString()}`);

    // Get all enabled alert configs
    let configQuery = supabase
      .from('compliance_alert_configs')
      .select('*')
      .eq('enabled', true)
      .eq('alert_type', 'safety_message_rate');

    if (body.office_id) {
      configQuery = configQuery.eq('office_id', body.office_id);
    }

    const { data: configs, error: configError } = await configQuery;

    if (configError) {
      console.error('Error fetching configs:', configError);
      throw configError;
    }

    if (!configs || configs.length === 0) {
      console.log('No enabled alert configs found');
      return new Response(
        JSON.stringify({ message: 'No enabled alert configs found', alerts_triggered: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const alertsTriggered: string[] = [];

    for (const config of configs as AlertConfig[]) {
      console.log(`Checking safety message rate for office ${config.office_id}`);

      // Get calls in the lookback period
      const { data: calls, error: callsError } = await supabase
        .from('twilio_conversations')
        .select('id, metadata')
        .gte('created_at', checkDate.toISOString());

      if (callsError) {
        console.error(`Error fetching calls for office ${config.office_id}:`, callsError);
        continue;
      }

      if (!calls || calls.length === 0) {
        console.log(`No calls found for office ${config.office_id} in the last ${hoursLookback} hours`);
        continue;
      }

      // Calculate safety message delivery rate
      const totalCalls = calls.length;
      const safetyDelivered = calls.filter(
        (c: { metadata: { safety_message_delivered?: boolean } | null }) => 
          c.metadata?.safety_message_delivered === true
      ).length;
      const safetyRate = (safetyDelivered / totalCalls) * 100;

      console.log(`Office ${config.office_id}: ${safetyDelivered}/${totalCalls} calls (${safetyRate.toFixed(2)}%) had safety message delivered`);

      // Check if rate is below threshold
      if (safetyRate < config.threshold_percent) {
        console.log(`ALERT: Safety rate ${safetyRate.toFixed(2)}% is below threshold ${config.threshold_percent}%`);

        const alertMessage = `⚠️ COMPLIANCE ALERT: Safety message delivery rate has dropped to ${safetyRate.toFixed(1)}%, below the ${config.threshold_percent}% threshold. ${safetyDelivered} of ${totalCalls} calls in the past ${hoursLookback} hours had safety messages delivered.`;

        const notificationsSent: { type: string; to: string; status: string; sid?: string }[] = [];

        // Send SMS alerts
        if (config.notify_phone && config.notify_phone.length > 0 && twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
          for (const phone of config.notify_phone) {
            try {
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
              const formData = new URLSearchParams();
              formData.append('To', phone);
              formData.append('From', twilioPhoneNumber);
              formData.append('Body', alertMessage);

              const twilioResponse = await fetch(twilioUrl, {
                method: 'POST',
                headers: {
                  'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData,
              });

              const result = await twilioResponse.json();
              
              if (twilioResponse.ok) {
                console.log(`SMS sent to ${phone}: ${result.sid}`);
                notificationsSent.push({ type: 'sms', to: phone, status: 'sent', sid: result.sid });
              } else {
                console.error(`SMS failed to ${phone}:`, result);
                notificationsSent.push({ type: 'sms', to: phone, status: 'failed' });
              }
            } catch (smsError) {
              console.error(`Error sending SMS to ${phone}:`, smsError);
              notificationsSent.push({ type: 'sms', to: phone, status: 'error' });
            }
          }
        }

        // Log email notifications (would need Resend integration for actual sending)
        if (config.notify_email && config.notify_email.length > 0) {
          for (const email of config.notify_email) {
            console.log(`Email notification would be sent to ${email}`);
            notificationsSent.push({ type: 'email', to: email, status: 'logged' });
          }
        }

        // Record the alert in the database
        const { error: alertError } = await supabase
          .from('compliance_alerts')
          .insert({
            config_id: config.id,
            office_id: config.office_id,
            alert_type: config.alert_type,
            current_value: safetyRate,
            threshold_value: config.threshold_percent,
            message: alertMessage,
            notifications_sent: notificationsSent,
          });

        if (alertError) {
          console.error('Error recording alert:', alertError);
        } else {
          alertsTriggered.push(config.office_id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Compliance check complete. ${alertsTriggered.length} alert(s) triggered.`,
        alerts_triggered: alertsTriggered.length,
        offices_alerted: alertsTriggered,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in compliance-monitor:', error);
    return new Response(
      JSON.stringify({ error: 'Unable to process request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
