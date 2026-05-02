// =============================================================================
// PetPro — Client Portal: Agreement Signing page
// =============================================================================
// Shown the FIRST time a new client logs into the portal IF they haven't
// signed all required waivers (grooming + boarding) for their groomer.
//
// Each waiver shows:
//   • Full waiver text (scrollable)
//   • Typed name signature (required)
//   • Drawn signature (optional, finger/mouse)
//   • "I have read and agree" checkbox (required)
//   • Sign button (disabled until name + checkbox are set)
//
// After ALL waivers are signed, the user is redirected to /portal.
//
// Why first-login instead of at signup?
//   • Auth flow doesn't have a client_id yet at signup time
//   • DB trigger creates the client row from auth metadata
//   • Cleaner to handle signatures once the client row exists + RLS works
// =============================================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SignaturePad from '../components/SignaturePad'

export default function PortalAgreements() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [client, setClient] = useState(null)
  const [agreements, setAgreements] = useState([])         // unsigned waivers
  // Per-agreement signing state — { [agreement.id]: { typedName, drawnSig, agreed, saving } }
  const [sigState, setSigState] = useState({})
  const [shopName, setShopName] = useState('PetPro')

  useEffect(() => { loadUnsigned() }, [])

  async function loadUnsigned() {
    setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        navigate('/portal/login')
        return
      }

      // 1. Find the client row for this user
      const { data: clientRow } = await supabase
        .from('clients')
        .select('id, first_name, last_name, groomer_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!clientRow) {
        setError('Could not find your client account. Try logging in again.')
        return
      }
      setClient(clientRow)

      // 2. Load this groomer's shop name (for header)
      const { data: shop } = await supabase
        .from('shop_settings')
        .select('shop_name')
        .eq('groomer_id', clientRow.groomer_id)
        .maybeSingle()
      if (shop && shop.shop_name) setShopName(shop.shop_name)

      // 3. Load all ACTIVE agreements for this groomer
      const { data: allAgreements } = await supabase
        .from('agreements')
        .select('id, type, title, content')
        .eq('groomer_id', clientRow.groomer_id)
        .eq('is_active', true)
        .order('type')

      // 4. Load any agreements this client HAS signed
      const { data: signed } = await supabase
        .from('signed_agreements')
        .select('agreement_id')
        .eq('client_id', clientRow.id)

      const signedIds = new Set((signed || []).map(s => s.agreement_id))

      // 5. Filter to JUST the unsigned ones
      const unsigned = (allAgreements || []).filter(a => !signedIds.has(a.id))

      if (unsigned.length === 0) {
        // Nothing to sign — go straight to portal
        navigate('/portal', { replace: true })
        return
      }

      setAgreements(unsigned)
      // Initialize sig state for each unsigned agreement
      const initial = {}
      unsigned.forEach(a => {
        initial[a.id] = { typedName: '', drawnSig: null, agreed: false, saving: false, signedAt: null }
      })
      setSigState(initial)
    } catch (err) {
      console.error('[PortalAgreements] load error:', err)
      setError(err.message || 'Could not load agreements.')
    } finally {
      setLoading(false)
    }
  }

  function updateSig(agreementId, field, value) {
    setSigState(prev => ({
      ...prev,
      [agreementId]: { ...prev[agreementId], [field]: value },
    }))
  }

  async function handleSign(agreement) {
    const state = sigState[agreement.id]
    if (!state || !state.typedName.trim() || !state.agreed) return
    if (!client) return

    setSigState(prev => ({ ...prev, [agreement.id]: { ...prev[agreement.id], saving: true } }))

    try {
      const insertData = {
        client_id: client.id,
        agreement_id: agreement.id,
        signature_text: state.typedName.trim(),
        signature_image: state.drawnSig || null,
        agreement_content_snapshot: agreement.content,
      }

      // Capture user agent for audit (IP captured server-side via headers if we add later)
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        insertData.user_agent = navigator.userAgent.slice(0, 500)
      }

      const { error: err } = await supabase.from('signed_agreements').insert([insertData])
      if (err) throw err

      setSigState(prev => ({
        ...prev,
        [agreement.id]: { ...prev[agreement.id], saving: false, signedAt: new Date().toISOString() },
      }))

      // Are all agreements now signed? If yes, redirect after a brief pause
      const allSignedNow = agreements.every(a =>
        a.id === agreement.id || sigState[a.id]?.signedAt
      )
      if (allSignedNow) {
        setTimeout(() => navigate('/portal', { replace: true }), 800)
      }
    } catch (err) {
      alert('Could not save signature: ' + (err.message || err))
      setSigState(prev => ({ ...prev, [agreement.id]: { ...prev[agreement.id], saving: false } }))
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <p style={{ color: '#6b7280' }}>Loading your agreements…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: '#f9fafb' }}>
        <div style={{ maxWidth: '480px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '24px', color: '#991b1b' }}>
          {error}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '20px 16px 40px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', marginBottom: '20px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>📜</div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>Welcome to {shopName}!</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
            Before booking, please review and sign the following service agreement{agreements.length > 1 ? 's' : ''}. Just takes a minute — sign once and you're set.
          </p>
        </div>

        {agreements.map((a) => {
          const s = sigState[a.id] || {}
          const canSign = s.typedName.trim().length > 0 && s.agreed && !s.saving
          const signed = !!s.signedAt
          return (
            <div key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                  {a.type === 'grooming' ? '✂️' : '🏠'} {a.title}
                </div>
                {signed && <span style={{ fontSize: '12px', color: '#166534', fontWeight: 700 }}>✓ Signed</span>}
              </div>

              {/* Waiver text — scrollable so the page doesn't get insanely long */}
              <div style={{
                maxHeight: '260px',
                overflowY: 'auto',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '13px',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                color: '#1f2937',
                marginBottom: '16px',
              }}>
                {a.content}
              </div>

              {!signed && (
                <>
                  {/* Typed name */}
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Type your full name as your signature *
                  </label>
                  <input
                    type="text"
                    value={s.typedName}
                    onChange={(e) => updateSig(a.id, 'typedName', e.target.value)}
                    placeholder="Jane Smith"
                    style={{
                      width: '100%', padding: '10px 12px', fontSize: '15px',
                      border: '1px solid #d1d5db', borderRadius: '8px',
                      fontFamily: 'cursive', boxSizing: 'border-box',
                      marginBottom: '14px',
                    }}
                    disabled={s.saving}
                  />

                  {/* Drawn signature (optional) */}
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Or draw your signature (optional)
                  </label>
                  <SignaturePad
                    onSignature={(b64) => updateSig(a.id, 'drawnSig', b64)}
                    height={120}
                  />

                  {/* Agree checkbox */}
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginTop: '14px', padding: '10px 12px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px' }}>
                    <input
                      type="checkbox"
                      checked={s.agreed}
                      onChange={(e) => updateSig(a.id, 'agreed', e.target.checked)}
                      style={{ marginTop: '3px', cursor: 'pointer', accentColor: '#7c3aed' }}
                      disabled={s.saving}
                    />
                    <span style={{ fontSize: '13px', color: '#5b21b6', lineHeight: 1.5 }}>
                      <strong>I have read and agree</strong> to the {a.title} above. I understand my typed name above (and drawn signature, if any) constitutes my legally binding signature.
                    </span>
                  </label>

                  <button
                    onClick={() => handleSign(a)}
                    disabled={!canSign}
                    style={{
                      marginTop: '14px',
                      width: '100%',
                      padding: '12px',
                      background: canSign ? '#7c3aed' : '#d1d5db',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '15px',
                      cursor: canSign ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {s.saving ? 'Signing…' : '✍️ Sign ' + a.title}
                  </button>
                </>
              )}
            </div>
          )
        })}

        <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', marginTop: '8px' }}>
          A copy of each signed agreement is saved to your profile and your groomer's records.
        </div>
      </div>
    </div>
  )
}
