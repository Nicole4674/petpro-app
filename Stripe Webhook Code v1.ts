// =============================================================================
// PetPro Stripe Webhook Handler v1
// =============================================================================
// Purpose: Listen for Stripe subscription events and sync them to the
//          groomers table in Supabase so the app knows who is on which tier.
//
// Events handled:
//   - checkout.session.completed    -> new subscription created
//   - customer.subscription.updated -> tier changed, trial ending, status change
//   - customer.subscription.deleted -> subscription canceled
//   - invoice.payment_failed        -> card declined, mark past_due
//   - invoice.payment_succeeded     -> payment cleared, back to active
//
// Deploy: Supabase Dashboard -> Edge Functions -> "Deploy a new function" ->
//         "Via editor" -> Function name: stripe-webhook -> paste this code.
//
// Required secrets (add in Supabase Edge Functions -> Secrets):
//   STRIPE_SECRET_KEY       (starts with sk_test_ in sandbox, sk_live_ in prod)
//   STRIPE_WEBHOOK_SECRET   (starts with whsec_, given by Stripe when you
//                            register the webhook endpoint)
//
// Note: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically
//       by Supabase to every Edge Function - no need to set those.
//
// Date: April 22, 2026
// Task: #91
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

// ---------------------------------------------------------------------------
// Init Stripe + Supabase clients
// ---------------------------------------------------------------------------

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

// Required for Stripe signature verification in the Deno / edge runtime
const cryptoProvider = Stripe.createSubtleCryptoProvider()

// Service-role client = full database access, bypasses Row Level Security.
// Safe to use here because this function only runs on Supabase's servers
// and is not exposed to browsers.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// ---------------------------------------------------------------------------
// Price ID -> Tier mapping (LIVE)
// Swapped from sandbox IDs on launch. Sandbox IDs archived in git history.
// ---------------------------------------------------------------------------

const PRICE_TO_TIER: Record<string, string> = {
  'price_1TP34TQ63eOdno0Tewysfzrl': 'basic',     // $70
  'price_1TP34PQ63eOdno0T329riWag': 'pro',       // $129
  'price_1TP34TQ63eOdno0TFn95AcPS': 'pro_plus',  // $199
  'price_1TP34PQ63eOdno0TCNtSNRyv': 'growing',   // $399
}

// ════════════ Per-Tier Monthly AI Token Allocation ════════════
// How many PetPro AI tokens each plan gets per billing cycle.
// Updated automatically on subscribe + plan-change via the helper below.
const TIER_TO_MONTHLY_TOKENS: Record<string, number> = {
  'basic':    500,   // light user
  'pro':      800,   // regular daily AI use
  'pro_plus': 1000,  // power user
  'growing':  3000,  // multi-staff facility
}

// Helper — sets the groomer's monthly token allocation based on their plan tier.
// Creates the balance row if it doesn't exist; updates monthly_total + resets
// monthly_remaining to the new total (so an upgrade unlocks the bigger bucket
// immediately instead of waiting until the next billing period).
async function syncTokenAllocationForTier(groomerId: string, tier: string | null) {
  if (!tier) return
  const monthlyTokens = TIER_TO_MONTHLY_TOKENS[tier]
  if (monthlyTokens === undefined) {
    console.warn(`[token-tier-sync] Unknown tier "${tier}" — skipping token allocation update`)
    return
  }

  const { data: existing } = await supabase
    .from('groomer_token_balance')
    .select('groomer_id, monthly_tokens_total')
    .eq('groomer_id', groomerId)
    .maybeSingle()

  if (!existing) {
    // First-time subscriber — create their balance row with the right allocation
    await supabase.from('groomer_token_balance').insert({
      groomer_id: groomerId,
      monthly_tokens_remaining: monthlyTokens,
      monthly_tokens_total: monthlyTokens,
      monthly_period_start: new Date().toISOString().slice(0, 10),
    })
    console.log(`[token-tier-sync] Created balance for ${groomerId}: ${monthlyTokens} tokens (${tier})`)
  } else if (existing.monthly_tokens_total !== monthlyTokens) {
    // Existing subscriber whose tier changed — update allocation + refill bucket
    // to the new total. Don't take tokens away if they downgrade mid-cycle.
    await supabase
      .from('groomer_token_balance')
      .update({
        monthly_tokens_total: monthlyTokens,
        monthly_tokens_remaining: monthlyTokens,
        monthly_period_start: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq('groomer_id', groomerId)
    console.log(`[token-tier-sync] Updated ${groomerId} to ${monthlyTokens} tokens (${tier})`)
  }
}

// Helper: convert Stripe's unix-second timestamp to an ISO string (or null)
function tsToIso(ts: number | null | undefined): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // 1. Verify this request actually came from Stripe (not a bad actor)
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      cryptoProvider,
    )
  } catch (err) {
    console.error('Signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  console.log(`Received event: ${event.type} (${event.id})`)

  // 2. Route the event to the right handler
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      }
      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      }
      case 'invoice.payment_failed': {
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      }
      case 'invoice.payment_succeeded': {
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      }
      default:
        // We don't care about this event type - tell Stripe we got it so it
        // doesn't keep retrying.
        console.log(`Ignoring event type: ${event.type}`)
    }
  } catch (err) {
    console.error('Handler error:', err)
    return new Response(`Handler Error: ${err.message}`, { status: 500 })
  }

  // 3. Acknowledge receipt so Stripe stops retrying
  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
})

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

