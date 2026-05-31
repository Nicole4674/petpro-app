// =============================================================================
// get-referral-code
// =============================================================================
// Returns the signed-in groomer's PetPro referral code (creating it on first
// call), plus their monthly credit status and referral history.
//
// Model: 1 referral credit per CALENDAR MONTH. "Used" = they have a referral row
// dated in the current month. Refills automatically when the month rolls over.
//
// Codes are generated from the shop name (e.g. "Pampered Little Paws" →
// PAMPEREDLITTLEPAWS). If that's already taken, we append a short random tail.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function slugifyShop(name: string | null | undefined): string {
  const base = (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 18)
  return base.length >= 3 ? base : 'GROOMER'
}

function randTail(len = 3): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no confusing 0/O/1/I
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('Missing authorization', 401)
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) return jsonError('Invalid auth token', 401)

    // Find the groomer (id == auth uid; fall back to email for legacy rows)
    let { data: groomer } = await supabase
      .from('groomers')
      .select('id, email, business_name')
      .eq('id', user.id)
      .maybeSingle()
    if (!groomer && user.email) {
      const fb = await supabase
        .from('groomers')
        .select('id, email, business_name')
        .eq('email', user.email)
        .maybeSingle()
      groomer = fb.data
    }
    if (!groomer) return jsonError('Groomer record not found', 404)

    // 1. Existing code?
    let codeRow = (await supabase
      .from('groomer_referral_codes')
      .select('code')
      .eq('groomer_id', groomer.id)
      .maybeSingle()).data

    // 2. Create one if missing — from shop name, with collision fallback
    if (!codeRow) {
      // Prefer shop_settings.shop_name, fall back to groomers.business_name
      const { data: shop } = await supabase
        .from('shop_settings')
        .select('shop_name')
        .eq('groomer_id', groomer.id)
        .maybeSingle()
      const baseName = (shop && shop.shop_name) || groomer.business_name || 'GROOMER'

      let candidate = slugifyShop(baseName)
      // ensure uniqueness
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data: clash } = await supabase
          .from('groomer_referral_codes')
          .select('code')
          .eq('code', candidate)
          .maybeSingle()
        if (!clash) break
        candidate = slugifyShop(baseName) + '-' + randTail()
      }

      const { data: inserted, error: insErr } = await supabase
        .from('groomer_referral_codes')
        .insert({ groomer_id: groomer.id, code: candidate })
        .select('code')
        .single()
      if (insErr) {
        // Rare race: someone inserted between our check and insert. Re-read.
        const reread = await supabase
          .from('groomer_referral_codes')
          .select('code')
          .eq('groomer_id', groomer.id)
          .maybeSingle()
        if (reread.data) codeRow = reread.data
        else return jsonError('Could not create referral code: ' + insErr.message, 500)
      } else {
        codeRow = inserted
      }
    }

    // 3. Monthly credit status — used if any referral this calendar month
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const { data: monthRefs } = await supabase
      .from('groomer_referrals')
      .select('id')
      .eq('referrer_groomer_id', groomer.id)
      .gte('created_at', monthStart)
    const usedThisMonth = (monthRefs || []).length > 0

    // 4. Referral history (most recent first)
    const { data: history } = await supabase
      .from('groomer_referrals')
      .select('id, status, created_at, rewarded_at, referred_groomer_id')
      .eq('referrer_groomer_id', groomer.id)
      .order('created_at', { ascending: false })
      .limit(50)

    return new Response(JSON.stringify({
      code: codeRow.code,
      credit_available: !usedThisMonth,  // true = 1/1, false = 0/1
      used_this_month: usedThisMonth,
      referrals: history || [],
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('[get-referral-code] error:', err)
    return jsonError(err?.message || 'Unknown error', 500)
  }
})
