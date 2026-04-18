import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function TaxSettings() {
  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [saved, setSaved] = useState(false)
  var [error, setError] = useState('')
  var [groomerId, setGroomerId] = useState(null)
  var [settingsId, setSettingsId] = useState(null)

  var [form, setForm] = useState({
    // Tax estimates master toggle + federal %
    tax_estimates_enabled: false,
    federal_tax_estimate_percent: 10,

    // State + state tax
    state: '',
    has_state_income_tax: true,
    state_tax_rate: 0,

    // Unemployment (employer side)
    suta_rate: 0,
    suta_wage_base: 9000,
    futa_rate: 0.006,
    futa_wage_base: 7000,

    // Business info
    business_legal_name: '',
    business_ein: '',
    business_address_line1: '',
    business_address_line2: '',
    business_city: '',
    business_state: '',
    business_zip: '',

    notes: ''
  })

  useEffect(function() {
    fetchSettings()
  }, [])

  async function fetchSettings() {
    setLoading(true)
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setGroomerId(user.id)

    var { data, error: fetchErr } = await supabase
      .from('shop_tax_settings')
      .select('*')
      .eq('groomer_id', user.id)
      .maybeSingle()

    if (!fetchErr && data) {
      setSettingsId(data.id)
      setForm({
        tax_estimates_enabled: data.tax_estimates_enabled === true,
        federal_tax_estimate_percent: data.federal_tax_estimate_percent !== null && data.federal_tax_estimate_percent !== undefined ? data.federal_tax_estimate_percent : 10,
        state: data.state || '',
        has_state_income_tax: data.has_state_income_tax !== false,
        state_tax_rate: data.state_tax_rate || 0,
        suta_rate: data.suta_rate || 0,
        suta_wage_base: data.suta_wage_base || 9000,
        futa_rate: data.futa_rate || 0.006,
        futa_wage_base: data.futa_wage_base || 7000,
        business_legal_name: data.business_legal_name || '',
        business_ein: data.business_ein || '',
        business_address_line1: data.business_address_line1 || '',
        business_address_line2: data.business_address_line2 || '',
        business_city: data.business_city || '',
        business_state: data.business_state || '',
        business_zip: data.business_zip || '',
        notes: data.notes || ''
      })
    }
    setLoading(false)
  }

  function updateField(field, value) {
    setForm(function(prev) {
      var next = Object.assign({}, prev)
      next[field] = value
      return next
    })
    setSaved(false)
  }

  async function handleSave(e) {
    if (e) e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    var payload = {
      groomer_id: groomerId,
      tax_estimates_enabled: !!form.tax_estimates_enabled,
      federal_tax_estimate_percent: parseFloat(form.federal_tax_estimate_percent) || 0,
      state: form.state || null,
      has_state_income_tax: form.has_state_income_tax,
      state_tax_rate: parseFloat(form.state_tax_rate) || 0,
      suta_rate: parseFloat(form.suta_rate) || 0,
      suta_wage_base: parseFloat(form.suta_wage_base) || 0,
      futa_rate: parseFloat(form.futa_rate) || 0,
      futa_wage_base: parseFloat(form.futa_wage_base) || 0,
      business_legal_name: form.business_legal_name || null,
      business_ein: form.business_ein || null,
      business_address_line1: form.business_address_line1 || null,
      business_address_line2: form.business_address_line2 || null,
      business_city: form.business_city || null,
      business_state: form.business_state || null,
      business_zip: form.business_zip || null,
      notes: form.notes || null,
      updated_at: new Date().toISOString()
    }

    var result
    if (settingsId) {
      result = await supabase
        .from('shop_tax_settings')
        .update(payload)
        .eq('id', settingsId)
        .select()
        .single()
    } else {
      result = await supabase
        .from('shop_tax_settings')
        .insert(payload)
        .select()
        .single()
    }

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    if (result.data && result.data.id) {
      setSettingsId(result.data.id)
    }
    setSaved(true)
    setSaving(false)
    setTimeout(function() { setSaved(false) }, 3000)
  }

  if (loading) {
    return <div className="page-loading">Loading tax settings...</div>
  }

  return (
    <div className="ts-page">
      <div className="ts-header">
        <h1>🧾 Shop Tax Settings</h1>
        <p className="ts-subtitle">
          These settings power payroll tax estimates and year-end forms (W-2, 1099, 941).
          Fill these out <strong>before running your first payroll</strong>.
        </p>
      </div>

      <div className="ts-warning-strong">
        <div className="ts-warning-title">⚠️ ESTIMATES ONLY — NOT TAX ADVICE</div>
        <p>
          PetPro shows <strong>rough tax estimates</strong> to help you with bookkeeping.
          These are <strong>NOT</strong> exact tax amounts. Taxes change every year and every state is different.
        </p>
        <p>
          <strong>PetPro does NOT file taxes for you.</strong> Always confirm real tax amounts with
          your accountant or tax software. Every percentage below is editable — set what works for your shop.
        </p>
      </div>

      <form onSubmit={handleSave} className="ts-form">

        {/* ============ TAX ESTIMATES TOGGLE ============ */}
        <div className="ts-section ts-estimates-section">
          <h2>🧮 Tax Estimates</h2>
          <p className="ts-section-hint">
            Turn this ON to see <strong>estimated</strong> tax withholdings on paychecks
            (FICA + federal + state). Turn OFF to just track <strong>gross pay + tips</strong> with no tax math.
          </p>

          <div className="ts-toggle-row">
            <label className="ts-toggle">
              <input
                type="checkbox"
                checked={form.tax_estimates_enabled}
                onChange={function(e) { updateField('tax_estimates_enabled', e.target.checked) }}
              />
              <span className="ts-toggle-slider"></span>
            </label>
            <div className="ts-toggle-text">
              <div className="ts-toggle-label">Show tax estimates on paychecks</div>
              <div className="ts-toggle-hint">
                {form.tax_estimates_enabled
                  ? '✨ Estimates ON — paychecks will show FICA + federal + state withholdings'
                  : '📋 Estimates OFF — paychecks show gross pay + tips only (no tax math)'}
              </div>
            </div>
          </div>

          {!form.tax_estimates_enabled && (
            <div className="ts-toggle-off-note">
              <strong>ℹ️ Toggle OFF is a safe default.</strong> Use this if your accountant handles
              everything, or if you just want to track income without tax math. You can turn it ON anytime.
            </div>
          )}

          {form.tax_estimates_enabled && (
            <div className="ts-estimate-fields">
              <div className="ts-field">
                <label>Federal Tax Estimate (%) — W-2 staff only</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="50"
                  value={form.federal_tax_estimate_percent}
                  onChange={function(e) { updateField('federal_tax_estimate_percent', e.target.value) }}
                  style={{ width: 120 }}
                />
                <small className="ts-hint">
                  Rough guide: <strong>10–15%</strong> for W-2 hourly staff, <strong>22–25%</strong> for
                  solo groomers (self-employment + income tax combined). Ask your accountant for your exact number.
                  1099 contractors always get 0% withheld.
                </small>
              </div>
              <div className="ts-fica-info">
                <strong>FICA (Social Security + Medicare):</strong> Fixed by federal law at
                6.2% SS + 1.45% Medicare = <strong>7.65% total</strong> (W-2 only). Not editable.
              </div>
            </div>
          )}
        </div>

        {/* ============ BUSINESS INFO ============ */}
        <div className="ts-section">
          <h2>🏢 Business Information</h2>
          <p className="ts-section-hint">
            Shows on pay stubs and year-end forms (W-2 / 1099 / 941).
          </p>

          <div className="ts-field">
            <label>Legal Business Name</label>
            <input
              type="text"
              value={form.business_legal_name}
              onChange={function(e) { updateField('business_legal_name', e.target.value) }}
              placeholder="e.g. Happy Tails Grooming LLC"
            />
          </div>

          <div className="ts-field">
            <label>Employer Identification Number (EIN)</label>
            <input
              type="text"
              value={form.business_ein}
              onChange={function(e) { updateField('business_ein', e.target.value) }}
              placeholder="XX-XXXXXXX"
            />
            <small className="ts-hint">
              Your federal tax ID. Required for W-2 and 1099 forms.
            </small>
          </div>

          <div className="ts-field">
            <label>Business Address</label>
            <input
              type="text"
              value={form.business_address_line1}
              onChange={function(e) { updateField('business_address_line1', e.target.value) }}
              placeholder="Street address"
            />
            <input
              type="text"
              value={form.business_address_line2}
              onChange={function(e) { updateField('business_address_line2', e.target.value) }}
              placeholder="Suite / unit (optional)"
              style={{ marginTop: 8 }}
            />
          </div>

          <div className="ts-field-row">
            <div className="ts-field ts-field-grow">
              <label>City</label>
              <input
                type="text"
                value={form.business_city}
                onChange={function(e) { updateField('business_city', e.target.value) }}
              />
            </div>
            <div className="ts-field ts-field-small">
              <label>State</label>
              <input
                type="text"
                maxLength="2"
                value={form.business_state}
                onChange={function(e) { updateField('business_state', e.target.value.toUpperCase()) }}
                placeholder="TX"
              />
            </div>
            <div className="ts-field ts-field-medium">
              <label>ZIP</label>
              <input
                type="text"
                value={form.business_zip}
                onChange={function(e) { updateField('business_zip', e.target.value) }}
                placeholder="75001"
              />
            </div>
          </div>
        </div>

        {/* ============ STATE TAX ============ */}
        <div className="ts-section">
          <h2>📍 State Income Tax</h2>
          <p className="ts-section-hint">
            The state where your shop operates. Used to estimate state tax withholding
            {!form.tax_estimates_enabled && <span className="ts-gated-note"> (only applies when Tax Estimates are ON above)</span>}.
          </p>

          <div className="ts-field">
            <label>Operating State</label>
            <input
              type="text"
              maxLength="2"
              value={form.state}
              onChange={function(e) { updateField('state', e.target.value.toUpperCase()) }}
              placeholder="TX"
              style={{ width: 80 }}
            />
            <small className="ts-hint">2-letter state code (e.g. TX, CA, NY, FL)</small>
          </div>

          <div className="ts-field ts-checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={form.has_state_income_tax}
                onChange={function(e) { updateField('has_state_income_tax', e.target.checked) }}
              />
              <span>My state has state income tax</span>
            </label>
            <small className="ts-hint">
              Uncheck if you're in TX, FL, NV, WA, WY, SD, AK, TN, or NH (no state income tax).
            </small>
          </div>

          {form.has_state_income_tax && (
            <div className="ts-field">
              <label>State Tax Rate (flat estimate %)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="20"
                value={form.state_tax_rate}
                onChange={function(e) { updateField('state_tax_rate', e.target.value) }}
                style={{ width: 120 }}
              />
              <small className="ts-hint">
                e.g. 5.00 = 5%. For a rough estimate. Check with your accountant for exact rates.
              </small>
            </div>
          )}
        </div>

        {/* ============ UNEMPLOYMENT TAXES ============ */}
        <div className="ts-section">
          <h2>💼 Unemployment Taxes (Employer)</h2>
          <p className="ts-section-hint">
            These are paid by <strong>you</strong>, not withheld from staff. They appear on reports
            for your accountant.
          </p>

          <div className="ts-field-row">
            <div className="ts-field">
              <label>SUTA Rate (State Unemployment)</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                max="1"
                value={form.suta_rate}
                onChange={function(e) { updateField('suta_rate', e.target.value) }}
                style={{ width: 140 }}
              />
              <small className="ts-hint">
                e.g. 0.0270 = 2.7%. Your state mails you your rate each year.
              </small>
            </div>
            <div className="ts-field">
              <label>SUTA Wage Base ($)</label>
              <input
                type="number"
                step="100"
                min="0"
                value={form.suta_wage_base}
                onChange={function(e) { updateField('suta_wage_base', e.target.value) }}
                style={{ width: 140 }}
              />
              <small className="ts-hint">
                Annual wage ceiling per employee (varies by state).
              </small>
            </div>
          </div>

          <div className="ts-field-row">
            <div className="ts-field">
              <label>FUTA Rate (Federal Unemployment)</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                max="1"
                value={form.futa_rate}
                onChange={function(e) { updateField('futa_rate', e.target.value) }}
                style={{ width: 140 }}
              />
              <small className="ts-hint">
                Usually 0.006 (0.6%) after state credit.
              </small>
            </div>
            <div className="ts-field">
              <label>FUTA Wage Base ($)</label>
              <input
                type="number"
                step="100"
                min="0"
                value={form.futa_wage_base}
                onChange={function(e) { updateField('futa_wage_base', e.target.value) }}
                style={{ width: 140 }}
              />
              <small className="ts-hint">
                Federal ceiling — usually $7,000 per employee per year.
              </small>
            </div>
          </div>
        </div>

        {/* ============ NOTES ============ */}
        <div className="ts-section">
          <h2>📝 Notes</h2>
          <textarea
            value={form.notes}
            onChange={function(e) { updateField('notes', e.target.value) }}
            rows="3"
            placeholder="Any notes for yourself or your accountant..."
          />
        </div>

        {/* ============ ACTIONS ============ */}
        {error && <div className="ts-error">❌ {error}</div>}
        {saved && <div className="ts-success">✅ Tax settings saved!</div>}

        <div className="ts-actions">
          <button type="submit" className="ts-save-btn" disabled={saving}>
            {saving ? 'Saving...' : '💾 Save Tax Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
