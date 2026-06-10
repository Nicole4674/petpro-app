// =============================================================================
// Promos.jsx — Promo / Referral links the groomer creates.
// =============================================================================
// A promo = a reward in the groomer's own words ("Free nail filing!") + an
// optional auto-discount ($ or %) + per-promo choices:
//   • new clients only (referral promos) vs anyone (win-back promos)
//   • reward the referrer too (their own wording: "$5 off your next groom")
//
// Every active promo shows in each client's portal as a copyable share link:
//   /portal/signup?g=<groomerId>&promo=<CODE>&ref=<clientId>
// Friend signs up through it → books through Suds → reward auto-applies →
// referrer gets credited (note on their profile so the groomer honors it).
// =============================================================================
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY_FORM = {
  id: null,
  name: '',
  code: '',
  new_client_reward: '',
  discount_type: 'none',
  discount_value: '',
  new_clients_only: true,
  reward_referrer: false,
  referrer_reward: '',
  is_active: true,
  expires_at: '',
  max_uses: '',
}

// Generate a friendly code from the promo name ("Free Nail Filing" → NAILFIL24)
function suggestCode(name) {
  var base = (name || 'PROMO').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)
  if (!base) base = 'PROMO'
  return base + String(new Date().getFullYear()).slice(2)
}

