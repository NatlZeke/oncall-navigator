import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertConfig {
  id: string;
  webhook_name: string;
  failure_threshold_percent: number;
  check_window_minutes: number;
  min_calls_for_alert: number;
  notify_email: string[] | null;
  notify_phone: string[] | null;
  enabled: boolean;
  last_alert_at: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch enabled alert configs
    const { data: configs, error: configError } = await supabase
      .from("webhook_alert_configs")
      .select("*")
      .eq("enabled", true);

    if (configError) {
      console.error("Error fetching alert configs:", configError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch alert configs" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const alerts: { webhook: string; failureRate: number; message: string }[] = [];

    for (const config of configs as AlertConfig[]) {
      const windowStart = new Date(Date.now() - config.check_window_minutes * 60 * 1000).toISOString();

      // Get counts within the window
      const { data: logs, error: logsError } = await supabase
        .from("webhook_health_logs")
        .select("status")
        .eq("webhook_name", config.webhook_name)
        .gte("created_at", windowStart);

      if (logsError) {
        console.error(`Error fetching logs for ${config.webhook_name}:`, logsError);
        continue;
      }

      if (!logs || logs.length < config.min_calls_for_alert) {
        console.log(`${config.webhook_name}: Not enough calls (${logs?.length || 0}/${config.min_calls_for_alert})`);
        continue;
      }

      const totalCalls = logs.length;
      const failedCalls = logs.filter((l) => l.status !== "success").length;
      const failureRate = (failedCalls / totalCalls) * 100;

      console.log(`${config.webhook_name}: ${failedCalls}/${totalCalls} failures (${failureRate.toFixed(1)}%)`);

      if (failureRate >= config.failure_threshold_percent) {
        // Check if we should suppress alert (cooldown: 30 min since last alert)
        if (config.last_alert_at) {
          const lastAlertTime = new Date(config.last_alert_at).getTime();
          const cooldownMs = 30 * 60 * 1000; // 30 minutes
          if (Date.now() - lastAlertTime < cooldownMs) {
            console.log(`${config.webhook_name}: Alert suppressed (cooldown)`);
            continue;
          }
        }

        const alertMessage = `⚠️ WEBHOOK ALERT: ${config.webhook_name} has ${failureRate.toFixed(1)}% failure rate (${failedCalls}/${totalCalls} calls) in the last ${config.check_window_minutes} minutes.`;
        
        alerts.push({
          webhook: config.webhook_name,
          failureRate,
          message: alertMessage,
        });

        // Send SMS alerts
        if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber && config.notify_phone?.length) {
          for (const phone of config.notify_phone) {
            try {
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
              const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
              
              await fetch(twilioUrl, {
                method: "POST",
                headers: {
                  Authorization: `Basic ${auth}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  From: twilioPhoneNumber,
                  To: phone,
                  Body: alertMessage,
                }),
              });
              
              console.log(`SMS alert sent to ${phone}`);
            } catch (smsError) {
              console.error(`Failed to send SMS to ${phone}:`, smsError);
            }
          }
        }

        // Log email notifications (would need Resend integration)
        if (config.notify_email?.length) {
          console.log(`Email alerts would be sent to: ${config.notify_email.join(", ")}`);
          // TODO: Integrate with Resend for email alerts
        }

        // Update last_alert_at
        await supabase
          .from("webhook_alert_configs")
          .update({ last_alert_at: new Date().toISOString() })
          .eq("id", config.id);
      }
    }

    // Log the monitoring run itself
    await supabase.from("webhook_health_logs").insert({
      webhook_name: "webhook-monitor",
      status: "success",
      error_details: { alerts_triggered: alerts.length, configs_checked: configs.length },
      response_time_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({
        success: true,
        configs_checked: configs.length,
        alerts_triggered: alerts.length,
        alerts,
        runtime_ms: Date.now() - startTime,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Webhook monitor error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
