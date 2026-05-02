// =============================================================================
// PetPro — Agreements page (Groomer side)
// =============================================================================
// Lets the groomer view + edit their two waiver templates:
//   • Grooming Service Agreement (with late fee + matted-pet liability clauses)
//   • Boarding Service Agreement
//
// Edits save back to the agreements table. Existing signed waivers keep
// their original text snapshot — clients are only bound to what they
// actually signed, not future edits.
//
// Future (Phase B): list signed waivers per agreement, custom waivers,
// audit trail, drawn-signature gallery.
// =============================================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Agreements() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [agreements, setAgreements] = useState([])
  const [error, setError] = useState('')
  // Edit state — { [agreement.id]: { title, content, saving, savedAt } }
  const [editState, setEditState] = useState({})
  // Whether the shop has the toggle ON (controls whether clients are prompted
  // to sign at first portal login). Loaded from shop_settings.agreements_enabled.
  const [agreementsEnabled, setAgreementsEnabled] = useState(false)

  useEffect(() => { loadAgreements() }, [])

  async function loadAgreements() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      // Load shop_settings.agreements_enabled so we can show the on/off badge
      const { data: shop } = await supabase
        .from('shop_settings')
        .select('agreements_enabled')
        .eq('groomer_id', user.id)
        .maybeSingle()
      setAgreementsEnabled(!!(shop && shop.agreements_enabled))

      const { data, error: err } = await supabase
        .from('agreements')
        .select('*')
        .eq('groomer_id', user.id)
        .order('type', { ascending: true })

      if (err) throw err
      setAgreements(data || [])

      // Initialize editState with current values for each agreement
      const initial = {}
      ;(data || []).forEach((a) => {
        initial[a.id] = { title: a.title, content: a.content, saving: false, savedAt: null }
      })
      setEditState(initial)
    } catch (err) {
      console.error('[Agreements] load error:', err)
      setError(err.message || 'Could not load agreements.')
    } finally {
      setLoading(false)
    }
  }

  function updateField(agreementId, field, value) {
    setEditState((prev) => ({
      ...prev,
      [agreementId]: { ...prev[agreementId], [field]: value, savedAt: null },
    }))
  }

  async function handleSave(agreementId) {
    const state = editState[agreementId]
    if (!state) return
    if (!state.title.trim() || !state.content.trim()) {
      alert('Title and content cannot be empty.')
      return
    }
    setEditState((prev) => ({ ...prev, [agreementId]: { ...prev[agreementId], saving: true } }))
    try {
      const { error: err } = await supabase
        .from('agreements')
        .update({
          title: state.title.trim(),
          content: state.content.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', agreementId)
      if (err) throw err
      setEditState((prev) => ({
        ...prev,
        [agreementId]: { ...prev[agreementId], saving: false, savedAt: new Date().toISOString() },
      }))
    } catch (err) {
      alert('Could not save: ' + (err.message || err))
      setEditState((prev) => ({ ...prev, [agreementId]: { ...prev[agreementId], saving: false } }))
    }
  }

  // Open a print-friendly version in a new tab. Same approach as printRouteSheet.
  function handlePrint(agreement) {
    const win = window.open('', '_blank', 'width=900,height=900')
    if (!win) { alert('Could not open print window — allow pop-ups for this site.'); return }
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(agreement.title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 32px auto; padding: 24px; color: #111827; }
  h1 { font-size: 22px; margin: 0 0 4px; border-bottom: 2px solid #111; padding-bottom: 6px; }
  pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.6; margin-top: 16px; }
  .sig-block { margin-top: 40px; border-top: 1px solid #999; padding-top: 14px; font-size: 13px; }
  .sig-line { display: flex; justify-content: space-between; gap: 24px; margin-top: 18px; }
  .sig-field { flex: 1; border-bottom: 1px solid #111; padding-bottom: 4px; height: 40px; }
  .sig-label { font-size: 11px; color: #666; margin-top: 4px; }
  @media print { body { margin: 14px; } .no-print { display: none; } }
  .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 18px; background: #7c3aed; color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 13px; }
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">🖨️ Print this page</button>
<h1>${escapeHtml(agreement.title)}</h1>
<pre>${escapeHtml(agreement.content)}</pre>
<div class="sig-block">
  <div class="sig-line">
    <div style="flex:2;"><div class="sig-field"></div><div class="sig-label">Client signature</div></div>
    <div style="flex:1;"><div class="sig-field"></div><div class="sig-label">Date</div></div>
  </div>
  <div class="sig-line">
    <div style="flex:2;"><div class="sig-field"></div><div class="sig-label">Printed name</div></div>
    <div style="flex:1;"><div class="sig-field"></div><div class="sig-label">Pet name(s)</div></div>
  </div>
</div>
</body></html>`
    win.document.open(); win.document.write(html); win.document.close()
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  if (loading) {
    return <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>Loading agreements…</div>
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '4px' }}>
        <h1 style={{ fontSize: '22px', margin: 0, color: '#111827' }}>📜 Client Agreements</h1>
        {/* On/off badge — read-only here; flip in Shop Settings */}
        <span style={{
          padding: '6px 14px',
          background: agreementsEnabled ? '#dcfce7' : '#f3f4f6',
          border: '1px solid ' + (agreementsEnabled ? '#86efac' : '#d1d5db'),
          color: agreementsEnabled ? '#166534' : '#6b7280',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 700,
        }}>
          {agreementsEnabled ? '✓ Required at portal login' : '⏸ OFF — clients are not prompted'}
        </span>
      </div>
      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px', lineHeight: 1.5 }}>
        These waivers are shown to new clients at first portal login (when the toggle is ON). Edit the text below to match your shop's exact language. Existing signed waivers keep their original text — only future signers see your edits.
        {!agreementsEnabled && (
          <div style={{ marginTop: '8px', padding: '10px 12px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', color: '#854d0e' }}>
            ⚠️ <strong>Currently OFF</strong> — clients are NOT being prompted to sign these. To require signing, go to <strong>Shop Settings → 📜 Require clients to sign agreements</strong> and turn it on.
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {agreements.length === 0 && !error && (
        <div style={{ padding: '24px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: '10px', color: '#854d0e' }}>
          No waivers yet. Run the <code>Agreements Schema v1.sql</code> migration in Supabase to seed defaults for your account.
        </div>
      )}

      {agreements.map((a) => {
        const s = editState[a.id] || { title: a.title, content: a.content }
        const dirty = s.title !== a.title || s.content !== a.content
        return (
          <div key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {a.type === 'grooming' ? '✂️ Grooming Waiver' : '🏠 Boarding Waiver'}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                  Last updated: {new Date(a.updated_at).toLocaleString('en-US')}
                </div>
              </div>
              <button
                onClick={() => handlePrint(a)}
                style={{ padding: '8px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                title="Open a printable version with signature lines"
              >🖨️ Print</button>
            </div>

            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Title</label>
            <input
              type="text"
              value={s.title}
              onChange={(e) => updateField(a.id, 'title', e.target.value)}
              style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px', marginBottom: '14px', boxSizing: 'border-box' }}
            />

            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Waiver text (what clients will read & sign)</label>
            <textarea
              value={s.content}
              onChange={(e) => updateField(a.id, 'content', e.target.value)}
              rows={20}
              style={{ width: '100%', padding: '12px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '8px', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12px', color: dirty ? '#b45309' : '#6b7280' }}>
                {s.savedAt
                  ? '✓ Saved at ' + new Date(s.savedAt).toLocaleTimeString('en-US')
                  : dirty
                    ? '● Unsaved changes'
                    : 'No changes'}
              </div>
              <button
                onClick={() => handleSave(a.id)}
                disabled={!dirty || s.saving}
                style={{
                  padding: '10px 20px',
                  background: dirty && !s.saving ? '#7c3aed' : '#d1d5db',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: dirty && !s.saving ? 'pointer' : 'not-allowed',
                }}
              >
                {s.saving ? 'Saving…' : '💾 Save changes'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