export default function Promos() {
  const [promos, setPromos] = useState([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    await fetchPromos(user.id)
  }

  async function fetchPromos(uid) {
    setLoading(true)
    const { data } = await supabase
      .from('promos')
      .select('*')
      .eq('groomer_id', uid)
      .order('created_at', { ascending: false })
    setPromos(data || [])
    setLoading(false)
  }

  function openNew() {
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(p) {
    setForm({
      id: p.id,
      name: p.name || '',
      code: p.code || '',
      new_client_reward: p.new_client_reward || '',
      discount_type: p.discount_type || 'none',
      discount_value: p.discount_value != null && p.discount_value > 0 ? String(p.discount_value) : '',
      new_clients_only: p.new_clients_only !== false,
      reward_referrer: p.reward_referrer === true,
      referrer_reward: p.referrer_reward || '',
      is_active: p.is_active !== false,
      expires_at: p.expires_at || '',
      max_uses: p.max_uses != null ? String(p.max_uses) : '',
    })
    setShowForm(true)
  }

  function setF(patch) {
    setForm(function (f) { return Object.assign({}, f, patch) })
  }

  async function savePromo() {
    if (!form.name.trim()) { window.alert('Give the promo a name first (e.g. "Spring referral").'); return }
    if (!form.new_client_reward.trim()) { window.alert('Describe what the new client gets (e.g. "Free nail filing with your first groom!").'); return }
    var code = (form.code || suggestCode(form.name)).toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!code) { window.alert('The share code needs at least one letter or number.'); return }
    if (form.reward_referrer && !form.referrer_reward.trim()) {
      window.alert('You checked "reward the referrer" — describe what they get (e.g. "$5 off your next groom").')
      return
    }
    setSaving(true)
    var payload = {
      groomer_id: userId,
      name: form.name.trim(),
      code: code,
      new_client_reward: form.new_client_reward.trim(),
      discount_type: form.discount_type,
      discount_value: form.discount_type === 'none' ? 0 : (parseFloat(form.discount_value) || 0),
      new_clients_only: form.new_clients_only,
      reward_referrer: form.reward_referrer,
      referrer_reward: form.reward_referrer ? form.referrer_reward.trim() : null,
      is_active: form.is_active,
      expires_at: form.expires_at || null,
      max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
    }
    var error
    if (form.id) {
      ;({ error } = await supabase.from('promos').update(payload).eq('id', form.id))
    } else {
      ;({ error } = await supabase.from('promos').insert([payload]))
    }
    setSaving(false)
    if (error) {
      if (String(error.message).indexOf('idx_promos_groomer_code') !== -1 || String(error.message).toLowerCase().indexOf('duplicate') !== -1) {
        window.alert('You already have a promo with the code "' + code + '". Pick a different code.')
      } else {
        window.alert('Could not save promo: ' + error.message)
      }
      return
    }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchPromos(userId)
  }

  async function toggleActive(p) {
    const { error } = await supabase.from('promos').update({ is_active: !p.is_active }).eq('id', p.id)
    if (error) { window.alert('Could not update: ' + error.message); return }
    fetchPromos(userId)
  }

  async function deletePromo(p) {
    if (!window.confirm('Delete the "' + p.name + '" promo? Clients who already signed up with it keep their reward; the share link just stops working.')) return
    const { error } = await supabase.from('promos').delete().eq('id', p.id)
    if (error) { window.alert('Could not delete: ' + error.message); return }
    fetchPromos(userId)
  }

  // Copy the groomer's OWN share link (no referrer attached) — for posting
  // on Facebook/Instagram. Clients get their personal ref link in the portal.
  function copyShopLink(p) {
    var url = window.location.origin + '/portal/signup?g=' + userId + '&promo=' + encodeURIComponent(p.code)
    navigator.clipboard.writeText(url).then(function () {
      setCopiedId(p.id)
      setTimeout(function () { setCopiedId(null) }, 2000)
    }).catch(function () {
      window.prompt('Copy this link:', url)
    })
  }

  if (loading) return <div className="loading">Loading promos…</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🎁 Promos & Referrals</h1>
          <p>Create a reward, and every client gets a share link in their portal. Friends sign up through it and the reward auto-applies when they book.</p>
        </div>
        <button className="btn-primary" onClick={openNew}>+ New Promo</button>
      </div>

      {promos.length === 0 && !showForm ? (
        <div className="empty-state">
          <p>No promos yet. Try one like "Free nail filing for new clients" — your clients will share it for you.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
          {promos.map(function (p) {
            var expired = p.expires_at && p.expires_at < new Date().toISOString().slice(0, 10)
            var maxedOut = p.max_uses != null && p.use_count >= p.max_uses
            return (
              <div key={p.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', opacity: p.is_active && !expired && !maxedOut ? 1 : 0.6 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ fontWeight: 700, color: '#111827' }}>
                      {p.name}
                      <span style={{ marginLeft: '8px', padding: '2px 8px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '6px', color: '#7c3aed', fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em' }}>{p.code}</span>
                      {!p.is_active && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#9ca3af' }}>· paused</span>}
                      {expired && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#dc2626' }}>· expired</span>}
                      {maxedOut && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#dc2626' }}>· max uses reached</span>}
                    </div>
                    <div style={{ fontSize: '13px', color: '#374151', marginTop: '4px' }}>
                      🎁 New client gets: <strong>{p.new_client_reward}</strong>
                      {p.discount_type === 'amount' && p.discount_value > 0 && <span style={{ color: '#16a34a' }}> (auto −${p.discount_value})</span>}
                      {p.discount_type === 'percent' && p.discount_value > 0 && <span style={{ color: '#16a34a' }}> (auto −{p.discount_value}%)</span>}
                    </div>
                    {p.reward_referrer && (
                      <div style={{ fontSize: '13px', color: '#374151', marginTop: '2px' }}>
                        🤝 Referrer gets: <strong>{p.referrer_reward}</strong>
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      {p.new_clients_only ? 'New clients only' : 'Any client'}
                      {' · used ' + (p.use_count || 0) + (p.max_uses != null ? '/' + p.max_uses : '') + ' time' + ((p.use_count || 0) === 1 ? '' : 's')}
                      {p.expires_at ? ' · expires ' + p.expires_at : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={function () { copyShopLink(p) }} style={{ padding: '7px 12px', background: copiedId === p.id ? '#dcfce7' : '#7c3aed', color: copiedId === p.id ? '#166534' : '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                      {copiedId === p.id ? '✓ Copied' : '🔗 Copy link'}
                    </button>
                    <button onClick={function () { toggleActive(p) }} style={{ padding: '7px 12px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>
                      {p.is_active ? '⏸ Pause' : '▶️ Activate'}
                    </button>
                    <button onClick={function () { openEdit(p) }} style={{ background: 'transparent', border: 'none', color: '#7c3aed', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>✏️ Edit</button>
                    <button onClick={function () { deletePromo(p) }} style={{ background: 'transparent', border: 'none', color: '#dc2626', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>🗑️</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div style={{ marginTop: '16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
          <h3 style={{ marginTop: 0 }}>{form.id ? 'Edit Promo' : 'New Promo'}</h3>

          <label style={lbl}>Promo name (just for you)</label>
          <input type="text" value={form.name}
            onChange={function (e) {
              var patch = { name: e.target.value }
              if (!form.id && !form.code) patch.code = ''  // keep auto-suggest live until they type one
              setF(patch)
            }}
            placeholder='e.g. "Spring referral special"' style={inp} />

          <label style={lbl}>What does the NEW CLIENT get? (your words — shows on their signup + booking)</label>
          <input type="text" value={form.new_client_reward} onChange={function (e) { setF({ new_client_reward: e.target.value }) }}
            placeholder='e.g. "Free nail filing with your first groom!"' style={inp} />

          <label style={lbl}>Auto-discount at booking (optional)</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <select value={form.discount_type} onChange={function (e) { setF({ discount_type: e.target.value }) }}
              style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', background: '#fff', fontSize: '14px' }}>
              <option value="none">No price change — it's a freebie/add-on I'll honor</option>
              <option value="amount">$ off the booking</option>
              <option value="percent">% off the booking</option>
            </select>
            {form.discount_type !== 'none' && (
              <input type="number" min="0" value={form.discount_value} onChange={function (e) { setF({ discount_value: e.target.value }) }}
                placeholder={form.discount_type === 'amount' ? '10' : '15'}
                style={{ width: '110px', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
            <input type="checkbox" checked={form.new_clients_only} onChange={function (e) { setF({ new_clients_only: e.target.checked }) }} />
            New clients only (uncheck for "come back!" promos any client can use)
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: form.reward_referrer ? '8px' : '14px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
            <input type="checkbox" checked={form.reward_referrer} onChange={function (e) { setF({ reward_referrer: e.target.checked }) }} />
            🤝 Also reward the client who shared the link
          </label>
          {form.reward_referrer && (
            <input type="text" value={form.referrer_reward} onChange={function (e) { setF({ referrer_reward: e.target.value }) }}
              placeholder='What do THEY get? e.g. "$5 off your next groom"' style={inp} />
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <div>
              <label style={lbl}>Share code (optional — auto-created)</label>
              <input type="text" value={form.code} onChange={function (e) { setF({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }) }}
                placeholder={suggestCode(form.name)} style={{ ...inp, width: '160px', marginBottom: 0, fontWeight: 700, letterSpacing: '0.05em' }} />
            </div>
            <div>
              <label style={lbl}>Expires (optional)</label>
              <input type="date" value={form.expires_at} onChange={function (e) { setF({ expires_at: e.target.value }) }}
                style={{ ...inp, width: '170px', marginBottom: 0 }} />
            </div>
            <div>
              <label style={lbl}>Max uses (optional)</label>
              <input type="number" min="1" value={form.max_uses} onChange={function (e) { setF({ max_uses: e.target.value }) }}
                placeholder="∞" style={{ ...inp, width: '100px', marginBottom: 0 }} />
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '14px', lineHeight: 1.5, background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px', padding: '8px 12px' }}>
            💡 <strong>Nobody ever types this code</strong> — it travels inside the share link automatically.
            Leave it blank and we'll create one from the promo name. It's just how the promo shows up in
            your appointment notes (e.g. <code>🎁 PROMO {suggestCode(form.name)}</code>) so you know which
            promo brought a client in.
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={function () { setShowForm(false); setForm(EMPTY_FORM) }} style={{ padding: '10px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={savePromo} disabled={saving} style={{ padding: '10px 16px', background: saving ? '#a78bfa' : '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : '💾 Save Promo'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

var lbl = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }
var inp = { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '14px', fontSize: '14px' }