// NEW SUBSCRIPTION: fires when a groomer finishes Stripe checkout.
// We use client_reference_id (passed in the Subscribe URL) to know which
// groomer row to update.
// ════════════ TOKEN PACK PAYMENT LINK MAPPING ════════════
// Maps each Stripe Payment Link URL suffix → token pack size.
// Add a new line here whenever a new pack's Stripe Payment Link is created.
//
// To add a new pack:
//   1. Create the Stripe Payment Link in dashboard
//   2. Copy the URL (e.g. https://buy.stripe.com/abc123xyz)
//   3. Add an entry below: 'abc123xyz': <token count>
//   4. Redeploy this webhook
const PACK_LINK_TO_TOKENS: Record<string, number> = {
  // Production packs
  'dRm14p5N32CKboj6hB7ok05': 250,
  '6oUdRb5N3b9g4ZVbBV7ok06': 500,
  '00w8wR3EVa5c1NJfSb7ok07': 1000,
}

// Helper — extract the URL suffix from a payment_link string returned by Stripe.
// Stripe returns either the URL ('https://buy.stripe.com/abc123') or the
// plink_ ID — we need to handle both. Easiest: fetch the link and read its url.
async function getPackSizeFromSession(session: Stripe.Checkout.Session): Promise<number | null> {
  const paymentLinkRef = session.payment_link
  if (!paymentLinkRef) return null

  const linkId = typeof paymentLinkRef === 'string' ? paymentLinkRef : paymentLinkRef.id
  try {
    const link = await stripe.paymentLinks.retrieve(linkId)
    if (!link.url) return null
    // Extract the suffix after the last slash
    const suffix = link.url.split('/').pop() || ''
    return PACK_LINK_TO_TOKENS[suffix] ?? null
  } catch (err) {
    console.error('[token-pack] Could not fetch payment link', linkId, err)
    return null
  }
}

