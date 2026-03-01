import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Verify user JWT ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Unauthorized: missing token", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonError("Unauthorized: invalid token", 401);
    }

    // ── 2. Parse request body ───────────────────────────────────────────────
    const body = await req.json();
    const { paystackRef, userData } = body;

    if (!paystackRef || !userData) {
      return jsonError("Missing paystackRef or userData", 400);
    }

    // ── 3. Verify order exists and is paid ──────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("paystack_ref", paystackRef)
      .eq("user_id", user.id)
      .eq("status", "paid")
      .single();

    if (orderError || !order) {
      return jsonError("Order not found or not paid. Please complete payment first.", 403);
    }

    // ── 4. Check if page already generated for this order ───────────────────
    const { data: existing } = await supabase
      .from("generated_pages")
      .select("id, html")
      .eq("order_id", order.id)
      .single();

    if (existing) {
      // Return cached result
      return jsonSuccess({ html: existing.html, cached: true });
    }

    // ── 5. Call Anthropic API ───────────────────────────────────────────────
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonError("Server misconfiguration: missing API key", 500);
    }

    const prompt = buildPrompt(userData);

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      const msg = err?.error?.message || `Anthropic API error ${anthropicRes.status}`;
      return jsonError(msg, 502);
    }

    const anthropicData = await anthropicRes.json();
    let html = anthropicData.content
      .map((b: { type: string; text?: string }) => b.type === "text" ? b.text : "")
      .join("")
      .trim();

    // Strip markdown fences if present
    html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    if (!html.startsWith("<!DOCTYPE") && !html.startsWith("<html")) {
      return jsonError("Unexpected output from AI. Please try again.", 500);
    }

    // ── 6. Save generated page to DB ────────────────────────────────────────
    const { error: saveError } = await supabase
      .from("generated_pages")
      .insert({
        user_id: user.id,
        order_id: order.id,
        html,
        business_name: userData.name,
        page_type: userData.type,
      });

    if (saveError) {
      console.error("Failed to save page:", saveError.message);
      // Still return the HTML even if save fails
    }

    // ── 7. Mark order as generated ──────────────────────────────────────────
    await supabase
      .from("orders")
      .update({ status: "generated" })
      .eq("id", order.id);

    return jsonSuccess({ html, cached: false });

  } catch (err) {
    console.error("Edge function error:", err);
    return jsonError("Internal server error", 500);
  }
});

// ─────── HELPERS ───────────────────────────────────────────────────────────

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

function buildPrompt(data: Record<string, unknown>): string {
  const sections = Array.isArray(data.sections) && data.sections.length
    ? (data.sections as string[]).join(", ")
    : "Hero, Features, About, Testimonials, CTA, Footer";

  return `You are an expert web designer and conversion specialist. Create a stunning, high-converting landing page as a complete single HTML file.

## BRIEF
- Type: ${data.type} landing page
- Brand/Product: ${data.name}
- Tagline: ${data.tagline || "create one that fits"}
- Description: ${data.description || "A great " + data.type}
- Target Audience: ${data.audience || "general consumers"}
- Primary CTA: "${data.cta || "Get Started"}"
- Brand Color: ${data.color}
- Design Style: ${data.style}
- Phone/WhatsApp: ${data.phone || "not provided"}
- Email: ${data.email || "not provided"}
- Sections: ${sections}
- Extra requests: ${data.extras || "none"}

## REQUIREMENTS
- Single HTML file, all CSS and JS embedded
- Use ${data.color} as the dominant brand color throughout
- ${data.style} aesthetic — commit to it fully
- Google Fonts via @import — choose a distinctive pair that fits the style
- Fully mobile responsive
- Sticky nav with blur backdrop
- Smooth scroll-reveal animations using Intersection Observer
- Hover states on all interactive elements

## CONTENT RULES
- Write REAL, persuasive marketing copy — no placeholder text, no Lorem Ipsum
- Base all copy on the description — make it specific and compelling
- Invent plausible testimonials, feature names, benefit statements
- Use the CTA text "${data.cta || "Get Started"}" on all buttons
- Include contact info: ${data.phone ? "📱 " + data.phone : ""} ${data.email ? "✉️ " + data.email : ""}

## CODE RULES
- No broken <img> tags — use CSS gradients, SVG, shapes, or emoji for visuals
- Clean semantic HTML5, CSS Grid + Flexbox
- No external libraries except Google Fonts
- Animations: transform/opacity only for performance

Return ONLY the complete HTML. No explanation. No markdown. No backticks. Start with <!DOCTYPE html>.`;
}