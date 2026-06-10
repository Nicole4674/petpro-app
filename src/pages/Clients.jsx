import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatPhone } from '../lib/phone'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Active/inactive toggle — default to active only
  const [showInactive, setShowInactive] = useState(false)
  // Filter chips (overdue, owes, no upcoming, etc.) + the computed per-client
  // meta (visit/booking/balance/vax) that drives them.
  const [activeFilter, setActiveFilter] = useState('all')
  const [clientMeta, setClientMeta] = useState({})

  // ===== Mass SMS to ALL clients (pro+ only) =====
  // Different from Calendar's Mass SMS (that one filters by day's appts).
  // This one targets every consented + active client — use for big shop
  // announcements: "We're moving!", new phone #, holiday closure, etc.
  const [subscriptionTier, setSubscriptionTier] = useState(null)
  const [showMassSms, setShowMassSms] = useState(false)
  const [massSmsMessage, setMassSmsMessage] = useState('')
  const [massSmsRecipients, setMassSmsRecipients] = useState({}) // { clientId: bool }
  // 🎯 Quick segments — one-tap smart selections ("lapsed 8+ weeks", "in zone X").
  // massSmsSegment = active chip key (highlight only); zonesList feeds zone chips.
  const [massSmsSegment, setMassSmsSegment] = useState(null)
  const [zonesList, setZonesList] = useState([])
  // 📈 Blast history — last few blasts + how many recipients booked within
  // 7 days (and est. revenue). Loaded when the modal opens.
  const [massSmsHistory, setMassSmsHistory] = useState(null) // null = loading/none
  // 🔋 SMS top-up — one-time $10 → +500 texts (PetPro platform Stripe)
  const [smsTopupBuying, setSmsTopupBuying] = useState(false)
  const [smsTopupToast, setSmsTopupToast] = useState('')

  async function buySmsTopup() {
    setSmsTopupBuying(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-sms-topup-checkout', {
        body: { return_url: window.location.origin + '/clients' },
      })
      if (error || !data || data.error || !data.url) {
        window.alert((data && data.error) || (error && error.message) || 'Could not start checkout.')
        setSmsTopupBuying(false)
        return
      }
      window.location.href = data.url
    } catch (e) {
      window.alert(e.message || 'Could not start checkout.')
      setSmsTopupBuying(false)
    }
  }

  // Stripe return: ?smstopup=1&session_id=... → verify + grant credits.
  // confirm-sms-topup is idempotent, so refreshes can't double-grant.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('smstopup') === '1' && params.get('session_id')) {
      ;(async () => {
        try {
          const { data } = await supabase.functions.invoke('confirm-sms-topup', {
            body: { session_id: params.get('session_id') },
          })
          if (data && data.granted) {
            setSmsTopupToast('🔋 +' + data.sms_added + ' texts added! You now have ' + (data.remaining ?? '?') + ' SMS this month.')
            setMassSmsQuota((prev) => ({ ...prev, remaining: data.remaining ?? prev.remaining }))
          } else if (data && data.reason) {
            setSmsTopupToast('⏳ ' + data.reason)
          } else if (data && data.error) {
            setSmsTopupToast('⚠️ ' + data.error)
          }
        } catch (e) {
          setSmsTopupToast('⚠️ Could not confirm your top-up — if you were charged, email nicole@trypetpro.com.')
        }
        window.history.replaceState({}, '', window.location.pathname)
      })()
    } else if (params.get('smstopup') === 'cancelled') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])
  const [massSmsSending, setMassSmsSending] = useState(false)
  const [massSmsResults, setMassSmsResults] = useState(null) // { sent, failed, errors }
  const [massSmsQuota, setMassSmsQuota] = useState({ remaining: null, total: null, founder: false, loaded: false })
  // Inside-modal search — for when you have lots of clients and only want
  // to text a handful. Filters the visible list but doesn't unselect
  // anyone already checked outside the current view.
  const [massSmsSearch, setMassSmsSearch] = useState('')

  useEffect(() => {
    fetchClients()
    fetchClientMeta()
    loadTierAndQuota()
  }, [])

  // Load groomer's subscription tier + SMS quota so the button can be gated
  // and the modal can show a live meter. Fire-and-forget; defaults to a safe
  // fallback (no Mass SMS access) if anything fails.
  async function loadTierAndQuota() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: groomerRow }, { data: balRow }] = await Promise.all([
        supabase.from('groomers').select('subscription_tier').eq('id', user.id).maybeSingle(),
        supabase.from('groomer_sms_balance').select('monthly_sms_remaining, monthly_sms_total, founder_unlimited_sms').eq('groomer_id', user.id).maybeSingle(),
      ])
      setSubscriptionTier(groomerRow?.subscription_tier || null)
      setMassSmsQuota({
        remaining: balRow?.monthly_sms_remaining ?? 0,
        total: balRow?.monthly_sms_total ?? 0,
        founder: !!balRow?.founder_unlimited_sms,
        loaded: true,
      })
    } catch (err) {
      console.warn('Clients: tier/quota load failed:', err)
    }
  }

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*, pets(id, name, breed)')
      .order('last_name', { ascending: true })

    if (error) {
      console.error('Error fetching clients:', error)
    } else {
      // Sort alphabetically by last name, then first name (handles nulls)
      const sorted = (data || []).sort((a, b) => {
        const lastA = (a.last_name || '').toLowerCase()
        const lastB = (b.last_name || '').toLowerCase()
        if (lastA !== lastB) return lastA.localeCompare(lastB)
        const firstA = (a.first_name || '').toLowerCase()
        const firstB = (b.first_name || '').toLowerCase()
        return firstA.localeCompare(firstB)
      })
      setClients(sorted)
    }
    setLoading(false)
  }

  // Compute per-client filter data: overdue / upcoming / last visit / balance /
  // vaccination alerts. Pulls all appointments + payments + pets once and
  // reduces into a { clientId: {...} } map. Separate from fetchClients so the
  // basic list paints fast and the chips fill in a beat later.
  const fetchClientMeta = async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0')

    const [{ data: appts }, { data: pays }, { data: petRows }] = await Promise.all([
      supabase.from('appointments').select('id, client_id, appointment_date, status, checked_out_at, quoted_price, final_price, discount_amount'),
      supabase.from('payments').select('appointment_id, amount'),
      supabase.from('pets').select('client_id, vaccination_expiry, is_archived'),
    ])

    const paidByAppt = {}
    ;(pays || []).forEach(function (p) {
      paidByAppt[p.appointment_id] = (paidByAppt[p.appointment_id] || 0) + parseFloat(p.amount || 0)
    })

    const CLOSED = ['cancelled', 'no_show', 'rescheduled', 'completed', 'checked_out']
    const DEAD = ['cancelled', 'no_show', 'rescheduled']
    const meta = {}
    const ensure = function (cid) {
      if (!meta[cid]) meta[cid] = { overdue: false, hasUpcoming: false, lastVisit: null, balance: 0, vaxAlert: false }
      return meta[cid]
    }

    ;(appts || []).forEach(function (a) {
      if (!a.client_id || !a.appointment_date) return
      const m = ensure(a.client_id)
      const d = a.appointment_date
      const isOpen = a.checked_out_at == null && CLOSED.indexOf(a.status) === -1
      if (isOpen && d < todayStr) m.overdue = true
      if (isOpen && d >= todayStr) m.hasUpcoming = true
      // A real (served) visit: not a dead booking, and either done or past-dated.
      const served = DEAD.indexOf(a.status) === -1 && (a.checked_out_at != null || a.status === 'completed' || d < todayStr)
      if (served) {
        if (!m.lastVisit || d > m.lastVisit) m.lastVisit = d
        const price = parseFloat(a.final_price != null ? a.final_price : (a.quoted_price || 0))
        const disc = parseFloat(a.discount_amount || 0)
        const bal = price - disc - (paidByAppt[a.id] || 0)
        if (bal > 0.01) m.balance += bal
      }
    })

    // Vaccination alert: any active pet whose vax is expired or expiring within 30 days.
    const in30 = new Date(); in30.setDate(in30.getDate() + 30)
    ;(petRows || []).forEach(function (p) {
      if (!p.client_id || p.is_archived === true || !p.vaccination_expiry) return
      if (new Date(p.vaccination_expiry) <= in30) ensure(p.client_id).vaxAlert = true
    })

    setClientMeta(meta)
  }

  // ===== Mass SMS handlers =====
  // Eligible = active client with sms_consent=true AND a phone on file.
  // Inactive clients get filtered (don't waste credits on people who left).
  const smsEligible = clients.filter(c =>
    c.is_active !== false &&
    c.sms_consent === true &&
    c.phone && c.phone.trim() !== ''
  )
  // Clients with consent OFF — shown muted so groomer knows why some are
  // missing. Counts in the modal so she can decide whether to chase consent.
  const smsIneligibleNoConsent = clients.filter(c =>
    c.is_active !== false && c.sms_consent !== true && c.phone && c.phone.trim() !== ''
  )

  function openMassSms() {
    // SAFER default: pre-check NOTHING. Forces the groomer to actively
    // choose recipients (Select all is one click). Previously pre-checked
    // ALL which (a) made the "I want to text 1 person" flow confusing and
    // (b) let a single accidental Send blast every client at once.
    setMassSmsRecipients({})
    setMassSmsMessage('')
    setMassSmsResults(null)
    setMassSmsSearch('')
    setMassSmsSegment(null)
    // Load zones for the zone segment chips (mobile groomers). Fire-and-forget.
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: z } = await supabase
          .from('zones')
          .select('id, name, zips')
          .eq('groomer_id', user.id)
        setZonesList(z || [])
      } catch (e) { /* zone chips just won't show */ }
    })()
    // 📈 Load recent blasts + booked-within-7-days stats. Fire-and-forget —
    // history is a nice-to-have, never blocks composing a new blast.
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: blasts } = await supabase
          .from('sms_blasts')
          .select('id, sent_at, message, segment_key, recipient_ids, recipient_count')
          .eq('groomer_id', user.id)
          .order('sent_at', { ascending: false })
          .limit(4)
        if (!blasts || blasts.length === 0) { setMassSmsHistory([]); return }
        // For each blast: appointments CREATED by those clients in the 7 days
        // after the blast = bookings the text likely drove.
        const enriched = await Promise.all(blasts.map(async (b) => {
          try {
            const windowEnd = new Date(new Date(b.sent_at).getTime() + 7 * 86400000).toISOString()
            const { data: booked } = await supabase
              .from('appointments')
              .select('id, client_id, quoted_price, final_price')
              .eq('groomer_id', user.id)
              .in('client_id', (b.recipient_ids || []).slice(0, 200))
              .gte('created_at', b.sent_at)
              .lte('created_at', windowEnd)
              .neq('status', 'cancelled')
            const uniqueClients = {}
            let revenue = 0
            ;(booked || []).forEach((a) => {
              uniqueClients[a.client_id] = true
              revenue += parseFloat(a.final_price != null ? a.final_price : (a.quoted_price || 0)) || 0
            })
            return { ...b, bookedClients: Object.keys(uniqueClients).length, bookedAppts: (booked || []).length, revenue }
          } catch (e) {
            return { ...b, bookedClients: null, bookedAppts: null, revenue: null }
          }
        }))
        setMassSmsHistory(enriched)
      } catch (e) {
        setMassSmsHistory([])  // table may not exist yet — section just hides
      }
    })()
    // Belt-and-suspenders — reset spinner in case a previous send threw
    // before reaching the final setMassSmsSending(false). Without this,
    // the Send button stays permanently greyed.
    setMassSmsSending(false)
    setShowMassSms(true)
  }

  function closeMassSms() {
    if (massSmsSending) return
    setShowMassSms(false)
    setMassSmsResults(null)
    setMassSmsSearch('')
    setMassSmsSending(false)
  }

  // Search-filtered eligible list — drives the visible recipient rows AND
  // the Select all / Clear all buttons (so "search Smith → Select all"
  // ONLY checks the matching Smiths, leaving everyone else untouched).
  function filterSmsList(list) {
    const q = massSmsSearch.toLowerCase().trim()
    if (!q) return list
    const qDigits = q.replace(/[^0-9]/g, '')
    return list.filter(function (c) {
      const fullName = ((c.first_name || '') + ' ' + (c.last_name || '')).toLowerCase()
      if (fullName.includes(q)) return true
      const phoneDigits = (c.phone || '').replace(/[^0-9]/g, '')
      if (qDigits.length >= 3 && phoneDigits.includes(qDigits)) return true
      return false
    })
  }

  // ─── 🎯 Quick segment definitions ─────────────────────────────────────
  // Each segment is a label + test(client) → bool, computed from clientMeta
  // (already built for the page chips) + zones. Counts render on the chips;
  // tapping one selects EXACTLY its members (everyone else unchecked).
  const clientZipOf = (c) => {
    // ZIP = LAST 5-digit group in the address (street numbers can be 5 digits)
    const m = String(c.address || '').match(/\b(\d{5})(?:-\d{4})?\b/g)
    return m && m.length > 0 ? m[m.length - 1].slice(0, 5) : null
  }
  const smsSegments = (() => {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    const cut = new Date(t); cut.setDate(cut.getDate() - 56) // 8 weeks
    const cutStr = cut.getFullYear() + '-' + String(cut.getMonth() + 1).padStart(2, '0') + '-' + String(cut.getDate()).padStart(2, '0')
    const segs = [
      {
        key: 'lapsed',
        label: '😴 Lapsed 8+ wks',
        hint: 'Visited before, but not in 8+ weeks, and nothing booked — your win-back list',
        test: (c) => { const m = clientMeta[c.id]; return !!(m && m.lastVisit && m.lastVisit <= cutStr && !m.hasUpcoming) },
      },
      {
        key: 'noupcoming',
        label: '📅 Nothing booked',
        hint: 'No upcoming appointment on the calendar',
        test: (c) => { const m = clientMeta[c.id]; return !m || !m.hasUpcoming },
      },
      {
        key: 'vax',
        label: '💉 Vax expiring',
        hint: 'A pet\'s vaccination is expired or expires within 30 days',
        test: (c) => { const m = clientMeta[c.id]; return !!(m && m.vaxAlert) },
      },
      {
        key: 'balance',
        label: '💰 Balance due',
        hint: 'Owes money on a past appointment',
        test: (c) => { const m = clientMeta[c.id]; return !!(m && m.balance > 0.01) },
      },
    ]
    // One chip per service zone (mobile groomers) — matched by address ZIP
    ;(zonesList || []).forEach((z) => {
      if (!Array.isArray(z.zips) || z.zips.length === 0) return
      segs.push({
        key: 'zone-' + z.id,
        label: '🗺️ ' + z.name,
        hint: 'Clients whose address ZIP is in the ' + z.name + ' zone',
        test: (c) => { const zip = clientZipOf(c); return !!(zip && z.zips.indexOf(zip) !== -1) },
      })
    })
    return segs
  })()
  const applySmsSegment = (seg) => {
    setMassSmsSegment(seg.key)
    // Explicit true/false for EVERY eligible client — undefined counts as
    // checked in this modal, so non-members must be set false explicitly.
    setMassSmsRecipients(() => {
      const next = {}
      smsEligible.forEach((c) => { next[c.id] = !!seg.test(c) })
      return next
    })
  }

  const selectedSmsCount = smsEligible.filter(c => massSmsRecipients[c.id] !== false).length
  const smsRemaining = massSmsQuota.founder ? Infinity : (massSmsQuota.remaining ?? 0)
  const overQuota = !massSmsQuota.founder && selectedSmsCount > smsRemaining

  async function handleMassSmsSend() {
    if (!massSmsMessage.trim()) { window.alert('Type a message first.'); return }
    const recipients = smsEligible.filter(c => massSmsRecipients[c.id] !== false)
    if (recipients.length === 0) { window.alert('No recipients selected.'); return }
    if (overQuota) {
      window.alert('Not enough SMS credits. You have ' + smsRemaining + ' remaining but selected ' + recipients.length + '. Reduce recipients or upgrade your plan.')
      return
    }
    if (!window.confirm('Send this SMS to ' + recipients.length + ' client' + (recipients.length === 1 ? '' : 's') + '?\n\n"' + massSmsMessage + '"\n\nThis will use ' + recipients.length + ' of your monthly SMS credits.')) return

    setMassSmsSending(true)
    const { data: { user } } = await supabase.auth.getUser()
    const results = { sent: 0, failed: 0, errors: [] }
    const msgText = massSmsMessage.trim()
    const sentIds = []  // 📈 successful recipients — logged to sms_blasts after the loop

    for (const r of recipients) {
      try {
        const { data: smsRes, error: smsErr } = await supabase.functions.invoke('send-sms', {
          body: { to: r.phone, message: msgText, groomer_id: user.id, sms_type: 'manual' },
        })
        if (smsErr || (smsRes && smsRes.success === false)) {
          results.failed++
          const errMsg = (smsRes && smsRes.error) || (smsErr && smsErr.message) || 'SMS failed'
          const rName = (r.first_name || '') + ' ' + (r.last_name || '')
          results.errors.push(rName.trim() + ': ' + errMsg)
          // Out of credits mid-loop → stop. Avoids burning ourselves on retries.
          if (smsRes && smsRes.code === 'OUT_OF_QUOTA') {
            results.errors.push('— Stopped (out of credits).')
            break
          }
          continue
        }
        results.sent++
        sentIds.push(r.id)
        // Best-effort: mirror into in-app threads tagged [SMS] so the
        // conversation history stays unified. Non-fatal if it fails.
        try {
          let { data: thread } = await supabase
            .from('threads')
            .select('id')
            .eq('groomer_id', user.id)
            .eq('client_id', r.id)
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle()
          let threadId = thread && thread.id
          if (!threadId) {
            const { data: newThread } = await supabase
              .from('threads')
              .insert({ groomer_id: user.id, client_id: r.id, subject: null })
              .select('id')
              .single()
            threadId = newThread && newThread.id
          }
          if (threadId) {
            await supabase.from('messages').insert({
              thread_id: threadId,
              groomer_id: user.id,
              client_id: r.id,
              sender_type: 'groomer',
              text: '[SMS] ' + msgText,
              read_by_groomer: true,
              read_by_client: false,
            })
          }
        } catch (mirrorErr) {
          console.warn('[clients-mass-sms] mirror-to-inapp failed (non-fatal):', mirrorErr)
        }
      } catch (err) {
        results.failed++
        const rName = (r.first_name || '') + ' ' + (r.last_name || '')
        results.errors.push(rName.trim() + ': ' + (err.message || 'Unknown error'))
      }
    }

    // 📈 Log the blast so "did it work?" stats can be shown later.
    // Best-effort — a logging failure never affects the send results.
    if (sentIds.length > 0) {
      try {
        await supabase.from('sms_blasts').insert({
          groomer_id: user.id,
          message: msgText,
          segment_key: massSmsSegment || null,
          recipient_ids: sentIds,
          recipient_count: sentIds.length,
        })
      } catch (e) {
        console.warn('[mass-sms] blast log failed (non-fatal):', e)
      }
    }

    // Refresh quota so meter is correct if she reopens
    try {
      const { data: balAfter } = await supabase
        .from('groomer_sms_balance')
        .select('monthly_sms_remaining, monthly_sms_total, founder_unlimited_sms')
        .eq('groomer_id', user.id)
        .maybeSingle()
      setMassSmsQuota({
        remaining: balAfter?.monthly_sms_remaining ?? 0,
        total: balAfter?.monthly_sms_total ?? 0,
        founder: !!balAfter?.founder_unlimited_sms,
        loaded: true,
      })
    } catch (e) { /* non-fatal */ }

    setMassSmsResults(results)
    setMassSmsSending(false)
  }

  // ── Filter chip helpers ─────────────────────────────────────────────
  const NEW_DAYS = 30
  const LAPSED_DAYS = 60
  const isNewClient = (c) => {
    if (!c.created_at) return false
    return (Date.now() - new Date(c.created_at).getTime()) / 86400000 <= NEW_DAYS
  }
  const isLapsed = (c) => {
    if (c.is_active === false) return false
    const m = clientMeta[c.id]
    if (!m || !m.lastVisit) return false
    return (Date.now() - new Date(m.lastVisit + 'T00:00:00').getTime()) / 86400000 > LAPSED_DAYS
  }
  // Does a client pass the currently-selected chip?
  const passesFilter = (c) => {
    const m = clientMeta[c.id] || {}
    switch (activeFilter) {
      case 'overdue': return !!m.overdue
      case 'balance': return (m.balance || 0) > 0.01
      case 'no_upcoming': return c.is_active !== false && !m.hasUpcoming
      case 'has_upcoming': return !!m.hasUpcoming
      case 'inactive': return c.is_active === false
      case 'new': return isNewClient(c)
      case 'lapsed': return isLapsed(c)
      case 'vax': return !!m.vaxAlert
      default: return true
    }
  }

  const filteredClients = clients.filter((client) => {
    // Hide inactive unless the toggle is on OR the Inactive chip is selected.
    if (client.is_active === false && !showInactive && activeFilter !== 'inactive') return false
    // Apply the selected filter chip.
    if (!passesFilter(client)) return false

    const q = search.toLowerCase().trim()
    if (!q) return true
    const fullName = `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase()
    const phone = (client.phone || '')
    const email = (client.email || '').toLowerCase()
    const petNames = (client.pets || []).map(p => (p.name || '').toLowerCase()).join(' ')

    // Phone-aware search — strip non-digits on both sides so "7130983746",
    // "713-098-3746", and "(713) 098-3746" all match the same number.
    const qDigits = q.replace(/[^0-9]/g, '')
    const phoneDigits = phone.replace(/[^0-9]/g, '')
    const phoneMatches = qDigits.length >= 3 && phoneDigits.includes(qDigits)

    return fullName.includes(q) || phoneMatches || phone.includes(q) || email.includes(q) || petNames.includes(q)
  })

  // Counts for each chip (over all clients, ignoring the active chip so the
  // numbers stay stable as you click around).
  const filterCounts = {
    overdue: clients.filter(c => clientMeta[c.id]?.overdue).length,
    balance: clients.filter(c => (clientMeta[c.id]?.balance || 0) > 0.01).length,
    no_upcoming: clients.filter(c => c.is_active !== false && !clientMeta[c.id]?.hasUpcoming).length,
    has_upcoming: clients.filter(c => clientMeta[c.id]?.hasUpcoming).length,
    inactive: clients.filter(c => c.is_active === false).length,
    new: clients.filter(isNewClient).length,
    lapsed: clients.filter(isLapsed).length,
    vax: clients.filter(c => clientMeta[c.id]?.vaxAlert).length,
  }
  const FILTER_CHIPS = [
    { key: 'all', label: 'All' },
    { key: 'overdue', label: '⏰ Overdue' },
    { key: 'balance', label: '💸 Owes' },
    { key: 'no_upcoming', label: '📭 No upcoming' },
    { key: 'has_upcoming', label: '📅 Upcoming' },
    { key: 'lapsed', label: '🥀 Lapsed' },
    { key: 'new', label: '✨ New' },
    { key: 'vax', label: '💉 Vax due' },
    { key: 'inactive', label: '💤 Inactive' },
  ]

  const activeCount = clients.filter(c => c.is_active !== false).length
  const inactiveCount = clients.filter(c => c.is_active === false).length

  if (loading) return <div className="loading">Loading clients...</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p>{activeCount} active {inactiveCount > 0 && <span style={{ color: '#9ca3af' }}>· {inactiveCount} inactive</span>}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Mass SMS — ALL tiers. Basic now includes 500 SMS/month, so the
              tier gate is gone; the monthly quota (enforced by send-sms +
              shown in the modal's meter) is the only limit. */}
          {subscriptionTier ? (
            <button
              onClick={openMassSms}
              className="btn-secondary"
              style={{
                background: '#7c3aed',
                color: '#fff',
                border: 'none',
                padding: '10px 16px',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Send an SMS to every consented client at once"
            >📱 Mass SMS</button>
          ) : null}
          <Link to="/clients/new" className="btn-primary">+ Add Client</Link>
        </div>
      </div>

      {/* 🔋 SMS top-up result banner (Stripe redirect lands here) */}
      {smsTopupToast && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
          padding: '12px 14px', background: '#f0fdf4', border: '1px solid #86efac',
          borderRadius: '10px', marginBottom: '12px', fontSize: '13px', color: '#166534', fontWeight: 600,
        }}>
          <span>{smsTopupToast}</span>
          <button onClick={() => setSmsTopupToast('')} style={{ background: 'none', border: 'none', color: '#166534', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
      )}

      <div className="search-bar" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        {inactiveCount > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive ({inactiveCount})
          </label>
        )}
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', marginBottom: '6px' }}>
        {FILTER_CHIPS.map(function (f) {
          const count = f.key === 'all' ? clients.length : (filterCounts[f.key] || 0)
          const isActive = activeFilter === f.key
          return (
            <button
              key={f.key}
              onClick={function () { setActiveFilter(f.key) }}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                border: isActive ? '1px solid #7c3aed' : '1px solid #e5e7eb',
                background: isActive ? '#7c3aed' : '#fff',
                color: isActive ? '#fff' : '#374151',
              }}
            >
              {f.label}{f.key !== 'all' ? ' (' + count + ')' : ''}
            </button>
          )
        })}
      </div>

      {filteredClients.length === 0 ? (
        <div className="empty-state">
          <p>{clients.length === 0 ? 'No clients yet. Add your first client!' : 'No clients match your search.'}</p>
        </div>
      ) : (
        <div className="client-list">
          {filteredClients.map((client) => (
            <Link
              to={`/clients/${client.id}`}
              key={client.id}
              className="client-card"
              style={client.is_active === false ? { opacity: 0.6 } : {}}
            >
              <div className="client-card-header">
                <h3>{client.first_name} {client.last_name}</h3>
                {client.is_active === false && (
                  <span style={{
                    marginLeft: '8px',
                    padding: '2px 8px',
                    background: '#f3f4f6',
                    color: '#6b7280',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: '700',
                  }}>💤 INACTIVE</span>
                )}
                {client.is_first_time && <span className="badge badge-new">New Client</span>}
              </div>
              <p className="client-phone">{formatPhone(client.phone)}</p>
              {client.pets && client.pets.length > 0 && (
                <div className="client-pets-preview">
                  {client.pets.map((pet) => (
                    <span key={pet.id} className="pet-tag">{pet.name} ({pet.breed})</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* ─── Mass SMS Modal — pro+ only, real Twilio texts ─────────────
          Differs from Calendar's Mass SMS: targets ALL consented clients
          (not just one day's appointments). Reserved for shop-wide
          announcements — new phone #, holiday closure, etc. */}
      {showMassSms && (
        <div
          onClick={closeMassSms}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.55)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '14px', padding: '22px',
              width: '100%', maxWidth: '560px', maxHeight: '92vh',
              overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>📱 Mass SMS — All Clients</h2>
              <button onClick={closeMassSms} disabled={massSmsSending} style={{ background: 'none', border: 'none', fontSize: '22px', color: '#6b7280', cursor: massSmsSending ? 'not-allowed' : 'pointer', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <p style={{ margin: '0 0 10px', color: '#6b7280', fontSize: '13px' }}>
              Sends a real text to clients who've opted in to SMS. Search by name, check who you want, type your message, send. Nothing pre-checked — pick recipients first (or hit "Select all" for shop-wide news).
            </p>

            {/* Quota meter */}
            <div style={{
              padding: '10px 14px',
              background: massSmsQuota.founder ? '#f0fdf4' : (overQuota ? '#fee2e2' : '#f5f3ff'),
              border: '1px solid ' + (massSmsQuota.founder ? '#bbf7d0' : (overQuota ? '#fca5a5' : '#c4b5fd')),
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              color: massSmsQuota.founder ? '#166534' : (overQuota ? '#991b1b' : '#5b21b6'),
              marginBottom: '14px',
            }}>
              {massSmsQuota.founder ? (
                <span>🎉 Founder unlimited — no quota</span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' }}>
                  <span>
                    {overQuota ? '⚠️ ' : '💜 '}
                    {smsRemaining}/{massSmsQuota.total} SMS left this month · sending to {selectedSmsCount}
                    {overQuota && ' (over by ' + (selectedSmsCount - smsRemaining) + ')'}
                  </span>
                  {/* 🔋 One-time top-up — no subscription trap. Loud when
                      they're short, quiet otherwise. */}
                  <button
                    type="button"
                    onClick={buySmsTopup}
                    disabled={smsTopupBuying}
                    style={{
                      padding: '5px 10px',
                      background: overQuota || smsRemaining < 100 ? '#7c3aed' : '#fff',
                      color: overQuota || smsRemaining < 100 ? '#fff' : '#7c3aed',
                      border: '1px solid #7c3aed',
                      borderRadius: '999px',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: smsTopupBuying ? 'wait' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    title="One-time purchase — adds 500 texts to this month's balance instantly. No subscription."
                  >
                    {smsTopupBuying ? 'Opening checkout…' : '🔋 +500 texts — $10'}
                  </button>
                </span>
              )}
            </div>

            {/* Results screen (after send) */}
            {massSmsResults ? (
              <div>
                <div style={{
                  padding: '12px 14px',
                  background: massSmsResults.failed === 0 ? '#f0fdf4' : '#fff7ed',
                  border: '1px solid ' + (massSmsResults.failed === 0 ? '#86efac' : '#fdba74'),
                  borderRadius: '10px',
                  marginBottom: '12px',
                  color: massSmsResults.failed === 0 ? '#166534' : '#9a3412',
                }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                    {massSmsResults.failed === 0 ? '✅ All sent!' : '⚠️ Done with some failures'}
                  </div>
                  <div style={{ fontSize: '13px' }}>
                    {massSmsResults.sent} sent · {massSmsResults.failed} failed
                  </div>
                </div>
                {massSmsResults.errors.length > 0 && (
                  <div style={{
                    padding: '10px 12px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#991b1b',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    marginBottom: '12px',
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>Errors:</div>
                    {massSmsResults.errors.map(function (e, i) {
                      return <div key={i}>• {e}</div>
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={closeMassSms} style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Done</button>
                </div>
              </div>
            ) : (
              <>
                {/* No eligible recipients — empty-state */}
                {smsEligible.length === 0 ? (
                  <div style={{
                    padding: '14px',
                    background: '#fef3c7',
                    border: '1px solid #fbbf24',
                    borderRadius: '10px',
                    color: '#92400e',
                    fontSize: '13px',
                    marginBottom: '12px',
                  }}>
                    No clients are opted in to SMS yet. Open a client's profile and check "📱 Consent to text messages" to enable Mass SMS for them.
                    {smsIneligibleNoConsent.length > 0 && (
                      <div style={{ marginTop: '6px' }}>
                        ({smsIneligibleNoConsent.length} client{smsIneligibleNoConsent.length === 1 ? '' : 's'} with a phone but no consent.)
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Recipient list — checkbox per eligible client */}
                    {(() => {
                      const visibleEligible = filterSmsList(smsEligible)
                      const isSearching = massSmsSearch.trim().length > 0
                      return (
                        <>
                          <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            Recipients ({selectedSmsCount}/{smsEligible.length})
                            {isSearching && (
                              <span style={{ marginLeft: '6px', color: '#7c3aed', textTransform: 'none', letterSpacing: 'normal', fontWeight: 600 }}>
                                · showing {visibleEligible.length} match{visibleEligible.length === 1 ? '' : 'es'}
                              </span>
                            )}
                          </div>

                          {/* 🎯 Quick segments — one tap selects a smart group.
                              Counts show how many eligible clients match. Chips
                              with zero matches render dimmed + unclickable. */}
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px', alignItems: 'center' }}>
                            {smsSegments.map(function (seg) {
                              const count = smsEligible.filter(seg.test).length
                              const active = massSmsSegment === seg.key
                              return (
                                <button
                                  key={seg.key}
                                  type="button"
                                  disabled={massSmsSending || count === 0}
                                  onClick={function () { applySmsSegment(seg) }}
                                  title={count === 0 ? 'No clients match this right now' : seg.hint}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '999px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: count === 0 ? 'default' : 'pointer',
                                    opacity: count === 0 ? 0.4 : 1,
                                    border: active ? '1px solid #7c3aed' : '1px solid #e5e7eb',
                                    background: active ? '#7c3aed' : '#fff',
                                    color: active ? '#fff' : '#374151',
                                  }}
                                >{seg.label} · {count}</button>
                              )
                            })}
                            {massSmsSegment && (
                              <button
                                type="button"
                                onClick={function () { setMassSmsSegment(null); setMassSmsRecipients({}) }}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '999px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  border: '1px solid #e5e7eb',
                                  background: '#f3f4f6',
                                  color: '#6b7280',
                                }}
                                title="Reset — select everyone again"
                              >↺ Everyone</button>
                            )}
                          </div>

                          {/* Search box — name or phone, case-insensitive */}
                          <div style={{ position: 'relative', marginBottom: '8px' }}>
                            <input
                              type="text"
                              value={massSmsSearch}
                              onChange={(e) => setMassSmsSearch(e.target.value)}
                              placeholder="🔍 Search clients by name or phone…"
                              disabled={massSmsSending}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                fontSize: '13px',
                                boxSizing: 'border-box',
                              }}
                            />
                            {isSearching && (
                              <button
                                type="button"
                                onClick={() => setMassSmsSearch('')}
                                style={{
                                  position: 'absolute',
                                  right: '8px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  background: 'none',
                                  border: 'none',
                                  color: '#6b7280',
                                  fontSize: '18px',
                                  cursor: 'pointer',
                                  padding: 0,
                                  lineHeight: 1,
                                }}
                                title="Clear search"
                              >×</button>
                            )}
                          </div>

                          <div style={{
                            maxHeight: '180px',
                            overflowY: 'auto',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            marginBottom: '12px',
                          }}>
                            {visibleEligible.length === 0 ? (
                              <div style={{ padding: '14px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                                No matches for "{massSmsSearch}"
                              </div>
                            ) : visibleEligible.map(function (c) {
                              const checked = massSmsRecipients[c.id] !== false
                              return (
                                <label key={c.id} style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '8px 12px',
                                  borderBottom: '1px solid #f1f5f9',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => setMassSmsRecipients(prev => ({ ...prev, [c.id]: e.target.checked }))}
                                    style={{ accentColor: '#7c3aed' }}
                                  />
                                  <span style={{ flex: 1 }}>
                                    {c.first_name} {c.last_name}
                                    <span style={{ color: '#9ca3af', marginLeft: '6px', fontSize: '12px' }}>{formatPhone(c.phone)}</span>
                                  </span>
                                </label>
                              )
                            })}
                          </div>

                          {/* Quick toggles — operate on the VISIBLE filtered list when
                              searching, so "search Smith → Select all" only checks
                              the Smiths and leaves everyone else as they were. */}
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={function () {
                                setMassSmsRecipients(prev => {
                                  const next = { ...prev }
                                  visibleEligible.forEach(function (c) { next[c.id] = true })
                                  return next
                                })
                              }}
                              style={{ padding: '6px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                            >{isSearching ? 'Select matches' : 'Select all'}</button>
                            <button
                              type="button"
                              onClick={function () {
                                setMassSmsRecipients(prev => {
                                  const next = { ...prev }
                                  visibleEligible.forEach(function (c) { next[c.id] = false })
                                  return next
                                })
                              }}
                              style={{ padding: '6px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                            >{isSearching ? 'Clear matches' : 'Clear all'}</button>
                            {smsIneligibleNoConsent.length > 0 && (
                              <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#9ca3af', alignSelf: 'center' }}>
                                {smsIneligibleNoConsent.length} client{smsIneligibleNoConsent.length === 1 ? '' : 's'} hidden (no SMS consent)
                              </span>
                            )}
                          </div>
                        </>
                      )
                    })()}

                    {/* Message textarea */}
                    <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Message
                    </div>
                    <textarea
                      value={massSmsMessage}
                      onChange={(e) => setMassSmsMessage(e.target.value)}
                      placeholder="Hey! We have a new phone number — please save 555-867-5309. Thanks! — Your shop"
                      rows={4}
                      disabled={massSmsSending}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        marginBottom: '6px',
                      }}
                    />
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '14px' }}>
                      {massSmsMessage.length} characters · {massSmsMessage.length > 160 ? Math.ceil(massSmsMessage.length / 153) + ' SMS segments per recipient' : '1 SMS segment per recipient'}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button onClick={closeMassSms} disabled={massSmsSending} style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: 600, cursor: massSmsSending ? 'not-allowed' : 'pointer' }}>Cancel</button>
                      <button
                        onClick={handleMassSmsSend}
                        disabled={massSmsSending || selectedSmsCount === 0 || !massSmsMessage.trim() || overQuota}
                        title={
                          massSmsSending ? 'A send is already in progress' :
                          selectedSmsCount === 0 ? 'Pick at least one recipient first' :
                          !massSmsMessage.trim() ? 'Type a message first' :
                          overQuota ? 'Selected more recipients than your remaining SMS credits' :
                          'Send SMS to ' + selectedSmsCount + ' client(s)'
                        }
                        style={{
                          padding: '10px 18px',
                          background: (massSmsSending || selectedSmsCount === 0 || !massSmsMessage.trim() || overQuota) ? '#9ca3af' : '#7c3aed',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 700,
                          cursor: (massSmsSending || selectedSmsCount === 0 || !massSmsMessage.trim() || overQuota) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {massSmsSending ? 'Sending…' : '📱 Send to ' + selectedSmsCount}
                      </button>
                    </div>

                    {/* 📈 Recent blasts — proof the texts make money. For each
                        past blast: recipients texted, how many of them booked
                        within 7 days, and est. revenue from those bookings. */}
                    {massSmsHistory && massSmsHistory.length > 0 && (
                      <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid #e5e7eb' }}>
                        <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          📈 Recent blasts — did they work?
                        </div>
                        {massSmsHistory.map(function (b) {
                          const when = new Date(b.sent_at)
                          const whenLabel = when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                            ' ' + when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                          const isFresh = (Date.now() - when.getTime()) < 7 * 86400000
                          return (
                            <div key={b.id} style={{ padding: '8px 10px', border: '1px solid #f1f5f9', borderRadius: '8px', marginBottom: '6px', fontSize: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: '#6b7280' }}>
                                  {whenLabel} · {b.recipient_count} texted
                                </span>
                                {b.bookedClients != null && (
                                  <span style={{ fontWeight: 700, color: b.bookedClients > 0 ? '#16a34a' : '#9ca3af' }}>
                                    {b.bookedClients > 0
                                      ? '✓ ' + b.bookedClients + ' booked' +
                                        (b.revenue > 0 ? ' · ~$' + Math.round(b.revenue) : '')
                                      : isFresh ? 'no bookings yet' : 'no bookings'}
                                    {isFresh && b.bookedClients > 0 ? ' (so far)' : ''}
                                  </span>
                                )}
                              </div>
                              <div style={{ color: '#9ca3af', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                "{b.message}"
                              </div>
                            </div>
                          )
                        })}
                        <div style={{ fontSize: '10.5px', color: '#9ca3af' }}>
                          Counts bookings made within 7 days of each blast by the clients who got it.
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