// ════════════ TOKEN PACK CHECKOUT HANDLER ════════════
// Runs when a groomer pays for a top-up token pack. Adds tokens to their
// Extra balance via the add_topup_tokens RPC + logs the purchase.
async function handleTokenPackCheckout(
  session: Stripe.Checkout.Session,
  groomerId: string,
  packSize: number
) {
  const amountCents = session.amount_total ?? 0
  const sessionId = session.id
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null

  // Idempotency check — if we already processed this session, skip
  const { data: existing } = await supabase
    .from('token_purchases')
    .select('id, status')
    .eq('stripe_session_id', sessionId)
    .maybeSingle()

  if (existing && existing.status === 'completed') {
    console.log(`[token-pack] Session ${sessionId} already completed — skipping (idempotent)`)
    return
  }

  // Insert (or update) the purchase record
  if (!existing) {
    const { error: insertErr } = await supabase
      .from('token_purchases')
      .insert({
        groomer_id: groomerId,
        pack_size: packSize,
        amount_cents: amountCents,
        stripe_session_id: sessionId,
        stripe_payment_intent_id: paymentIntentId,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
    if (insertErr) {
      console.error('[token-pack] Insert purchase failed:', insertErr)
      throw insertErr
    }
  } else {
    await supabase
      .from('token_purchases')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq('id', existing.id)
  }

  // Credit the tokens to the groomer's Extra balance via the RPC
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('add_topup_tokens', {
    p_groomer_id: groomerId,
    p_token_count: packSize,
  })

  if (rpcErr) {
    console.error('[token-pack] add_topup_tokens RPC failed:', rpcErr)
    throw rpcErr
  }

  console.log(`[token-pack] Added ${packSize} tokens to groomer ${groomerId}. New balance:`, rpcResult)
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const groomerId = session.client_reference_id
  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id

  if (!groomerId) {
    console.warn('checkout.session.completed had no client_reference_id. Cannot match to a groomer.')
    return
  }

  // ════════════ TOKEN PACK ROUTING ════════════
  // Before treating this as a subscription, check if it's actually a one-time
  // token pack purchase (matches one of our PACK_LINK_TO_TOKENS entries).
  const packSize = await getPackSizeFromSession(session)
  if (packSize !== null) {
    await handleTokenPackCheckout(session, groomerId, packSize)
    return
  }
  // ════════════ End token pack routing ════════════

  if (!subscriptionId) {
    console.warn('No subscription on this session (one-time payment, not a token pack). Skipping.')
    return
  }

  // Fetch full subscription details so we know price, status, trial end
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const priceId = subscription.items.data[0]?.price?.id
  const tier = priceId ? PRICE_TO_TIER[priceId] ?? null : null

  const { error } = await supabase
    .from('groomers')
    .update({
      subscription_tier: tier,
      subscription_status: subscription.status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      trial_ends_at: tsToIso(subscription.trial_end),
      current_period_end: tsToIso(subscription.current_period_end),
    })
    .eq('id', groomerId)

  if (error) throw error
  console.log(`Groomer ${groomerId} subscribed to ${tier} (status: ${subscription.status})`)

  // ─── WELCOME EMAIL — fires ONCE on first subscription ───────────────
  // Sent right after the groomer's first successful checkout. Tells them
  // exactly where to log in (app.trypetpro.com/portal/login) so they
  // don't get stuck looking for the sign-in button on the marketing site.
  // We don't fail the webhook if email errors — sub is more important
  // than welcome email; we just log and move on.
  try {
    await sendWelcomeEmail(groomerId, tier, subscription.status)
  } catch (emailErr) {
    console.error('[stripe-webhook] Welcome email failed (non-fatal):', emailErr)
  }

  // Sync token allocation to match the new tier
  try {
    await syncTokenAllocationForTier(groomerId, tier)
  } catch (tokenErr) {
    console.error('[stripe-webhook] Token allocation sync failed (non-fatal):', tokenErr)
  }
}

// ─── WELCOME EMAIL HELPER ──────────────────────────────────────────────
// Pulls the groomer's email + name from the database, then sends a clean
// HTML welcome via Resend with a giant "Sign in to PetPro" button.
async function sendWelcomeEmail(groomerId: string, tier: string | null, status: string) {
  // 1. Look up groomer email + name
  const { data: groomer } = await supabase
    .from('groomers')
    .select('email, full_name, business_name')
    .eq('id', groomerId)
    .maybeSingle()

  if (!groomer || !groomer.email) {
    console.warn('[welcome-email] No email for groomer', groomerId, '— skipping')
    return
  }

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.warn('[welcome-email] RESEND_API_KEY not configured — skipping')
    return
  }

  const firstName = (groomer.full_name || '').split(' ')[0] || 'there'
  const tierLabel = tier
    ? tier.charAt(0).toUpperCase() + tier.slice(1).replace('_', ' ')
    : 'PetPro'
  const isTrialing = status === 'trialing'
  const subject = isTrialing
    ? `Welcome to PetPro — your ${tierLabel} trial is active`
    : `Welcome to PetPro — your ${tierLabel} subscription is active`

  const loginUrl = 'https://app.trypetpro.com/login?welcome=1'

  const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">

        <tr><td style="padding:32px 28px 16px;background:#7c3aed;color:#fff;text-align:center;">
          <div style="font-size:48px;line-height:1;">🐾</div>
          <div style="font-size:22px;font-weight:800;margin-top:10px;">Welcome to PetPro!</div>
          <div style="font-size:13px;opacity:0.95;margin-top:4px;">${escapeHtmlSafe(tierLabel)} ${isTrialing ? 'trial' : 'plan'} — you're all set</div>
        </td></tr>

        <tr><td style="padding:24px 28px;">
          <div style="font-size:16px;color:#1f2937;margin-bottom:12px;">Hi ${escapeHtmlSafe(firstName)},</div>
          <div style="font-size:14px;color:#4b5563;line-height:1.6;margin-bottom:20px;">
            Your PetPro account is active and ready. Here's how to log in:
          </div>

          <!-- LOGIN CREDENTIALS BOX — explicit so groomers know exactly what to use -->
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
            <div style="font-size:13px;color:#5b21b6;line-height:1.6;">
              <div style="margin-bottom:8px;">
                <span style="font-weight:700;">📧 Login email:</span><br/>
                <span style="font-size:15px;font-weight:800;color:#111827;word-break:break-all;">${escapeHtmlSafe(groomer.email)}</span>
              </div>
              <div>
                <span style="font-weight:700;">🔑 Password:</span> the one you created at checkout.
              </div>
            </div>
          </div>

          <div style="text-align:center;margin:24px 0;">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px;box-shadow:0 2px 6px rgba(124,58,237,0.3);">
              Sign in to PetPro →
            </a>
          </div>

          <div style="font-size:13px;color:#6b7280;text-align:center;margin-top:16px;">
            Or copy &amp; paste this link into your browser:<br/>
            <a href="${loginUrl}" style="color:#7c3aed;word-break:break-all;">${loginUrl}</a>
          </div>

          <!-- FALLBACK NOTICE — covers the rare case where auto-confirm fails -->
          <div style="margin-top:20px;padding:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#92400e;line-height:1.5;">
            <strong>📬 Got another email asking you to "confirm your email"?</strong> Click the link in THAT email FIRST to activate your account, then come back here to sign in.
          </div>

          <div style="margin-top:24px;padding:14px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;font-size:13px;color:#5b21b6;line-height:1.5;">
            <strong>Quick start:</strong>
            <ol style="margin:8px 0 0;padding-left:20px;">
              <li>Sign in with the same email you used at checkout</li>
              <li>Set your shop name + hours in Shop Settings</li>
              <li>Add your first client and pet</li>
              <li>Book your first appointment in the calendar</li>
            </ol>
          </div>

          ${isTrialing ? `
          <div style="margin-top:18px;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e;">
            ⏰ <strong>Heads-up:</strong> You're in a free trial right now. Your card will be charged automatically when the trial ends — you can cancel anytime from your Account page.
          </div>` : ''}
        </td></tr>

        <tr><td style="padding:14px 28px 22px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          <div style="font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:6px;">
            💌 Don't see our emails? Check your spam folder and mark us as <strong>"Not Spam"</strong> so future updates land in your inbox.
          </div>
          <div style="font-size:11px;color:#9ca3af;line-height:1.5;">
            Need help? Reply to this email or visit trypetpro.com.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'PetPro <nicole@trypetpro.com>',
      to: [groomer.email],
      subject,
      html,
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`Resend returned ${resp.status}: ${errText}`)
  }
  console.log('[welcome-email] Sent to', groomer.email)
}

