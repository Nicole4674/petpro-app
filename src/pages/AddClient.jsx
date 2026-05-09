import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatPhoneOnInput } from '../lib/phone'
import AddressInput from '../components/AddressInput'

export default function AddClient() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    preferred_contact: 'text',
    // SMS consent (TCR/Twilio compliance) — required = true before any auto
    // SMS will fire (reminders, rebook nudges, etc). Default false; groomer
    // checks the box only after asking the client verbally.
    sms_consent: false,
    address: '',
    // Coords are filled in when the user picks an address from the
    // Places Autocomplete dropdown. NULL if they typed it free-form.
    latitude: null,
    longitude: null,
    address_notes: '',
    notes: '',
  })

  const handleChange = (e) => {
    // Checkbox inputs need .checked, everything else uses .value
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm({ ...form, [e.target.name]: value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

    // Stamp sms_consent_at when consent is true so we have an audit trail
    // (TCR/Twilio compliance requires being able to prove consent date).
    const insertPayload = {
      ...form,
      groomer_id: user.id,
      is_first_time: true,
      sms_consent_at: form.sms_consent ? new Date().toISOString() : null,
    }

    const { data, error: insertError } = await supabase
      .from('clients')
      .insert(insertPayload)
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    // Go to client detail page to add pets
    navigate(`/clients/${data.id}`)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Add New Client</h1>
      </div>

      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-row">
          <div className="form-group">
            <label>First Name *</label>
            <input
              type="text"
              name="first_name"
              value={form.first_name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Last Name *</label>
            <input
              type="text"
              name="last_name"
              value={form.last_name}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Phone *</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: formatPhoneOnInput(e.target.value) })}
              placeholder="713-098-3746"
              required
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Preferred Contact Method</label>
          <select name="preferred_contact" value={form.preferred_contact} onChange={handleChange}>
            <option value="text">Text</option>
            <option value="email">Email</option>
            <option value="both">Both</option>
          </select>
        </div>

        {/* SMS consent — required by Twilio/TCR before any auto-SMS will fire.
            Default OFF; groomer must check it after asking the client.
            Without this checked, reminders + rebook nudges silently skip. */}
        <div className="form-group" style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '10px', padding: '12px 14px' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              name="sms_consent"
              checked={form.sms_consent}
              onChange={handleChange}
              style={{ marginTop: '3px', width: '18px', height: '18px', cursor: 'pointer', accentColor: '#16a34a' }}
            />
            <span>
              <strong style={{ color: '#166534', fontSize: '14px' }}>📱 Consent to text messages</strong>
              <div style={{ fontSize: '12px', color: '#374151', marginTop: '4px', lineHeight: 1.4 }}>
                Client agrees to receive automated SMS reminders + rebook nudges from your shop.
                <strong> Required for any auto-text to fire</strong> (TCR/Twilio rule). Ask them verbally first, then check.
              </div>
            </span>
          </label>
        </div>

        <div className="form-group">
          <label>Address</label>
          <AddressInput
            value={form.address}
            onChange={(addr) => setForm({ ...form, address: addr })}
            onSelect={({ address, latitude, longitude }) => {
              // Picked from dropdown → save clean address + coords together
              setForm({ ...form, address, latitude, longitude })
            }}
            placeholder="Start typing the address — pick from the dropdown"
          />
          <small style={{ color: '#6b7280', fontSize: '11px' }}>
            Pick from the dropdown so the route map can find them later.
          </small>
        </div>

        {/* Address notes — gate codes, parking tips, "ring don't knock" */}
        <div className="form-group">
          <label>📍 Address Notes (optional)</label>
          <textarea
            name="address_notes"
            value={form.address_notes}
            onChange={handleChange}
            rows={2}
            placeholder='e.g. "Park in driveway · Gate code 4567 · Ring doorbell, sleeping baby"'
          />
          <small style={{ color: '#6b7280', fontSize: '11px' }}>
            Shows on the route map + appointment popups so you don't forget gate codes, parking tips, etc.
          </small>
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={3}
            placeholder="Any notes about this client..."
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={() => navigate('/clients')}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save Client'}
          </button>
        </div>
      </form>
    </div>
  )
}
