import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Verify user JWT ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Unauthorized", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return jsonError("Unauthorized", 401);

    // ── 2. Parse body ───────────────────────────────────────────────────────
    const { paystackRef, planType, planName, amount } = await req.json();
    if (!paystackRef || !planType || !amount) {
      return jsonError("Missing required fields", 400);
    }

    // ── 3. Verify with Paystack ─────────────────────────────────────────────
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecret) return jsonError("Server misconfiguration", 500);

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${paystackRef}`,
      { headers: { Authorization: `Bearer ${paystackSecret}` } }
    );

    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data?.status !== "success") {
      return jsonError("Payment verification failed", 402);
    }

    const paidAmount = verifyData.data.amount; // in kobo
    if (paidAmount < amount * 100) {
      return jsonError("Payment amount mismatch", 402);
    }

    // ── 4. Save order to DB ─────────────────────────────────────────────────
    const { data: order, error: insertError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        paystack_ref: paystackRef,
        plan_type: planType,
        plan_name: planName,
        amount,
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      // Check if it's a duplicate (already confirmed)
      if (insertError.code === "23505") {
        return jsonSuccess({ message: "Order already confirmed", orderId: null });
      }
      return jsonError("Failed to save order: " + insertError.message, 500);
    }

    return jsonSuccess({ message: "Payment confirmed", orderId: order.id });

  } catch (err) {
    console.error("confirm-payment error:", err);
    return jsonError("Internal server error", 500);
  }
});

function jsonSuccess(data: object) {
  return new Response(JSON.stringify({ success: true, ...data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}