// HTML escape for safety (avoid XSS in welcome email)
function escapeHtmlSafe(s: string): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// TIER CHANGE / TRIAL END / STATUS CHANGE
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id
  const priceId = subscription.items.data[0]?.price?.id
  const tier = priceId ? PRICE_TO_TIER[priceId] ?? null : null

  const { error } = await supabase
    .from('groomers')
    .update({
      subscription_tier: tier,
      subscription_status: subscription.status,
      stripe_subscription_id: subscription.id,
      trial_ends_at: tsToIso(subscription.trial_end),
      current_period_end: tsToIso(subscription.current_period_end),
    })
    .eq('stripe_customer_id', customerId)

  if (error) throw error
  console.log(`Subscription updated for customer ${customerId}: ${tier} / ${subscription.status}`)

  // Sync token allocation to match the new tier (handles plan upgrades + downgrades).
  // Look up the groomer_id by customer ID since this handler doesn't get it directly.
  if (tier) {
    try {
      const { data: groomerRow } = await supabase
        .from('groomers')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      if (groomerRow?.id) {
        await syncTokenAllocationForTier(groomerRow.id, tier)
      }
    } catch (tokenErr) {
      console.error('[stripe-webhook] Token allocation sync failed on update (non-fatal):', tokenErr)
    }
  }
}

// CANCELLATION
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id

  const { error } = await supabase
    .from('groomers')
    .update({
      subscription_tier: null,
      subscription_status: 'canceled',
      current_period_end: tsToIso(subscription.current_period_end),
    })
    .eq('stripe_customer_id', customerId)

  if (error) throw error
  console.log(`Subscription canceled for customer ${customerId}`)
}

// CARD DECLINED
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return

  const { error } = await supabase
    .from('groomers')
    .update({ subscription_status: 'past_due' })
    .eq('stripe_customer_id', customerId)

  if (error) throw error
  console.log(`Payment failed for customer ${customerId}, marked past_due`)
}

// PAYMENT CLEARED (e.g. after a past_due groomer updates their card)
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return

  // Only flip back to active if currently past_due - don't overwrite trialing etc.
  const { error } = await supabase
    .from('groomers')
    .update({ subscription_status: 'active' })
    .eq('stripe_customer_id', customerId)
    .eq('subscription_status', 'past_due')

  if (error) throw error
}
