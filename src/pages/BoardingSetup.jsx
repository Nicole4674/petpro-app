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

          {/* Pricing Model */}
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
                <input type="radio" name="pricing" value="by_kennel"
                  checked={settings.pricing_model === 'by_kennel'}
                  onChange={() => updateSetting('pricing_model', 'by_kennel')} />
                <span>By kennel type</span>
              </label>
              <label className="boarding-radio">
                <input type="radio" name="pricing" value="custom"
                  checked={settings.pricing_model === 'custom'}
                  onChange={() => updateSetting('pricing_model', 'custom')} />
                <span>Custom per booking</span>
              </label>
            </div>
          </div>

          {/* Base Rate */}
          <div className="boarding-field-row">
            <div className="boarding-field">
              <label className="boarding-label">Base Nightly Rate ($)</label>
              <input type="number" className="boarding-input" min="0" step="0.01"
                value={settings.base_nightly_rate}
                onChange={e => updateSetting('base_nightly_rate', e.target.value)}
                placeholder="0.00" />
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
          <h2>Set Up Your Kennel Categories</h2>
          <p className="boarding-form-hint">
            Create categories for your kennels. Example: "Standard Run", "Large Suite", "Cat Condo".
            You'll add individual kennels to each category next.
          </p>

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
