// =============================================================================
// auto-cancel-unpaid-bookings
// =============================================================================
// Scheduled function — runs every 5 min via pg_cron.
//
// Finds pending bookings on shops with `require_prepay_to_book = true` that
// were created >15 minutes ago and never paid. Cancels them so the slot
// frees up for someone else.
//
// Logic:
//   1. Find groomers (shops) with require_prepay_to_book = true
//   2. For each shop, find pending appointments older than 15 min
//   3. Update those to status = 'cancelled' with a note explaining why
//   4. Return count of cancellations
//
// Note: if a client paid through stripe-charge-card, that function flips
// status from pending → confirmed. So anything STILL pending after 15 min
// means they didn't pay. Safe to cancel.
//
// Auth: this is a scheduled / server-to-server call. No user JWT.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// How many minutes a pending booking is allowed to sit before auto-cancel
const PENDING_WINDOW_MINUTES = 15

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Find all shops that require pre-payment to book
    const { data: prepayShops, error: shopsErr } = await supabase
      .from('shop_settings')
      .select('groomer_id')
      .eq('require_prepay_to_book', true)

    if (shopsErr) {
      console.error('[auto-cancel-unpaid-bookings] Error fetching shops:', shopsErr)
      return jsonError('Failed to fetch shops: ' + shopsErr.message, 500)
    }

    if (!prepayShops || prepayShops.length === 0) {
      return ok({ cancelled: 0, message: 'No shops require prepay — nothing to do' })
    }

    const groomerIds = prepayShops.map(s => s.groomer_id).filter(Boolean)

    // 2. Cutoff timestamp (anything older than this is expired)
    const cutoff = new Date(Date.now() - PENDING_WINDOW_MINUTES * 60 * 1000).toISOString()

    // 3. Find pending appointments at those shops, older than the cutoff
    const { data: expired, error: findErr } = await supabase
      .from('appointments')
      .select('id, client_id, groomer_id, appointment_date, start_time')
      .eq('status', 'pending')
      .in('groomer_id', groomerIds)
      .lt('created_at', cutoff)

    if (findErr) {
      console.error('[auto-cancel-unpaid-bookings] Error finding expired:', findErr)
      return jsonError('Failed to find expired bookings: ' + findErr.message, 500)
    }

    if (!expired || expired.length === 0) {
      return ok({ cancelled: 0, message: 'No expired pending bookings' })
    }

    // 4. Cancel them all in one update
    const expiredIds = expired.map(a => a.id)
    const { error: cancelErr } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .in('id', expiredIds)

    if (cancelErr) {
      console.error('[auto-cancel-unpaid-bookings] Cancel update failed:', cancelErr)
      return jsonError('Failed to cancel expired bookings: ' + cancelErr.message, 500)
    }

    console.log(`[auto-cancel-unpaid-bookings] Cancelled ${expiredIds.length} expired pending bookings`)

    return ok({
      cancelled: expiredIds.length,
      ids: expiredIds,
      message: `Cancelled ${expiredIds.length} pending booking(s) past the ${PENDING_WINDOW_MINUTES}-minute payment window`
    })

  } catch (err: any) {
    console.error('[auto-cancel-unpaid-bookings] Unexpected error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})

function ok(body: any) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
