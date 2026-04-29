// =======================================================
// PetPro — Shop Settings Page
// Per-groomer branding. Reads/writes shop_settings table.
// Uploads logos to shop-logos Supabase Storage bucket.
// =======================================================
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import EnableNotifications from '../components/EnableNotifications'
import AIUsageWidget from '../components/AIUsageWidget'
import { formatPhoneOnInput } from '../lib/phone'

export default function ShopSettings() {
  var navigate = useNavigate()
  var fileInputRef = useRef(null)

  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [uploadingLogo, setUploadingLogo] = useState(false)
  var [saved, setSaved] = useState(false)
  var [error, setError] = useState('')
  var [userId, setUserId] = useState(null)
  var [copiedLink, setCopiedLink] = useState(false)

  // ─── Platform-owner gate (Phase 5 safety) ────────────────────────────
  // Stripe Connect is in sandbox/test mode until live approval comes through.
  // Hide the Stripe Connect UI from non-platform-owners so new groomers don't
  // hit a broken sandbox onboarding. Flip STRIPE_CONNECT_LIVE to true once
  // we're approved + keys swapped in edge functions.
  var STRIPE_CONNECT_LIVE = false
  var PLATFORM_OWNER_EMAILS = ['treadwell4674@gmail.com', 'nicole@trypetpro.com']
  var [userEmail, setUserEmail] = useState('')
  var isPlatformOwner = userEmail && PLATFORM_OWNER_EMAILS.indexOf(userEmail.toLowerCase()) >= 0
  var canSeeStripeConnect = STRIPE_CONNECT_LIVE || isPlatformOwner

  // Form fields
  var [shopName, setShopName] = useState('')
  var [tagline, setTagline] = useState('')
  var [phone, setPhone] = useState('')
  var [email, setEmail] = useState('')
  var [address, setAddress] = useState('')
  var [website, setWebsite] = useState('')
  var [logoUrl, setLogoUrl] = useState('')
  var [primaryColor, setPrimaryColor] = useState('#7c3aed')
  var [hours, setHours] = useState('')
  // AI toggles — tier 1 (manual / "Moe Go Mode") vs tier 2 (full AI brain)
  var [groomerAiEnabled, setGroomerAiEnabled] = useState(true)
  var [clientAiBookingEnabled, setClientAiBookingEnabled] = useState(true)
  // Smart Nudges toggle — proactive AI insights on the chat bubble.
  // Lives on the groomers row (not shop_settings) so each owner controls their own.
  var [nudgesEnabled, setNudgesEnabled] = useState(true)

  // One-click migration: flip all existing clients from "New" to "Existing"
  var [markingExisting, setMarkingExisting] = useState(false)
  var [markedCount, setMarkedCount] = useState(null)
  var [markError, setMarkError] = useState('')

  // ─── Stripe Connect (client payments) ──────────────────────────────────
  // Each groomer connects their own Stripe account so their clients pay
  // them directly. Status drives the UI in the Payments section.
  var [stripeConnectStatus, setStripeConnectStatus] = useState('not_started')
  var [stripeChargesEnabled, setStripeChargesEnabled] = useState(false)
  var [stripePayoutsEnabled, setStripePayoutsEnabled] = useState(false)
  var [stripeAccountId, setStripeAccountId] = useState(null)
  var [connectingStripe, setConnectingStripe] = useState(false)
  var [connectError, setConnectError] = useState('')
  var [refreshingStripe, setRefreshingStripe] = useState(false)

  // ─── Per-shop payment policy toggles (Phase 5) ───────────────────────
  // require_prepay_to_book: client must pay card before booking is confirmed
  // no_show_fee_amount: dollar amount auto-charged when appt marked no-show
  // pass_fees_to_client: ~3% Stripe fee added to client's bill (MoeGo style)
  var [requirePrepay, setRequirePrepay] = useState(false)
  var [noShowFeeAmount, setNoShowFeeAmount] = useState('')
  var [passFeesToClient, setPassFeesToClient] = useState(false)
  // Auto-cancel unpaid bookings — only applies when require_prepay is on.
  // Lets each shop pick if/when to auto-cancel pending unpaid bookings.
  var [autoCancelUnpaid, setAutoCancelUnpaid] = useState(false)
  var [autoCancelMinutes, setAutoCancelMinutes] = useState('15')

  useEffect(function () {
    loadSettings()
  }, [])

  // ─── Detect return from Stripe Connect onboarding ───────────────────
  // After the groomer finishes Stripe's hosted onboarding, Stripe sends
  // them back here with ?stripe_return=1 in the URL. We re-load settings
  // to pick up any status updates from the webhook and clean up the URL.
  useEffect(function () {
    var params = new URLSearchParams(window.location.search)
    if (params.get('stripe_return') === '1') {
      loadSettings()
      // Clean the query string so refresh doesn't re-fire this
      window.history.replaceState({}, '', '/settings/shop')
    }
    if (params.get('stripe_refresh') === '1') {
      // Stripe's "session expired" path — just reload to start over
      loadSettings()
      window.history.replaceState({}, '', '/settings/shop')
    }
  }, [])

  // ─── Refresh Stripe Connect status from Stripe ───────────────────────
  // Asks Stripe directly for the groomer's account state and updates
  // the local UI + DB. Called automatically when the page loads (if they
  // have an account) and when they return from onboarding. Also wired to
  // a manual "Refresh status" button.
  async function refreshStripeStatus(silent) {
    if (!silent) setRefreshingStripe(true)
    try {
      var { data, error: invokeError } = await supabase.functions.invoke('stripe-connect-refresh', {})
      if (invokeError) throw invokeError
      if (data) {
        if (data.status) setStripeConnectStatus(data.status)
        if (typeof data.charges_enabled === 'boolean') setStripeChargesEnabled(data.charges_enabled)
        if (typeof data.payouts_enabled === 'boolean') setStripePayoutsEnabled(data.payouts_enabled)
      }
    } catch (err) {
      console.warn('refreshStripeStatus failed (non-fatal):', err)
      // Silent failure on auto-load — don't bother the user. The DB still
      // has the last-known state, which is what loadSettings already loaded.
      if (!silent) {
        setConnectError('Could not refresh status: ' + (err.message || err))
      }
    } finally {
      if (!silent) setRefreshingStripe(false)
    }
  }

  // ─── Kick off Stripe Connect onboarding ─────────────────────────────
  // Calls the stripe-connect-onboard edge function which (a) creates a
  // Stripe Express account if needed and (b) returns a hosted onboarding
  // URL. We redirect the groomer there to verify ID, link bank, etc.
  async function handleConnectStripe() {
    setConnectingStripe(true)
    setConnectError('')
    try {
      var { data, error: invokeError } = await supabase.functions.invoke('stripe-connect-onboard', {})
      if (invokeError) throw invokeError
      if (!data || !data.url) {
        throw new Error(data && data.error ? data.error : 'No onboarding URL returned')
      }
      // Redirect to Stripe's hosted onboarding. After they finish, Stripe
      // will redirect them back to /settings/shop?stripe_return=1.
      window.location.href = data.url
    } catch (err) {
      console.error('Stripe Connect error:', err)
      setConnectError('Could not start Stripe onboarding: ' + (err.message || err))
      setConnectingStripe(false)
    }
  }

  async function loadSettings() {
    setLoading(true)
    setError('')
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/login')
        return
      }
      setUserId(user.id)
      setUserEmail((user.email || '').toLowerCase())

      var { data, error: fetchError } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('groomer_id', user.id)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (data) {
        setShopName(data.shop_name || '')
        setTagline(data.tagline || '')
        setPhone(data.phone || '')
        setEmail(data.email || '')
        setAddress(data.address || '')
        setWebsite(data.website || '')
        setLogoUrl(data.logo_url || '')
        setPrimaryColor(data.primary_color || '#7c3aed')
        setHours(data.hours || '')
        // AI toggles — default to ON if the column is missing or null (existing behavior)
        setGroomerAiEnabled(data.groomer_ai_enabled !== false)
        setClientAiBookingEnabled(data.client_ai_booking_enabled !== false)
        // Payment policy toggles (Phase 5)
        setRequirePrepay(data.require_prepay_to_book === true)
        setNoShowFeeAmount(data.no_show_fee_amount ? String(data.no_show_fee_amount) : '')
        setPassFeesToClient(data.pass_fees_to_client === true)
        setAutoCancelUnpaid(data.auto_cancel_unpaid_bookings === true)
        setAutoCancelMinutes(data.auto_cancel_unpaid_minutes != null ? String(data.auto_cancel_unpaid_minutes) : '15')
      }

      // Smart Nudges + Stripe Connect status — both live on the groomers
      // table (not shop_settings). We pull them in one query.
      var { data: groomerRow } = await supabase
        .from('groomers')
        .select('nudges_enabled, stripe_connect_account_id, stripe_connect_status, stripe_connect_charges_enabled, stripe_connect_payouts_enabled')
        .eq('id', user.id)
        .maybeSingle()
      if (groomerRow) {
        setNudgesEnabled(groomerRow.nudges_enabled !== false)
        setStripeAccountId(groomerRow.stripe_connect_account_id || null)
        setStripeConnectStatus(groomerRow.stripe_connect_status || 'not_started')
        setStripeChargesEnabled(groomerRow.stripe_connect_charges_enabled === true)
        setStripePayoutsEnabled(groomerRow.stripe_connect_payouts_enabled === true)

        // Auto-refresh from Stripe if we have an account — keeps status fresh
        // even if webhooks miss something. Runs silently in background.
        if (groomerRow.stripe_connect_account_id) {
          refreshStripeStatus(true)
        }
      }
    } catch (err) {
      console.error('Error loading shop settings:', err)
      setError('Could not load settings: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogoUpload(e) {
    var file = e.target.files[0]
    if (!file) return

    // Validate file size (2 MB max)
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo file is too big. Max size: 2 MB.')
      return
    }

    // Validate file type
    var allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
    if (allowed.indexOf(file.type) === -1) {
      setError('Only PNG, JPG, WEBP, or SVG images allowed.')
      return
    }

    setUploadingLogo(true)
    setError('')
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      var fileExt = file.name.split('.').pop().toLowerCase()
      var filePath = user.id + '/logo.' + fileExt

      // Upload (upsert = overwrite if exists)
      var { error: uploadError } = await supabase.storage
        .from('shop-logos')
        .upload(filePath, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      // Get public URL with cache-buster so new logo shows immediately
      var { data: urlData } = supabase.storage
        .from('shop-logos')
        .getPublicUrl(filePath)

      var publicUrl = urlData.publicUrl + '?t=' + Date.now()
      setLogoUrl(publicUrl)
    } catch (err) {
      console.error('Logo upload failed:', err)
      setError('Logo upload failed: ' + err.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleRemoveLogo() {
    if (!confirm('Remove your shop logo?')) return
    setLogoUrl('')
  }

  function handleCopyLink() {
    if (!userId) return
    var link = window.location.origin + '/portal/signup?g=' + userId
    navigator.clipboard.writeText(link).then(function () {
      setCopiedLink(true)
      setTimeout(function () { setCopiedLink(false) }, 2000)
    }).catch(function () {
      // Fallback: select text instead
      alert('Copy failed. Link: ' + link)
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      var payload = {
        groomer_id: user.id,
        shop_name: shopName || null,
        tagline: tagline || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        website: website || null,
        logo_url: logoUrl || null,
        primary_color: primaryColor || '#7c3aed',
        hours: hours || null,
        groomer_ai_enabled: groomerAiEnabled,
        client_ai_booking_enabled: clientAiBookingEnabled,
        // Payment policy toggles (Phase 5)
        require_prepay_to_book: requirePrepay,
        no_show_fee_amount: parseFloat(noShowFeeAmount) || 0,
        pass_fees_to_client: passFeesToClient,
        auto_cancel_unpaid_bookings: autoCancelUnpaid,
        auto_cancel_unpaid_minutes: parseInt(autoCancelMinutes) || 15,
      }

      var { error: upsertError } = await supabase
        .from('shop_settings')
        .upsert(payload, { onConflict: 'groomer_id' })

      if (upsertError) throw upsertError

      // Save Smart Nudges toggle to the groomers row (not shop_settings)
      await supabase
        .from('groomers')
        .update({ nudges_enabled: nudgesEnabled })
        .eq('id', user.id)

      setSaved(true)
      setTimeout(function () { setSaved(false) }, 3000)
    } catch (err) {
      console.error('Save failed:', err)
      setError('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // One-click migration — flips every existing client under this groomer
  // from is_first_time=true to is_first_time=false. Anyone added after this
  // still gets is_first_time=true on creation (AddClient.jsx default).
  async function handleMarkAllExisting() {
    var ok = window.confirm(
      'Mark ALL current clients in your system as existing (not new)?\n\n' +
      'This removes the "New Client" badge from everyone already added. ' +
      'Any clients you add AFTER this will still be flagged as new.\n\n' +
      'Do this BEFORE handing out client portal logins to existing customers.'
    )
    if (!ok) return

    setMarkingExisting(true)
    setMarkError('')
    setMarkedCount(null)
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      // Flip only rows that are still flagged new, owned by this groomer
      var { data, error: updErr } = await supabase
        .from('clients')
        .update({ is_first_time: false })
        .eq('groomer_id', user.id)
        .eq('is_first_time', true)
        .select('id')

      if (updErr) throw updErr
      setMarkedCount((data || []).length)
    } catch (err) {
      console.error('Mark existing failed:', err)
      setMarkError('Could not update clients: ' + err.message)
    } finally {
      setMarkingExisting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading shop settings...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '800', color: '#111827' }}>
          🏪 Shop Settings
        </h1>
        <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: '14px' }}>
          Your shop's branding appears on printed forms, client emails, and invoices.
        </p>
      </div>

      {/* Save status */}
      {saved && (
        <div style={{ padding: '12px 16px', background: '#d1fae5', border: '1px solid #10b981', borderRadius: '8px', color: '#065f46', marginBottom: '16px', fontWeight: '600' }}>
          ✅ Settings saved!
        </div>
      )}
      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '8px', color: '#991b1b', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Client Portal Signup Link */}
      <div style={{ background: '#f3e8ff', border: '1px solid #c084fc', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#6b21a8', marginBottom: '6px' }}>
          🔗 Client Portal Signup Link
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#581c87' }}>
          Share this link with new clients. They sign up, verify email, and get their own portal account linked to you.
        </p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            readOnly
            value={userId ? (window.location.origin + '/portal/signup?g=' + userId) : 'Loading...'}
            onClick={function (e) { e.target.select() }}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '13px',
              fontFamily: 'monospace',
              background: '#fff',
              boxSizing: 'border-box'
            }}
          />
          <button
            onClick={handleCopyLink}
            disabled={!userId}
            style={{
              padding: '10px 18px',
              background: copiedLink ? '#10b981' : '#7c3aed',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: userId ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap'
            }}
          >
            {copiedLink ? '✓ Copied!' : '📋 Copy Link'}
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
          🔔 Notifications
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
          Get pinged when a client books, sends a message, or PetPro AI flags an appointment — even when PetPro isn't open. Turn this on in every browser you use.
        </p>
        <EnableNotifications variant="settings" userType="groomer" />
      </div>

      {/* Client Migration — one-click flip all current clients from "New" to "Existing" */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
          📇 Client Migration
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280', lineHeight: '1.5' }}>
          Switching from another system? Click below to mark <strong>all clients currently in PetPro</strong> as existing.
          This removes the "New Client" badge for everyone already in your system. <strong>Anyone added AFTER this click</strong> will still be flagged as new.
        </p>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
          Tip: click this BEFORE you hand out client portal logins to existing customers.
        </p>

        <button
          type="button"
          onClick={handleMarkAllExisting}
          disabled={markingExisting}
          style={{
            padding: '10px 18px',
            background: markingExisting ? '#9ca3af' : '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '700',
            fontSize: '14px',
            cursor: markingExisting ? 'wait' : 'pointer'
          }}
        >
          {markingExisting ? 'Marking…' : '✓ Mark all current clients as existing'}
        </button>

        {markedCount !== null && !markError && (
          <div style={{ marginTop: '12px', padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', fontSize: '13px', color: '#047857', fontWeight: '600' }}>
            ✓ Done — {markedCount} client{markedCount === 1 ? '' : 's'} marked as existing.
          </div>
        )}
        {markError && (
          <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#b91c1c', fontWeight: '600' }}>
            {markError}
          </div>
        )}
      </div>

      {/* AI Features — tier 1 / tier 2 master toggles */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '4px' }}>
          🤖 AI Features
        </div>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
          Turn PetPro AI on or off per feature. Flip both off = <strong style={{ color: '#7c3aed' }}>Classic Mode 🐾</strong> (pure manual booking).
        </p>

        <Toggle
          label="Groomer AI Chat"
          description="Voice booking + ask-anything PetPro AI on your Dashboard. Off = no chat widget, pure manual calendar."
          value={groomerAiEnabled}
          onChange={setGroomerAiEnabled}
        />
        <Toggle
          label="Client Self-Booking (AI)"
          description="The PetPro AI chat bubble in your client portal. Off = no bubble at all — clients can only message you directly or call the shop."
          value={clientAiBookingEnabled}
          onChange={setClientAiBookingEnabled}
        />
        <Toggle
          label="✨ Smart Nudges"
          description="Proactive AI tips on the chat bubble — light schedule alerts, overdue balance reminders, due-for-rebook campaigns, vax expiring, and more. Uses a small amount of AI credits each day. Off = no nudges; chat works as a normal ask-anything assistant."
          value={nudgesEnabled}
          onChange={setNudgesEnabled}
        />

        {(!groomerAiEnabled && !clientAiBookingEnabled) && (
          <div style={{ marginTop: '14px', padding: '10px 14px', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '8px', fontSize: '13px', color: '#6d28d9', fontWeight: '600' }}>
            🐾 Classic Mode activated — pure manual booking, no AI anywhere.
          </div>
        )}
      </div>

      {/* AI Usage widget — shows used / cap for current month */}
      <AIUsageWidget />

      {/* ─── Payments / Stripe Connect ──────────────────────────────────── */}
      {/* Gated until live Connect approval comes through — see canSeeStripeConnect */}
      {!canSeeStripeConnect && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ fontSize: '22px' }}>💳</span>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>Card Payments</h2>
            <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '4px 10px', borderRadius: '20px' }}>
              Coming Soon
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', lineHeight: 1.6 }}>
            Card payment processing is launching shortly. You'll be able to connect your Stripe account so clients can pay you directly through the client portal — no more chasing Zelle, Venmo, or Cash App. We'll email you when it goes live for your shop.
          </p>
          <p style={{ margin: '10px 0 0 0', fontSize: '13px', color: '#9ca3af', lineHeight: 1.5 }}>
            In the meantime, you can keep tracking payments manually (Cash, Zelle, Venmo, Card) on the appointment popup.
          </p>
        </div>
      )}
      {canSeeStripeConnect && (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <span style={{ fontSize: '22px' }}>💳</span>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>Payments</h2>
        </div>
        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#6b7280', lineHeight: 1.5 }}>
          Connect your Stripe account so clients can pay you by card directly from the client portal — no more chasing Zelle, Venmo, or Cash App. Money lands in your bank daily.
        </p>

        {/* NOT STARTED — show big Connect button */}
        {stripeConnectStatus === 'not_started' && !stripeAccountId && (
          <>
            <button
              onClick={handleConnectStripe}
              disabled={connectingStripe}
              style={{
                width: '100%',
                padding: '14px',
                background: connectingStripe ? '#a78bfa' : '#7c3aed',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: connectingStripe ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
              }}
            >
              {connectingStripe ? 'Opening Stripe...' : '🔗 Connect Stripe Account'}
            </button>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#9ca3af' }}>
              You'll be sent to Stripe to verify your identity and link your bank. Takes about 5 minutes.
            </div>
          </>
        )}

        {/* PENDING — partway through onboarding (account exists but not enabled) */}
        {(stripeConnectStatus === 'pending' || (stripeAccountId && !stripeChargesEnabled)) && stripeConnectStatus !== 'enabled' && (
          <>
            <div style={{ padding: '12px 14px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px', marginBottom: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>
                ⏳ Onboarding in progress
              </div>
              <div style={{ fontSize: '13px', color: '#78350f' }}>
                Stripe is reviewing your info, or you didn't finish all the steps. Click below to continue.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleConnectStripe}
                disabled={connectingStripe}
                style={{
                  flex: 2,
                  padding: '12px',
                  background: connectingStripe ? '#a78bfa' : '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: connectingStripe ? 'not-allowed' : 'pointer',
                }}
              >
                {connectingStripe ? 'Opening Stripe...' : 'Continue Setup on Stripe →'}
              </button>
              <button
                onClick={() => refreshStripeStatus(false)}
                disabled={refreshingStripe}
                title="Check current status with Stripe"
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#fff',
                  color: '#6b7280',
                  border: '1px solid #d1d5db',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: refreshingStripe ? 'not-allowed' : 'pointer',
                }}
              >
                {refreshingStripe ? '...' : '🔄 Refresh'}
              </button>
            </div>
          </>
        )}

        {/* ENABLED — fully connected, can accept payments */}
        {stripeConnectStatus === 'enabled' && stripeChargesEnabled && (
          <div style={{ padding: '14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '18px' }}>✅</span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#166534' }}>Stripe Connected</span>
            </div>
            <div style={{ fontSize: '13px', color: '#15803d', lineHeight: 1.5 }}>
              Clients can now pay you by card from the client portal. Daily payouts to your bank.
              {stripePayoutsEnabled ? ' Bank account verified ✓' : ' (bank verification still in progress)'}
            </div>
          </div>
        )}

        {/* RESTRICTED — Stripe needs more info or has paused the account */}
        {stripeConnectStatus === 'restricted' && (
          <>
            <div style={{ padding: '12px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', marginBottom: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#991b1b', marginBottom: '4px' }}>
                ⚠️ Action required by Stripe
              </div>
              <div style={{ fontSize: '13px', color: '#7f1d1d' }}>
                Stripe needs more information from you. Click below to fix it on Stripe's side.
              </div>
            </div>
            <button
              onClick={handleConnectStripe}
              disabled={connectingStripe}
              style={{
                width: '100%',
                padding: '12px',
                background: connectingStripe ? '#fca5a5' : '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: connectingStripe ? 'not-allowed' : 'pointer',
              }}
            >
              {connectingStripe ? 'Opening Stripe...' : 'Fix on Stripe →'}
            </button>
          </>
        )}

        {connectError && (
          <div style={{ marginTop: '10px', padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#991b1b' }}>
            {connectError}
          </div>
        )}

        {/* ─── Payment Policy Toggles (Phase 5) ─────────────────────────── */}
        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
            Payment Policies
          </div>

          {/* Require prepay */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
            <label style={{ position: 'relative', display: 'inline-block', width: '46px', height: '24px', flexShrink: 0, marginTop: '2px' }}>
              <input type="checkbox" checked={requirePrepay} onChange={e => setRequirePrepay(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{
                position: 'absolute', cursor: 'pointer', inset: 0,
                background: requirePrepay ? '#10b981' : '#d1d5db',
                borderRadius: '24px', transition: '0.2s',
              }}>
                <span style={{
                  position: 'absolute', height: '18px', width: '18px',
                  left: requirePrepay ? '25px' : '3px', top: '3px',
                  background: '#fff', borderRadius: '50%', transition: '0.2s',
                }}/>
              </span>
            </label>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>🔒 Require pre-payment to book</div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                Clients must pay through their portal before a booking is confirmed. Helps eliminate no-shows.
              </div>
            </div>
          </div>

          {/* No-show fee amount */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ width: '46px', flexShrink: 0, marginTop: '2px', fontSize: '20px', textAlign: 'center' }}>💸</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>No-show fee</div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px', marginBottom: '6px' }}>
                When you mark an appointment as no-show, this amount auto-charges to the client's saved card. Set to $0 to disable.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '160px' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>$</span>
                <input type="number" step="0.01" min="0" value={noShowFeeAmount}
                  onChange={e => setNoShowFeeAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ flex: 1, padding: '8px 10px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px' }} />
              </div>
            </div>
          </div>

          {/* Pass fees to client */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0', borderBottom: requirePrepay ? '1px solid #f3f4f6' : 'none' }}>
            <label style={{ position: 'relative', display: 'inline-block', width: '46px', height: '24px', flexShrink: 0, marginTop: '2px' }}>
              <input type="checkbox" checked={passFeesToClient} onChange={e => setPassFeesToClient(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{
                position: 'absolute', cursor: 'pointer', inset: 0,
                background: passFeesToClient ? '#10b981' : '#d1d5db',
                borderRadius: '24px', transition: '0.2s',
              }}>
                <span style={{
                  position: 'absolute', height: '18px', width: '18px',
                  left: passFeesToClient ? '25px' : '3px', top: '3px',
                  background: '#fff', borderRadius: '50%', transition: '0.2s',
                }}/>
              </span>
            </label>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>💯 Pass card fees to client</div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                Adds the ~3% Stripe processing fee to your client's bill so you keep 100% of the service price. Service shows as "$X service · $Y card fee · $Z total" at checkout.
              </div>
            </div>
          </div>

          {/* Auto-cancel unpaid bookings — only shown when require_prepay is on */}
          {requirePrepay && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0' }}>
              <label style={{ position: 'relative', display: 'inline-block', width: '46px', height: '24px', flexShrink: 0, marginTop: '2px' }}>
                <input type="checkbox" checked={autoCancelUnpaid} onChange={e => setAutoCancelUnpaid(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }} />
                <span style={{
                  position: 'absolute', cursor: 'pointer', inset: 0,
                  background: autoCancelUnpaid ? '#10b981' : '#d1d5db',
                  borderRadius: '24px', transition: '0.2s',
                }}>
                  <span style={{
                    position: 'absolute', height: '18px', width: '18px',
                    left: autoCancelUnpaid ? '25px' : '3px', top: '3px',
                    background: '#fff', borderRadius: '50%', transition: '0.2s',
                  }}/>
                </span>
              </label>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>⏱️ Auto-cancel unpaid bookings</div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px', marginBottom: autoCancelUnpaid ? '8px' : '0' }}>
                  When ON, pending bookings auto-cancel if the client hasn't paid within the time limit below. Frees up the slot for someone else. Leave OFF if you're flexible about late payments.
                </div>
                {autoCancelUnpaid && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#374151' }}>Cancel after</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={autoCancelMinutes}
                      onChange={e => setAutoCancelMinutes(e.target.value)}
                      placeholder="15"
                      style={{ width: '80px', padding: '8px 10px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px' }}
                    />
                    <span style={{ fontSize: '13px', color: '#374151' }}>minutes</span>
                  </div>
                )}
                {autoCancelUnpaid && (
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>
                    Tip: 15 min works for busy shops. 60 min or longer for shops where clients often pay later in the day. Use 1440 (24 hours) for very flexible policies.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Logo upload */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <label style={{ fontWeight: '700', fontSize: '14px', color: '#374151', display: 'block', marginBottom: '12px' }}>
          Shop Logo
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {/* Logo preview */}
          <div style={{
            width: '120px',
            height: '120px',
            border: '2px dashed #d1d5db',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f9fafb',
            overflow: 'hidden'
          }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Shop logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '40px' }}>🏪</span>
            )}
          </div>

          {/* Upload controls */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={function () { fileInputRef.current && fileInputRef.current.click() }}
              disabled={uploadingLogo}
              style={{
                padding: '10px 18px',
                background: '#7c3aed',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: uploadingLogo ? 'wait' : 'pointer',
                marginRight: '8px'
              }}
            >
              {uploadingLogo ? 'Uploading...' : (logoUrl ? 'Replace Logo' : 'Upload Logo')}
            </button>
            {logoUrl && (
              <button
                onClick={handleRemoveLogo}
                style={{
                  padding: '10px 18px',
                  background: '#fff',
                  color: '#ef4444',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Remove
              </button>
            )}
            <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#6b7280' }}>
              PNG, JPG, WEBP, or SVG. Max 2 MB. Square logos look best.
            </p>
          </div>
        </div>
      </div>

      {/* Shop Identity */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
          Shop Identity
        </div>

        <Field label="Shop Name *" value={shopName} onChange={setShopName} placeholder="e.g. Paws & Claws Grooming" />
        <Field label="Tagline" value={tagline} onChange={setTagline} placeholder="e.g. Luxury grooming since 2018" />
        <Field label="Brand Color" type="color" value={primaryColor} onChange={setPrimaryColor} />
      </div>

      {/* Contact Info */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
          Contact Info
        </div>

        <Field label="Phone" value={phone} onChange={(v) => setPhone(formatPhoneOnInput(v))} placeholder="713-098-3746" />
        <Field label="Email" value={email} onChange={setEmail} placeholder="shop@example.com" type="email" />
        <Field label="Website" value={website} onChange={setWebsite} placeholder="https://yourshop.com" />
        <TextArea label="Address" value={address} onChange={setAddress} placeholder="123 Main St, City, State 12345" />
        <TextArea label="Hours" value={hours} onChange={setHours} placeholder="Mon–Sat 8am–6pm, Closed Sundays" />
      </div>

      {/* Save button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          onClick={function () { navigate(-1) }}
          style={{
            padding: '12px 24px',
            background: '#fff',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 24px',
            background: saving ? '#9ca3af' : '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '700',
            cursor: saving ? 'wait' : 'pointer'
          }}
        >
          {saving ? 'Saving...' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  )
}

// ─── Helper components ────────────────────────────────────
function Field({ label, value, onChange, placeholder, type }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
        {label}
      </label>
      <input
        type={type || 'text'}
        value={value}
        onChange={function (e) { onChange(e.target.value) }}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          fontSize: '14px',
          boxSizing: 'border-box',
          height: type === 'color' ? '44px' : 'auto'
        }}
      />
    </div>
  )
}

// Toggle switch — green when ON, gray when OFF. Used for AI feature flags.
function Toggle({ label, description, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: '700', fontSize: '14px', color: '#111827', marginBottom: '2px' }}>
          {label}
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: '1.4' }}>
          {description}
        </div>
      </div>
      <button
        type="button"
        onClick={function () { onChange(!value) }}
        role="switch"
        aria-checked={value}
        aria-label={label}
        style={{
          position: 'relative',
          width: '52px',
          height: '28px',
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          background: value ? '#10b981' : '#d1d5db',
          flexShrink: 0,
          transition: 'background 0.15s',
          padding: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '3px',
            left: value ? '27px' : '3px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transition: 'left 0.15s',
          }}
        />
      </button>
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={function (e) { onChange(e.target.value) }}
        placeholder={placeholder}
        rows={2}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          fontSize: '14px',
          boxSizing: 'border-box',
          resize: 'vertical',
          fontFamily: 'inherit'
        }}
      />
    </div>
  )
}
