// =============================================================================
// PunchCards.jsx — Prepaid punch cards ("Buy 5 baths, get 1 free").
// =============================================================================
// Groomer side:
//   • Create punch card TYPES: name, covered services, # punches, price,
//     optional expiration in months.
//   • SELL one at the counter: pick a client, record how they paid
//     (cash/Zelle/Venmo/card), card is issued instantly.
//   • See every sold card with punches remaining.
//
// Redemption happens at checkout (Calendar → Take Payment suggests
// "Use punch 3 of 6?"). Portal online purchase is pass 2.
// =============================================================================
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY_FORM = {
  id: null,
  name: '',
  description: '',
  service_ids: [],
  total_punches: '6',
  price: '',
  expires_months: '',
  is_active: true,
}

const PAY_METHODS = ['cash', 'zelle', 'venmo', 'card', 'comp']

export default function PunchCards() {
  const [types, setTypes] = useState([])
  const [soldCards, setSoldCards] = useState([])
  const [services, setServices] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  // Sell flow state
  const [sellType, setSellType] = useState(null)      // the type being sold
  const [sellSearch, setSellSearch] = useState('')
  const [sellClient, setSellClient] = useState(null)
  const [sellMethod, setSellMethod] = useState('cash')
  const [selling, setSelling] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    await Promise.all([fetchTypes(user.id), fetchSold(user.id), fetchLookups(user.id)])
    setLoading(false)
  }

  async function fetchTypes(uid) {
    const { data } = await supabase
      .from('punch_card_types')
      .select('*')
      .eq('groomer_id', uid)
      .order('created_at', { ascending: false })
    setTypes(data || [])
  }

  async function fetchSold(uid) {
    const { data } = await supabase
      .from('punch_cards')
      .select('*, clients:client_id(first_name, last_name)')
      .eq('groomer_id', uid)
      .order('created_at', { ascending: false })
      .limit(50)
    setSoldCards(data || [])
  }

  async function fetchLookups(uid) {
    const [{ data: svc }, { data: cls }] = await Promise.all([
      supabase.from('services').select('id, service_name, price').eq('groomer_id', uid).eq('is_active', true).order('service_name'),
      supabase.from('clients').select('id, first_name, last_name, phone').eq('groomer_id', uid).order('last_name'),
    ])
    setServices(svc || [])
    setClients(cls || [])
  }

  function setF(patch) {
    setForm(function (f) { return Object.assign({}, f, patch) })
  }

  function toggleService(sid) {
    setF({
      service_ids: form.service_ids.indexOf(sid) !== -1
        ? form.service_ids.filter(function (x) { return x !== sid })
        : form.service_ids.concat(sid),
    })
  }

  function openEdit(t) {
    setForm({
      id: t.id,
      name: t.name || '',
      description: t.description || '',
      service_ids: Array.isArray(t.service_ids) ? t.service_ids : [],
      total_punches: String(t.total_punches || 6),
      price: t.price != null ? String(t.price) : '',
      expires_months: t.expires_months != null ? String(t.expires_months) : '',
      is_active: t.is_active !== false,
    })
    setShowForm(true)
  }

  async function saveType() {
    if (!form.name.trim()) { window.alert('Name the punch card first (e.g. "6 Baths — pay for 5!").'); return }
    if (form.service_ids.length === 0) { window.alert('Pick at least one service a punch can be used on.'); return }
    const punches = parseInt(form.total_punches, 10)
    if (!punches || punches < 1) { window.alert('How many punches does it come with?'); return }
    const price = parseFloat(form.price)
    if (isNaN(price) || price < 0) { window.alert('Set a price (what the client pays up front).'); return }
    setSaving(true)
    const payload = {
      groomer_id: userId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      service_ids: form.service_ids,
      total_punches: punches,
      price: price,
      expires_months: form.expires_months ? parseInt(form.expires_months, 10) : null,
      is_active: form.is_active,
    }
    let error
    if (form.id) {
      ;({ error } = await supabase.from('punch_card_types').update(payload).eq('id', form.id))
    } else {
      ;({ error } = await supabase.from('punch_card_types').insert([payload]))
    }
    setSaving(false)
    if (error) { window.alert('Could not save: ' + error.message); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchTypes(userId)
  }

  async function toggleActive(t) {
    const { error } = await supabase.from('punch_card_types').update({ is_active: !t.is_active }).eq('id', t.id)
    if (error) { window.alert('Could not update: ' + error.message); return }
    fetchTypes(userId)
  }

  // ─── Sell at the counter ───────────────────────────────────────────────
  function openSell(t) {
    setSellType(t)
    setSellSearch('')
    setSellClient(null)
    setSellMethod('cash')
  }

  async function confirmSell() {
    if (!sellType || !sellClient) return
    if (!window.confirm(
      'Sell "' + sellType.name + '" to ' + sellClient.first_name + ' ' + sellClient.last_name +
      ' for $' + sellType.price + ' (' + sellMethod + ')?\n\n' +
      sellType.total_punches + ' punches' +
      (sellType.expires_months ? ' · expires in ' + sellType.expires_months + ' months' : ' · never expires')
    )) return
    setSelling(true)
    let expiresAt = null
    if (sellType.expires_months) {
      const d = new Date()
      d.setMonth(d.getMonth() + sellType.expires_months)
      expiresAt = d.toISOString().slice(0, 10)
    }
    const { error } = await supabase.from('punch_cards').insert([{
      groomer_id: userId,
      client_id: sellClient.id,
      type_id: sellType.id,
      name: sellType.name,
      service_ids: sellType.service_ids,
      total_punches: sellType.total_punches,
      punches_remaining: sellType.total_punches,
      price_paid: sellType.price,
      payment_method: sellMethod,
      expires_at: expiresAt,
      status: 'active',
    }])
    setSelling(false)
    if (error) { window.alert('Could not record the sale: ' + error.message); return }
    setSellType(null)
    setSellClient(null)
    fetchSold(userId)
    window.alert('✅ Punch card sold! It will auto-suggest at checkout whenever ' + sellClient.first_name + ' books a covered service.')
  }

  const sellMatches = sellSearch.trim()
    ? clients.filter(function (c) {
        const n = ((c.first_name || '') + ' ' + (c.last_name || '')).toLowerCase()
        return n.includes(sellSearch.toLowerCase().trim())
      }).slice(0, 8)
    : []

  function serviceNames(ids) {
    return (ids || [])
      .map(function (id) { const s = services.find(function (x) { return x.id === id }); return s ? s.service_name : null })
      .filter(Boolean)
      .join(', ') || '(services no longer active)'
  }

  if (loading) return <div className="loading">Loading punch cards…</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🎟️ Punch Cards</h1>
          <p>Prepaid packages — "buy 5 baths, get 1 free." Clients pay once; punches auto-suggest at checkout.</p>
        </div>
        <button className="btn-primary" onClick={function () { setForm(EMPTY_FORM); setShowForm(true) }}>+ New Punch Card</button>
      </div>

      {/* ─── Card types ─── */}
      {types.length === 0 && !showForm ? (
        <div className="empty-state">
          <p>No punch cards yet. A classic: "6 baths for the price of 5" — upfront cash for you, a deal for them.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          {types.map(function (t) {
            return (
              <div key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', opacity: t.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ fontWeight: 700, color: '#111827' }}>
                      {t.name}
                      {!t.is_active && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af' }}>· paused</span>}
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151', marginTop: '4px' }}>
                      <strong>${t.price}</strong> for <strong>{t.total_punches} punches</strong>
                      {' · '}{t.expires_months ? 'expires ' + t.expires_months + ' months after purchase' : 'never expires'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      Covers: {serviceNames(t.service_ids)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={function () { openSell(t) }} disabled={!t.is_active}
                      style={{ padding: '7px 12px', background: t.is_active ? '#10b981' : '#e5e7eb', color: t.is_active ? '#fff' : '#9ca3af', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: t.is_active ? 'pointer' : 'not-allowed' }}>
                      💵 Sell to client
                    </button>
                    <button onClick={function () { toggleActive(t) }} style={{ padding: '7px 12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>
                      {t.is_active ? '⏸ Pause' : '▶️ Activate'}
                    </button>
                    <button onClick={function () { openEdit(t) }} style={{ background: 'transparent', border: 'none', color: '#7c3aed', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>✏️ Edit</button>
                  </div>
                </div>

                {/* Sell flow (inline) */}
                {sellType && sellType.id === t.id && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #d1d5db' }}>
                    {!sellClient ? (
                      <>
                        <label style={lbl}>Who's buying?</label>
                        <input type="text" value={sellSearch} onChange={function (e) { setSellSearch(e.target.value) }}
                          placeholder="Search client by name…" style={{ ...inp, marginBottom: '6px' }} autoFocus />
                        {sellMatches.map(function (c) {
                          return (
                            <div key={c.id} onClick={function () { setSellClient(c) }}
                              style={{ padding: '8px 10px', border: '1px solid #f1f5f9', borderRadius: '8px', marginBottom: '4px', cursor: 'pointer', fontSize: '13px' }}>
                              <strong>{c.first_name} {c.last_name}</strong>
                              {c.phone && <span style={{ color: '#9ca3af', marginLeft: '6px', fontSize: '12px' }}>{c.phone}</span>}
                            </div>
                          )
                        })}
                        <button onClick={function () { setSellType(null) }} style={{ marginTop: '4px', background: 'transparent', border: 'none', color: '#6b7280', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: '13px', marginBottom: '8px' }}>
                          Selling to <strong>{sellClient.first_name} {sellClient.last_name}</strong> for <strong>${t.price}</strong>
                          <button onClick={function () { setSellClient(null) }} style={{ marginLeft: '8px', background: 'transparent', border: 'none', color: '#7c3aed', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>change</button>
                        </div>
                        <label style={lbl}>How did they pay?</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                          {PAY_METHODS.map(function (m) {
                            return (
                              <button key={m} type="button" onClick={function () { setSellMethod(m) }}
                                style={{ padding: '7px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: sellMethod === m ? '1px solid #7c3aed' : '1px solid #e5e7eb', background: sellMethod === m ? '#7c3aed' : '#fff', color: sellMethod === m ? '#fff' : '#374151', textTransform: 'capitalize' }}>
                                {m === 'comp' ? '🎁 comp (free)' : m}
                              </button>
                            )
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={function () { setSellType(null); setSellClient(null) }} style={{ padding: '9px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                          <button onClick={confirmSell} disabled={selling}
                            style={{ padding: '9px 14px', background: selling ? '#a7f3d0' : '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                            {selling ? 'Recording…' : '✅ Record sale — $' + t.price}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Create / edit form ─── */}
      {showForm && (
        <div style={{ marginTop: '16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
          <h3 style={{ marginTop: 0 }}>{form.id ? 'Edit Punch Card' : 'New Punch Card'}</h3>

          <label style={lbl}>Name (clients see this)</label>
          <input type="text" value={form.name} onChange={function (e) { setF({ name: e.target.value }) }}
            placeholder='e.g. "6 Baths — pay for 5!"' style={inp} />

          <label style={lbl}>Which services can a punch be used on?</label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {services.map(function (s) {
              const on = form.service_ids.indexOf(s.id) !== -1
              return (
                <button key={s.id} type="button" onClick={function () { toggleService(s.id) }}
                  style={{ padding: '7px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: on ? '1px solid #7c3aed' : '1px solid #e5e7eb', background: on ? '#7c3aed' : '#fff', color: on ? '#fff' : '#374151' }}>
                  {s.service_name} (${s.price})
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <div>
              <label style={lbl}># of punches</label>
              <input type="number" min="1" value={form.total_punches} onChange={function (e) { setF({ total_punches: e.target.value }) }}
                style={{ ...inp, width: '110px', marginBottom: 0 }} />
            </div>
            <div>
              <label style={lbl}>Price (paid up front)</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={function (e) { setF({ price: e.target.value }) }}
                placeholder="150" style={{ ...inp, width: '130px', marginBottom: 0 }} />
            </div>
            <div>
              <label style={lbl}>Expires after (months, optional)</label>
              <input type="number" min="1" value={form.expires_months} onChange={function (e) { setF({ expires_months: e.target.value }) }}
                placeholder="never" style={{ ...inp, width: '150px', marginBottom: 0 }} />
            </div>
          </div>

          <label style={lbl}>Description for the portal (optional)</label>
          <input type="text" value={form.description} onChange={function (e) { setF({ description: e.target.value }) }}
            placeholder='e.g. "Keep that coat fresh all summer — one bath free!"' style={inp} />

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={function () { setShowForm(false); setForm(EMPTY_FORM) }} style={{ padding: '10px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={saveType} disabled={saving} style={{ padding: '10px 16px', background: saving ? '#a78bfa' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : '💾 Save Punch Card'}</button>
          </div>
        </div>
      )}

      {/* ─── Sold cards ─── */}
      {soldCards.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '16px', color: '#111827', marginBottom: '8px' }}>Sold cards</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {soldCards.map(function (pc) {
              const cname = pc.clients ? (pc.clients.first_name + ' ' + (pc.clients.last_name || '')) : '?'
              const pct = pc.total_punches > 0 ? (pc.punches_remaining / pc.total_punches) : 0
              return (
                <div key={pc.id} style={{ background: '#fff', border: '1px solid #f1f5f9', borderRadius: '10px', padding: '10px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <strong>{cname}</strong> · {pc.name}
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      ${pc.price_paid} ({pc.payment_method}) · {new Date(pc.purchased_at).toLocaleDateString()}
                      {pc.expires_at ? ' · expires ' + pc.expires_at : ''}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, color: pc.punches_remaining > 0 ? '#10b981' : '#9ca3af' }}>
                    {pc.punches_remaining}/{pc.total_punches} left
                  </div>
                  <div style={{ width: '90px', height: '8px', background: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: (pct * 100) + '%', height: '100%', background: '#10b981' }}></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

var lbl = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }
var inp = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '14px', fontSize: '14px' }
