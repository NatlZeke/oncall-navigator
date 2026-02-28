import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { calledPhone } = await req.json();

    if (!calledPhone || typeof calledPhone !== "string") {
      return new Response(
        JSON.stringify({ error: "calledPhone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up office by phone number
    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("id, name, spanish_enabled, use_conversation_relay")
      .contains("phone_numbers", [calledPhone])
      .eq("is_active", true)
      .limit(1)
      .single();

    if (officeError || !office) {
      console.error(`No office found for phone ${calledPhone}:`, officeError);
      return new Response(
        JSON.stringify({ error: "No office found", details: officeError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up today's on-call assignment
    const today = new Date().toISOString().split("T")[0];
    const { data: assignment } = await supabase
      .from("oncall_assignments")
      .select("*")
      .eq("office_id", office.id)
      .eq("assignment_date", today)
      .eq("status", "active")
      .single();

    const onCallProvider = assignment
      ? {
          name: assignment.provider_name,
          phone: assignment.provider_phone.replace(/[^\d+]/g, "").startsWith("+")
            ? assignment.provider_phone.replace(/[^\d+]/g, "")
            : "+1" + assignment.provider_phone.replace(/\D/g, ""),
        }
      : { name: "On-Call Provider", phone: "+15125551001" };

    // Check routing type
    let requiresPatientDoctorConfirmation = false;
    if (assignment?.provider_user_id) {
      const { data: routingConfig } = await supabase
        .from("provider_routing_config")
        .select("routing_type")
        .eq("provider_user_id", assignment.provider_user_id)
        .eq("is_active", true)
        .single();
      requiresPatientDoctorConfirmation =
        routingConfig?.routing_type === "own_patients_only";
    }

    // Build provider directory
    const { data: configs } = await supabase
      .from("provider_routing_config")
      .select("*")
      .eq("office_id", office.id)
      .eq("is_active", true);

    const providerDirectory: Record<string, { name: string; phone: string }> = {};
    if (configs) {
      for (const config of configs) {
        const formattedPhone = config.provider_phone
          .replace(/[^\d+]/g, "")
          .startsWith("+")
          ? config.provider_phone.replace(/[^\d+]/g, "")
          : "+1" + config.provider_phone.replace(/\D/g, "");
        const provider = { name: config.provider_name, phone: formattedPhone };
        const keywords: string[] =
          config.match_keywords ||
          config.provider_name.toLowerCase().split(/\s+/);
        for (const keyword of keywords) {
          providerDirectory[keyword.toLowerCase()] = provider;
        }
      }
    }

    return new Response(
      JSON.stringify({
        officeId: office.id,
        officeName: office.name,
        spanishEnabled: office.spanish_enabled ?? false,
        onCallProvider,
        providerDirectory,
        requiresPatientDoctorConfirmation,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Failed to get on-call info:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
