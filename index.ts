// send-welcome-email/index.ts
// Sends a welcome email after signup via Resend (or Supabase built-in SMTP)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, name } = await req.json();
    const displayName = name || email.split('@')[0];

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const FROM_EMAIL     = Deno.env.get('FROM_EMAIL') || 'hello@sitecraft.ng';

    if (!RESEND_API_KEY) {
      // Resend not configured — log and return success silently
      console.log(`[welcome-email] Would send to ${email} — RESEND_API_KEY not set`);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'DM Sans',Arial,sans-serif;color:#f0eff8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;padding:40px 20px;">
    <tr><td>
      <!-- Logo -->
      <div style="text-align:center;margin-bottom:32px;">
        <span style="font-size:1.6rem;font-weight:800;letter-spacing:-0.02em;">Site<span style="color:#f0c040;">Craft</span></span>
      </div>
      <!-- Card -->
      <div style="background:#1a1a26;border:1px solid #2a2a3d;padding:40px 36px;border-radius:4px;">
        <h1 style="font-size:1.5rem;font-weight:800;margin-bottom:16px;color:#f0eff8;">
          Welcome, ${displayName}! 🎉
        </h1>
        <p style="color:#7a798a;line-height:1.7;margin-bottom:20px;">
          Your SiteCraft account is ready. You're one step closer to having a professional landing page for your business — built by AI in minutes.
        </p>
        <p style="color:#7a798a;line-height:1.7;margin-bottom:28px;">Here's how to get started:</p>
        <div style="border-left:3px solid #f0c040;padding-left:16px;margin-bottom:20px;">
          <p style="margin:0 0 8px;font-weight:700;color:#f0eff8;">1. Pick your plan</p>
          <p style="margin:0;color:#7a798a;font-size:0.875rem;">Choose from Portfolio (₦5,000) up to Custom (₦50,000). Pay once, own forever.</p>
        </div>
        <div style="border-left:3px solid #7c5cfc;padding-left:16px;margin-bottom:20px;">
          <p style="margin:0 0 8px;font-weight:700;color:#f0eff8;">2. Describe your business</p>
          <p style="margin:0;color:#7a798a;font-size:0.875rem;">Tell our AI what you do, who you serve, and how you want your page to look.</p>
        </div>
        <div style="border-left:3px solid #3ecf8e;padding-left:16px;margin-bottom:32px;">
          <p style="margin:0 0 8px;font-weight:700;color:#f0eff8;">3. Download & launch</p>
          <p style="margin:0;color:#7a798a;font-size:0.875rem;">Get a complete HTML file. Host it anywhere — no subscriptions, no developer needed.</p>
        </div>
        <!-- CTA -->
        <div style="text-align:center;">
          <a href="https://sitecraft.ng" style="display:inline-block;background:#f0c040;color:#000;padding:14px 36px;font-weight:800;font-size:0.95rem;text-decoration:none;border-radius:3px;letter-spacing:0.05em;text-transform:uppercase;">
            Build My Landing Page →
          </a>
        </div>
      </div>
      <!-- Footer -->
      <p style="text-align:center;color:#7a798a;font-size:0.75rem;margin-top:28px;line-height:1.6;">
        © ${new Date().getFullYear()} Segun-Daniels Software Consulting · <a href="https://sitecraft.ng" style="color:#7a798a;">sitecraft.ng</a><br>
        You received this because you signed up at SiteCraft.
        <a href="https://sitecraft.ng/unsubscribe?email=${email}" style="color:#7a798a;">Unsubscribe</a>
      </p>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `SiteCraft <${FROM_EMAIL}>`,
        to:      [email],
        subject: `Welcome to SiteCraft, ${displayName}! 🚀`,
        html
      })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[welcome-email] Resend error:', err);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[welcome-email] Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200, // return 200 so client doesn't error
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});