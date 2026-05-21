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

  // ===== Mass SMS to ALL clients (pro+ only) =====
  // Different from Calendar's Mass SMS (that one filters by day's appts).
  // This one targets every consented + active client — use for big shop
  // announcements: "We're moving!", new phone #, holiday closure, etc.
  const [subscriptionTier, setSubscriptionTier] = useState(null)
  const [showMassSms, setShowMassSms] = useState(false)
  const [massSmsMessage, setMassSmsMessage] = useState('')
  const [massSmsRecipients, setMassSmsRecipients] = useState({}) // { clientId: bool }
  const [massSmsSending, setMassSmsSending] = useState(false)
  const [massSmsResults, setMassSmsResults] = useState(null) // { sent, failed, errors }
  const [massSmsQuota, setMassSmsQuota] = useState({ remaining: null, total: null, founder: false, loaded: false })
  // Inside-modal search — for when you have lots of clients and only want
  // to text a handful. Filters the visible list but doesn't unselect
  // anyone already checked outside the current view.
  const [massSmsSearch, setMassSmsSearch] = useState('')

  useEffect(() => {
    fetchClients()
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

  const filteredClients = clients.filter((client) => {
    // Hide inactive clients unless the toggle is on
    if (!showInactive && client.is_active === false) return false
    const q = search.toLowerCase().trim()
    if (!q) return true
    const fullName = `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase()
    const phone = (client.phone || '')
    const email = (client.email || '').toLowerCase()
    const petNames = (client.pets || []).map(p => (p.name || '').toLowerCase()).join(' ')

    // Phone-aware search — if the search term looks like digits (with or
    // without dashes/spaces/parens), strip everything except digits on both
    // sides before comparing. So "7130983746", "713-098-3746", and
    // "(713) 098-3746" all match the same stored number.
    const qDigits = q.replace(/[^0-9]/g, '')
    const phoneDigits = phone.replace(/[^0-9]/g, '')
    const phoneMatches = qDigits.length >= 3 && phoneDigits.includes(qDigits)

    return fullName.includes(q) || phoneMatches || phone.includes(q) || email.includes(q) || petNames.includes(q)
  })

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
          {/* Mass SMS — pro+ only. Basic tier sees the button with an
              upgrade prompt instead of opening the modal. Big shop news
              ("we have a new number!") needs real Twilio, not in-app msgs. */}
          {subscriptionTier && subscriptionTier !== 'basic' ? (
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
          ) : subscriptionTier === 'basic' ? (
            <button
              onClick={function () {
                window.alert('Mass SMS requires a Pro plan or higher. Upgrade in Settings → Billing to unlock texting all clients at once.')
              }}
              style={{
                background: '#f3f4f6',
                color: '#6b7280',
                border: '1px solid #e5e7eb',
                padding: '10px 16px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Pro plan unlocks Mass SMS"
            >🔒 Mass SMS (Pro+)</button>
          ) : null}
          <Link to="/clients/new" className="btn-primary">+ Add Client</Link>
        </div>
      </div>

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
                <span>
                  {overQuota ? '⚠️ ' : '💜 '}
                  {smsRemaining}/{massSmsQuota.total} SMS left this month · sending to {selectedSmsCount}
                  {overQuota && ' (over by ' + (selectedSmsCount - smsRemaining) + ')'}
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
