import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import '../boarding-styles.css'

export default function BoardingSetup() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [existingSettings, setExistingSettings] = useState(null)
  const [step, setStep] = useState(1)
  const [success, setSuccess] = useState(false)

  // Form state
  const [settings, setSettings] = useState({
    setup_type: 'numbered',
    allow_family_kennels: true,
    late_checkout_time: '12:00',
    late_checkout_fee: 0,
    daily_checks_required: false,
    pricing_model: 'flat',
    base_nightly_rate: 0,
    multi_pet_discount: 0,
    cancellation_hours: 48,
    notes: ''
  })

  // Kennel categories state
  const [categories, setCategories] = useState([])
  const [newCategory, setNewCategory] = useState({
    name: '',
    description: '',
    size_label: '',
    base_price: 0,
    default_capacity: 1
  })

  useEffect(() => {
    loadExistingSettings()
  }, [])

  async function loadExistingSettings() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Check if settings already exist
      const { data } = await supabase
        .from('boarding_settings')
        .select('*')
        .eq('groomer_id', user.id)
        .single()

      if (data) {
        setExistingSettings(data)
        setSettings({
          setup_type: data.setup_type || 'numbered',
          allow_family_kennels: data.allow_family_kennels ?? true,
          late_checkout_time: data.late_checkout_time || '12:00',
          late_checkout_fee: data.late_checkout_fee || 0,
          daily_checks_required: data.daily_checks_required ?? false,
          pricing_model: data.pricing_model || 'flat',
          base_nightly_rate: data.base_nightly_rate || 0,
          multi_pet_discount: data.multi_pet_discount || 0,
          cancellation_hours: data.cancellation_hours || 48,
          notes: data.notes || ''
        })
      }

      // Load existing categories
      const { data: cats } = await supabase
        .from('kennel_categories')
        .select('*')
        .eq('groomer_id', user.id)
        .order('display_order')

      if (cats && cats.length > 0) {
        setCategories(cats)
      }
    } catch (err) {
      console.error('Error loading settings:', err)
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (existingSettings) {
        // Update existing
        const { error } = await supabase
          .from('boarding_settings')
          .update({
            setup_type: settings.setup_type,
            allow_family_kennels: settings.allow_family_kennels,
            late_checkout_time: settings.late_checkout_time,
            late_checkout_fee: parseFloat(settings.late_checkout_fee) || 0,
            daily_checks_required: settings.daily_checks_required,
            pricing_model: settings.pricing_model,
            base_nightly_rate: parseFloat(settings.base_nightly_rate) || 0,
            multi_pet_discount: parseFloat(settings.multi_pet_discount) || 0,
            cancellation_hours: parseInt(settings.cancellation_hours) || 48,
            notes: settings.notes,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSettings.id)

        if (error) throw error
      } else {
        // Insert new
        const { error } = await supabase
          .from('boarding_settings')
          .insert({
            groomer_id: user.id,
            setup_type: settings.setup_type,
            allow_family_kennels: settings.allow_family_kennels,
            late_checkout_time: settings.late_checkout_time,
            late_checkout_fee: parseFloat(settings.late_checkout_fee) || 0,
            daily_checks_required: settings.daily_checks_required,
            pricing_model: settings.pricing_model,
            base_nightly_rate: parseFloat(settings.base_nightly_rate) || 0,
            multi_pet_discount: parseFloat(settings.multi_pet_discount) || 0,
            cancellation_hours: parseInt(settings.cancellation_hours) || 48,
            notes: settings.notes
          })

        if (error) throw error
      }

      setStep(3) // Move to kennel categories step
    } catch (err) {
      console.error('Error saving settings:', err)
      alert('Error saving settings: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function addCategory() {
    if (!newCategory.name.trim()) {
      alert('Please enter a category name')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('kennel_categories')
        .insert({
          groomer_id: user.id,
          name: newCategory.name.trim(),
          description: newCategory.description.trim(),
          size_label: newCategory.size_label.trim(),
          base_price: parseFloat(newCategory.base_price) || 0,
          default_capacity: parseInt(newCategory.default_capacity) || 1,
          display_order: categories.length
        })
        .select()
        .single()

      if (error) throw error

      setCategories([...categories, data])
      setNewCategory({
        name: '',
        description: '',
        size_label: '',
        base_price: 0,
        default_capacity: 1
      })
    } catch (err) {
      console.error('Error adding category:', err)
      alert('Error adding category: ' + err.message)
    }
  }

  async function deleteCategory(id) {
    if (!confirm('Delete this kennel category? This will also remove all kennels in this category.')) return

    try {
      const { error } = await supabase
        .from('kennel_categories')
        .delete()
        .eq('id', id)

      if (error) throw error
      setCategories(categories.filter(c => c.id !== id))
    } catch (err) {
      console.error('Error deleting category:', err)
      alert('Error: ' + err.message)
    }
  }

  function updateSetting(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="boarding-setup">
        <div className="boarding-loading">Loading boarding settings...</div>
      </div>
    )
  }

  return (
    <div className="boarding-setup">
      <div className="boarding-setup-header">
        <h1>🏠 Boarding Setup</h1>
        <p className="boarding-setup-subtitle">
          {existingSettings ? 'Edit your boarding configuration' : 'Configure boarding for your shop'}
        </p>
      </div>

      {/* Progress Steps */}
      <div className="boarding-steps">
        <div className={'boarding-step' + (step >= 1 ? ' boarding-step-active' : '') + (step > 1 ? ' boarding-step-done' : '')}
          onClick={() => setStep(1)}>
          <span className="boarding-step-number">{step > 1 ? '✓' : '1'}</span>
          <span className="boarding-step-label">Setup Type</span>
        </div>
        <div className="boarding-step-line"></div>
        <div className={'boarding-step' + (step >= 2 ? ' boarding-step-active' : '') + (step > 2 ? ' boarding-step-done' : '')}
          onClick={() => { if (step > 1) setStep(2) }}>
          <span className="boarding-step-number">{step > 2 ? '✓' : '2'}</span>
          <span className="boarding-step-label">Pricing & Rules</span>
        </div>
        <div className="boarding-step-line"></div>
        <div className={'boarding-step' + (step >= 3 ? ' boarding-step-active' : '') + (step > 3 ? ' boarding-step-done' : '')}
          onClick={() => { if (step > 2) setStep(3) }}>
          <span className="boarding-step-number">{step > 3 ? '✓' : '3'}</span>
          <span className="boarding-step-label">Kennel Categories</span>
        </div>
        <div className="boarding-step-line"></div>
        <div className={'boarding-step' + (success ? ' boarding-step-active boarding-step-done' : '')}>
          <span className="boarding-step-number">{success ? '✓' : '4'}</span>
          <span className="boarding-step-label">Done!</span>
        </div>
      </div>

      {/* Step 1: Setup Type */}
      {step === 1 && (
        <div className="boarding-form-section">
          <h2>What type of boarding setup do you have?</h2>
          <p className="boarding-form-hint">This decides how kennels are organized in your calendar. You can change this later.</p>

          <div className="boarding-type-grid">
            <div
              className={'boarding-type-card' + (settings.setup_type === 'numbered' ? ' boarding-type-selected' : '')}
              onClick={() => updateSetting('setup_type', 'numbered')}
            >
              <div className="boarding-type-icon">🔢</div>
              <div className="boarding-type-name">Numbered Kennels</div>
              <div className="boarding-type-desc">Kennel 1, Kennel 2, Kennel 3... Each dog gets a specific numbered space.</div>
            </div>

            <div
              className={'boarding-type-card' + (settings.setup_type === 'capacity' ? ' boarding-type-selected' : '')}
              onClick={() => updateSetting('setup_type', 'capacity')}
            >
              <div className="boarding-type-icon">📊</div>
              <div className="boarding-type-name">Capacity Based</div>
              <div className="boarding-type-desc">Just track total dogs per night. No specific kennel assignments. Simpler.</div>
            </div>

            <div
              className={'boarding-type-card' + (settings.setup_type === 'sized' ? ' boarding-type-selected' : '')}
              onClick={() => updateSetting('setup_type', 'sized')}
            >
              <div className="boarding-type-icon">📏</div>
              <div className="boarding-type-name">Sized Kennels</div>
              <div className="boarding-type-desc">Small, Medium, Large categories. Dogs get assigned by their size.</div>
            </div>

            <div
              className={'boarding-type-card' + (settings.setup_type === 'tiered' ? ' boarding-type-selected' : '')}
              onClick={() => updateSetting('setup_type', 'tiered')}
            >
              <div className="boarding-type-icon">⭐</div>
              <div className="boarding-type-name">Suites & Standard</div>
              <div className="boarding-type-desc">Different quality tiers. Luxury suites vs standard runs at different prices.</div>
            </div>
          </div>

          <div className="boarding-form-actions">
            <button className="boarding-btn boarding-btn-primary" onClick={() => setStep(2)}>
              Next: Pricing & Rules →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Pricing & Rules */}
      {step === 2 && (
        <div className="boarding-form-section">
          <h2>Pricing & Rules</h2>
          <p className="boarding-form-hint">Set your defaults. Each kennel category can override these later.</p>

          {/* Type-specific banner — explains what's coming based on setup_type */}
          {settings.setup_type === 'numbered' && (
            <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#3730a3', fontSize: 14, lineHeight: 1.5 }}>
              🔢 <strong>Numbered Kennels</strong> — set ONE base rate that applies to all your kennels. In Step 3, you'll list each kennel by number (Kennel 1, 2, 3…).
            </div>
          )}
          {settings.setup_type === 'capacity' && (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#065f46', fontSize: 14, lineHeight: 1.5 }}>
              📊 <strong>Capacity Based</strong> — set ONE flat rate per dog and a max-dogs-per-night limit. No individual kennel tracking. Simplest setup.
            </div>
          )}
          {settings.setup_type === 'sized' && (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#92400e', fontSize: 14, lineHeight: 1.5 }}>
              📏 <strong>Sized Kennels</strong> — pricing is set <em>per size category</em> in Step 3 (Small, Medium, Large can each have their own price). The base rate below is just a fallback.
            </div>
          )}
          {settings.setup_type === 'tiered' && (
            <div style={{ background: '#fdf4ff', border: '1px solid #f0abfc', borderRadius: 10, padding: '12px 14px', marginBottom: 16, color: '#86198f', fontSize: 14, lineHeight: 1.5 }}>
              ⭐ <strong>Suites & Standard</strong> — pricing is set <em>per tier</em> in Step 3 (each suite/run has its own nightly rate). The base rate below is just a fallback.
            </div>
          )}

          {/* Pricing Model — only shown for Numbered + Capacity (Sized + Tiered are auto by_kennel) */}
          {(settings.setup_type === 'numbered' || settings.setup_type === 'capacity') && (
            <div className="boarding-field-group">
              <label className="boarding-label">How do you charge for boarding?</label>
              <div className="boarding-radio-group">
                <label className="boarding-radio">
                  <input type="radio" name="pricing" value="flat"
                    checked={settings.pricing_model === 'flat'}
                    onChange={() => updateSetting('pricing_model', 'flat')} />
                  <span>Flat rate per night</span>
                </label>
                <label className="boarding-radio">
                  <input type="radio" name="pricing" value="by_weight"
                    checked={settings.pricing_model === 'by_weight'}
                    onChange={() => updateSetting('pricing_model', 'by_weight')} />
                  <span>By dog weight</span>
                </label>
                <label className="boarding-radio">
                  <input type="radio" name="pricing" value="custom"
                    checked={settings.pricing_model === 'custom'}
                    onChange={() => updateSetting('pricing_model', 'custom')} />
                  <span>Custom per booking</span>
                </label>
              </div>
            </div>
          )}

          {/* Base Rate (fallback for Sized/Tiered, primary for Numbered/Capacity) */}
          <div className="boarding-field-row">
            <div className="boarding-field">
              <label className="boarding-label">
                {(settings.setup_type === 'sized' || settings.setup_type === 'tiered')
                  ? 'Fallback Nightly Rate ($)'
                  : 'Base Nightly Rate ($)'}
              </label>
              <input type="number" className="boarding-input" min="0" step="0.01"
                value={settings.base_nightly_rate}
                onChange={e => updateSetting('base_nightly_rate', e.target.value)}
                placeholder="0.00" />
              {(settings.setup_type === 'sized' || settings.setup_type === 'tiered') && (
                <span className="boarding-field-hint">Used only if a category has no price set</span>
              )}
            </div>
            <div className="boarding-field">
              <label className="boarding-label">Multi-Pet Discount (%)</label>
              <input type="number" className="boarding-input" min="0" max="100"
                value={settings.multi_pet_discount}
                onChange={e => updateSetting('multi_pet_discount', e.target.value)}
                placeholder="0" />
              <span className="boarding-field-hint">2nd pet from same owner</span>
            </div>
          </div>

          <hr className="boarding-divider" />

          {/* Rules */}
          <div className="boarding-field-row">
            <div className="boarding-field">
              <label className="boarding-label">Late Checkout Time</label>
              <input type="time" className="boarding-input"
                value={settings.late_checkout_time}
                onChange={e => updateSetting('late_checkout_time', e.target.value)} />
              <span className="boarding-field-hint">After this time = charged extra night</span>
            </div>
            <div className="boarding-field">
              <label className="boarding-label">Late Checkout Fee ($)</label>
              <input type="number" className="boarding-input" min="0" step="0.01"
                value={settings.late_checkout_fee}
                onChange={e => updateSetting('late_checkout_fee', e.target.value)}
                placeholder="0.00" />
              <span className="boarding-field-hint">Or full extra night rate if 0</span>
            </div>
          </div>

          <div className="boarding-field-row">
            <div className="boarding-field">
              <label className="boarding-label">Cancellation Window (hours)</label>
              <input type="number" className="boarding-input" min="0"
                value={settings.cancellation_hours}
                onChange={e => updateSetting('cancellation_hours', e.target.value)}
                placeholder="48" />
              <span className="boarding-field-hint">Free cancellation before this many hours</span>
            </div>
          </div>

          {/* Toggles */}
          <div className="boarding-toggle-group">
            <label className="boarding-toggle">
              <input type="checkbox"
                checked={settings.allow_family_kennels}
                onChange={e => updateSetting('allow_family_kennels', e.target.checked)} />
              <span className="boarding-toggle-slider"></span>
              <span className="boarding-toggle-text">
                Allow family kennels (siblings from same owner share a kennel)
              </span>
            </label>

            <label className="boarding-toggle">
              <input type="checkbox"
                checked={settings.daily_checks_required}
                onChange={e => updateSetting('daily_checks_required', e.target.checked)} />
              <span className="boarding-toggle-slider"></span>
              <span className="boarding-toggle-text">
                Require daily welfare checks (eat, walk, BM, behavior logs)
              </span>
            </label>
          </div>

          {/* Notes */}
          <div className="boarding-field">
            <label className="boarding-label">Boarding Notes (optional)</label>
            <textarea className="boarding-textarea"
              value={settings.notes}
              onChange={e => updateSetting('notes', e.target.value)}
              placeholder="Any special boarding policies, hours of operation, etc."
              rows={3} />
          </div>

          <div className="boarding-form-actions">
            <button className="boarding-btn boarding-btn-secondary" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button className="boarding-btn boarding-btn-primary" onClick={saveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Continue →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Kennel Categories */}
      {step === 3 && (
        <div className="boarding-form-section">
          <h2>{
            settings.setup_type === 'numbered' ? 'Add Your Kennels' :
            settings.setup_type === 'capacity' ? 'Confirm Your Capacity' :
            settings.setup_type === 'sized' ? 'Set Up Your Size Categories' :
            settings.setup_type === 'tiered' ? 'Set Up Your Tiers' :
            'Set Up Your Kennel Categories'
          }</h2>
          <p className="boarding-form-hint">{
            settings.setup_type === 'numbered' ? 'List each physical kennel by number. Use the Quick Add below to spin up Kennel 1 through N in one click.' :
            settings.setup_type === 'capacity' ? 'You\'re tracking total dogs per night, not individual kennels. Just create ONE category that represents your max capacity.' :
            settings.setup_type === 'sized' ? 'Define each size with its own price. Most shops use Small / Medium / Large — click Quick Add Standard Sizes to start, then edit prices.' :
            settings.setup_type === 'tiered' ? 'Define each quality tier with its own price. Most shops use Standard + Suite — click Quick Add Tiers, then edit prices and add more if needed.' :
            'Create categories for your kennels.'
          }</p>

          {/* ── TYPE-SPECIFIC QUICK SETUP — pre-fills the form so user isn't staring at blank inputs ── */}
          {categories.length === 0 && (
            <div style={{ background: '#f8fafc', border: '1px dashed #94a3b8', borderRadius: 10, padding: 16, marginBottom: 18 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, color: '#334155', fontSize: 14 }}>⚡ Quick Setup</div>

              {settings.setup_type === 'numbered' && (
                <div>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>
                    How many numbered kennels do you have? We'll auto-create them as Kennel 1, 2, 3…
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={newCategory.default_capacity || ''}
                      onChange={e => setNewCategory({ ...newCategory, default_capacity: e.target.value })}
                      placeholder="e.g. 10"
                      style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, width: 100 }}
                    />
                    <span style={{ color: '#475569' }}>kennels at</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newCategory.base_price || ''}
                      onChange={e => setNewCategory({ ...newCategory, base_price: e.target.value })}
                      placeholder="50"
                      style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, width: 100 }}
                    />
                    <span style={{ color: '#475569' }}>$/night each</span>
                    <button
                      type="button"
                      className="boarding-btn boarding-btn-primary"
                      style={{ padding: '8px 14px' }}
                      onClick={async () => {
                        var n = parseInt(newCategory.default_capacity) || 0
                        var price = parseFloat(newCategory.base_price) || 0
                        if (n < 1) { alert('Enter how many kennels you have'); return }
                        var { data: { user } } = await supabase.auth.getUser()
                        if (!user) return
                        var rows = []
                        for (var i = 1; i <= n; i++) {
                          rows.push({
                            groomer_id: user.id,
                            name: 'Kennel ' + i,
                            description: '',
                            size_label: '',
                            base_price: price,
                            default_capacity: 1,
                            display_order: i - 1,
                          })
                        }
                        var { data: inserted, error } = await supabase.from('kennel_categories').insert(rows).select()
                        if (error) { alert('Error: ' + error.message); return }
                        setCategories(inserted || [])
                        setNewCategory({ name: '', description: '', size_label: '', base_price: 0, default_capacity: 1 })
                      }}
                    >Auto-create kennels</button>
                  </div>
                </div>
              )}

              {settings.setup_type === 'capacity' && (
                <div>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>
                    Set your total capacity — the max dogs you can take in one night.
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: '#475569' }}>Max</span>
                    <input
                      type="number"
                      min="1"
                      value={newCategory.default_capacity || ''}
                      onChange={e => setNewCategory({ ...newCategory, default_capacity: e.target.value })}
                      placeholder="20"
                      style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, width: 100 }}
                    />
                    <span style={{ color: '#475569' }}>dogs at</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newCategory.base_price || ''}
                      onChange={e => setNewCategory({ ...newCategory, base_price: e.target.value })}
                      placeholder="50"
                      style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14, width: 100 }}
                    />
                    <span style={{ color: '#475569' }}>$/night per dog</span>
                    <button
                      type="button"
                      className="boarding-btn boarding-btn-primary"
                      style={{ padding: '8px 14px' }}
                      onClick={async () => {
                        var capacity = parseInt(newCategory.default_capacity) || 1
                        var price = parseFloat(newCategory.base_price) || 0
                        var { data: { user } } = await supabase.auth.getUser()
                        if (!user) return
                        var { data: inserted, error } = await supabase.from('kennel_categories').insert({
                          groomer_id: user.id,
                          name: 'Boarding (Capacity)',
                          description: 'Single capacity bucket — no individual kennel tracking',
                          size_label: '',
                          base_price: price,
                          default_capacity: capacity,
                          display_order: 0,
                        }).select().single()
                        if (error) { alert('Error: ' + error.message); return }
                        setCategories([inserted])
                      }}
                    >Set capacity</button>
                  </div>
                </div>
              )}

              {settings.setup_type === 'sized' && (
                <div>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>
                    Spin up Small, Medium, Large categories with starter prices. Edit prices and counts after.
                  </p>
                  <button
                    type="button"
                    className="boarding-btn boarding-btn-primary"
                    style={{ padding: '8px 14px' }}
                    onClick={async () => {
                      var { data: { user } } = await supabase.auth.getUser()
                      if (!user) return
                      var rows = [
                        { groomer_id: user.id, name: 'Small Kennel',  size_label: 'Small',  base_price: 35, default_capacity: 1, display_order: 0 },
                        { groomer_id: user.id, name: 'Medium Kennel', size_label: 'Medium', base_price: 45, default_capacity: 1, display_order: 1 },
                        { groomer_id: user.id, name: 'Large Kennel',  size_label: 'Large',  base_price: 60, default_capacity: 1, display_order: 2 },
                      ]
                      var { data: inserted, error } = await supabase.from('kennel_categories').insert(rows).select()
                      if (error) { alert('Error: ' + error.message); return }
                      setCategories(inserted || [])
                    }}
                  >Quick Add Standard Sizes (S/M/L)</button>
                </div>
              )}

              {settings.setup_type === 'tiered' && (
                <div>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: '#475569' }}>
                    Spin up Standard + Suite tiers with starter prices. Edit prices and add more tiers after.
                  </p>
                  <button
                    type="button"
                    className="boarding-btn boarding-btn-primary"
                    style={{ padding: '8px 14px' }}
                    onClick={async () => {
                      var { data: { user } } = await supabase.auth.getUser()
                      if (!user) return
                      var rows = [
                        { groomer_id: user.id, name: 'Standard Run', size_label: 'Standard', base_price: 45, default_capacity: 1, display_order: 0, description: 'Standard kennel run' },
                        { groomer_id: user.id, name: 'Luxury Suite', size_label: 'Suite',    base_price: 85, default_capacity: 1, display_order: 1, description: 'Premium suite with raised bed + bigger space' },
                      ]
                      var { data: inserted, error } = await supabase.from('kennel_categories').insert(rows).select()
                      if (error) { alert('Error: ' + error.message); return }
                      setCategories(inserted || [])
                    }}
                  >Quick Add Standard + Suite</button>
                </div>
              )}
            </div>
          )}

          {/* Existing categories */}
          {categories.length > 0 && (
            <div className="boarding-categories-list">
              {categories.map((cat, index) => (
                <div key={cat.id} className="boarding-category-card">
                  <div className="boarding-category-info">
                    <div className="boarding-category-name">{cat.name}</div>
                    {cat.description && <div className="boarding-category-desc">{cat.description}</div>}
                    <div className="boarding-category-details">
                      {cat.size_label && <span className="boarding-tag">{cat.size_label}</span>}
                      <span className="boarding-tag">${parseFloat(cat.base_price || 0).toFixed(2)}/night</span>
                      <span className="boarding-tag">Holds {cat.default_capacity} dog{cat.default_capacity !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <button className="boarding-btn-delete" onClick={() => deleteCategory(cat.id)} title="Delete category">
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new category form */}
          <div className="boarding-add-category">
            <h3>+ Add Category</h3>
            <div className="boarding-field-row">
              <div className="boarding-field">
                <label className="boarding-label">Category Name *</label>
                <input type="text" className="boarding-input"
                  value={newCategory.name}
                  onChange={e => setNewCategory({ ...newCategory, name: e.target.value })}
                  placeholder='e.g. "Standard Run", "Large Suite", "Cat Condo"' />
              </div>
              <div className="boarding-field">
                <label className="boarding-label">Size Label</label>
                <input type="text" className="boarding-input"
                  value={newCategory.size_label}
                  onChange={e => setNewCategory({ ...newCategory, size_label: e.target.value })}
                  placeholder='e.g. "Small", "Medium", "Large", "XL"' />
              </div>
            </div>
            <div className="boarding-field-row">
              <div className="boarding-field">
                <label className="boarding-label">Price Per Night ($)</label>
                <input type="number" className="boarding-input" min="0" step="0.01"
                  value={newCategory.base_price}
                  onChange={e => setNewCategory({ ...newCategory, base_price: e.target.value })}
                  placeholder="0.00" />
              </div>
              <div className="boarding-field">
                <label className="boarding-label">Max Dogs Per Kennel</label>
                <input type="number" className="boarding-input" min="1" max="5"
                  value={newCategory.default_capacity}
                  onChange={e => setNewCategory({ ...newCategory, default_capacity: e.target.value })}
                  placeholder="1" />
                <span className="boarding-field-hint">For family sharing</span>
              </div>
            </div>
            <div className="boarding-field">
              <label className="boarding-label">Description (optional)</label>
              <input type="text" className="boarding-input"
                value={newCategory.description}
                onChange={e => setNewCategory({ ...newCategory, description: e.target.value })}
                placeholder='e.g. "4x6 indoor/outdoor run with raised bed"' />
            </div>
            <button className="boarding-btn boarding-btn-primary" onClick={addCategory}>
              + Add Category
            </button>
          </div>

          <div className="boarding-form-actions">
            <button className="boarding-btn boarding-btn-secondary" onClick={() => setStep(2)}>
              ← Back to Pricing
            </button>
            {categories.length > 0 && (
              <button className="boarding-btn boarding-btn-primary" onClick={() => {
                setSuccess(true)
                setStep(4)
              }}>
                Finish Setup →
              </button>
            )}
          </div>

          {categories.length === 0 && (
            <p className="boarding-form-hint" style={{ marginTop: '16px', color: '#e74c3c' }}>
              Add at least one kennel category to continue.
            </p>
          )}
        </div>
      )}

      {/* Step 4: Done! */}
      {step === 4 && success && (
        <div className="boarding-form-section boarding-success">
          <div className="boarding-success-icon">🎉</div>
          <h2>Boarding Setup Complete!</h2>
          <p>Your boarding is configured with {categories.length} kennel categor{categories.length === 1 ? 'y' : 'ies'}.</p>

          <div className="boarding-success-summary">
            <div className="boarding-summary-item">
              <strong>Setup Type:</strong> {
                { numbered: 'Numbered Kennels', capacity: 'Capacity Based', sized: 'Sized Kennels', tiered: 'Suites & Standard' }[settings.setup_type]
              }
            </div>
            <div className="boarding-summary-item">
              <strong>Pricing:</strong> {
                { flat: 'Flat rate', by_weight: 'By weight', by_kennel: 'By kennel type', custom: 'Custom' }[settings.pricing_model]
              } — ${parseFloat(settings.base_nightly_rate || 0).toFixed(2)}/night base
            </div>
            <div className="boarding-summary-item">
              <strong>Family Kennels:</strong> {settings.allow_family_kennels ? 'Yes' : 'No'}
            </div>
            <div className="boarding-summary-item">
              <strong>Daily Checks:</strong> {settings.daily_checks_required ? 'Required' : 'Optional'}
            </div>
            <div className="boarding-summary-item">
              <strong>Categories:</strong> {categories.map(c => c.name).join(', ')}
            </div>
          </div>

          <div className="boarding-success-actions">
            <button className="boarding-btn boarding-btn-primary" onClick={() => navigate('/boarding/kennels')}>
              Add Individual Kennels →
            </button>
            <button className="boarding-btn boarding-btn-secondary" onClick={() => setStep(1)}>
              Edit Settings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
