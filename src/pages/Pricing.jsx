import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CATEGORY_LABELS = {
  full_groom: '✂️ Full Groom',
  mini_groom: '🔹 Mini Groom',
  puppy: '🐶 Puppy Services',
  bath_brush: '🛁 Bath & Brush / Outline Trim',
  express_service: '⚡ Express Service',
  de_matting: '🪢 De-Matting',
  de_shed: '🌬️ De-Shed',
  nail_trim: '💅 Nail Trim',
  nail_filing: '📐 Nail Filing',
  face_trim: '😊 Face Trim',
  sanitary_trim: '✂️ Sanitary Trim',
  paw_pad_trim: '🐾 Paw Pad Trim',
  hand_scissoring: '✂️ Hand Scissoring',
  ear_cleaning: '👂 Ear Cleaning',
  teeth_brushing: '🦷 Teeth Brushing',
  anal_glands: '⚕️ Anal Glands',
  flea_bath: '🐛 Flea Bath',
  special_shampoo: '🧴 Special Shampoo',
  blueberry_facial: '🫐 Blueberry Facial',
  bow_bandana: '🎀 Bow & Bandana',
  add_on: '✨ Add-Ons',
  other: '📦 Other',
}

const CATEGORY_COLORS = {
  full_groom: '#7c3aed',      // purple
  mini_groom: '#0ea5e9',      // sky blue
  puppy: '#f59e0b',           // orange
  bath_brush: '#2563eb',      // blue
  express_service: '#eab308', // yellow
  de_matting: '#9333ea',      // purple-pink
  de_shed: '#0891b2',         // cyan
  nail_trim: '#ec4899',       // pink
  nail_filing: '#db2777',     // darker pink
  face_trim: '#f97316',       // orange-red
  sanitary_trim: '#14b8a6',   // teal
  paw_pad_trim: '#a855f7',    // violet
  hand_scissoring: '#6366f1', // indigo
  ear_cleaning: '#8b5cf6',    // light purple
  teeth_brushing: '#06b6d4',  // light cyan
  anal_glands: '#78716c',     // stone gray
  flea_bath: '#65a30d',       // lime
  special_shampoo: '#10b981', // emerald
  blueberry_facial: '#6d28d9',// deep purple
  bow_bandana: '#f43f5e',     // rose
  add_on: '#16a34a',          // green
  other: '#64748b',           // slate
}

const CATEGORY_ORDER = [
  'full_groom',
  'mini_groom',
  'puppy',
  'bath_brush',
  'express_service',
  'de_matting',
  'de_shed',
  'nail_trim',
  'nail_filing',
  'face_trim',
  'sanitary_trim',
  'paw_pad_trim',
  'hand_scissoring',
  'ear_cleaning',
  'teeth_brushing',
  'anal_glands',
  'flea_bath',
  'special_shampoo',
  'blueberry_facial',
  'bow_bandana',
  'add_on',
  'other',
]

const EMPTY_SERVICE = {
  service_name: '',
  category: 'full_groom',
  description: '',
  price: '',
  price_type: 'fixed',
  price_max: '',
  time_block_minutes: 60,
  weight_min: '',
  weight_max: '',
  coat_type: '',
  age_min_months: '',
  age_max_months: '',
}

export default function Pricing() {
  const [services, setServices] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_SERVICE })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()

    const { data: servicesData } = await supabase
      .from('services')
      .select('*')
      .eq('groomer_id', user.id)
      .order('sort_order', { ascending: true })

    setServices(servicesData || [])

    const { data: settingsData } = await supabase
      .from('groomer_settings')
      .select('*')
      .eq('groomer_id', user.id)
      .single()

    if (settingsData) {
      setSettings(settingsData)
    } else {
      const { data: newSettings } = await supabase
        .from('groomer_settings')
        .insert({ groomer_id: user.id })
        .select()
        .single()
      setSettings(newSettings)
    }

    setLoading(false)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm({ ...form, [name]: value })
  }

  const handleSettingsChange = async (field, value) => {
    const updated = { ...settings, [field]: value }
    setSettings(updated)
    await supabase
      .from('groomer_settings')
      .update({ [field]: value })
      .eq('id', settings.id)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()

    const serviceData = {
      groomer_id: user.id,
      service_name: form.service_name,
      category: form.category,
      description: form.description || null,
      price: parseFloat(form.price),
      price_type: form.price_type,
      price_max: form.price_max ? parseFloat(form.price_max) : null,
      time_block_minutes: parseInt(form.time_block_minutes),
      weight_min: form.weight_min ? parseFloat(form.weight_min) : null,
      weight_max: form.weight_max ? parseFloat(form.weight_max) : null,
      coat_type: form.coat_type || null,
      age_min_months: form.age_min_months ? parseInt(form.age_min_months) : null,
      age_max_months: form.age_max_months ? parseInt(form.age_max_months) : null,
    }

    let result
    if (editingId) {
      result = await supabase.from('services').update(serviceData).eq('id', editingId)
    } else {
      result = await supabase.from('services').insert(serviceData)
    }

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    setForm({ ...EMPTY_SERVICE })
    setShowForm(false)
    setEditingId(null)
    setSaving(false)
    fetchData()
  }

  const handleEdit = (service) => {
    setForm({
      service_name: service.service_name,
      category: service.category,
      description: service.description || '',
      price: service.price,
      price_type: service.price_type,
      price_max: service.price_max || '',
      time_block_minutes: service.time_block_minutes,
      weight_min: service.weight_min || '',
      weight_max: service.weight_max || '',
      coat_type: service.coat_type || '',
      age_min_months: service.age_min_months || '',
      age_max_months: service.age_max_months || '',
    })
    setEditingId(service.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this service? This cannot be undone.')) return
    await supabase.from('services').delete().eq('id', id)
    fetchData()
  }

  const handleToggleActive = async (service) => {
    await supabase
      .from('services')
      .update({ is_active: !service.is_active })
      .eq('id', service.id)
    fetchData()
  }

  const formatPrice = (service) => {
    if (service.price_type === 'range' && service.price_max) {
      return `$${service.price} — $${service.price_max}`
    }
    if (service.price_type === 'starting_at') {
      return `From $${service.price}`
    }
    return `$${parseFloat(service.price).toFixed(2)}`
  }

  const formatTime = (minutes) => {
    if (minutes < 60) return `${minutes} min`
    const hrs = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) return `${hrs} hr`
    return `${hrs} hr ${mins} min`
  }

  const totalActive = services.filter(s => s.is_active).length

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, color: '#64748b' }}>
        <div style={{ fontSize: 48, animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 16 }}>🐾</div>
        <p>Loading pricing...</p>
      </div>
    )
  }

  return (
    <div className="pr-page">
      {/* Header */}
      <div className="pr-header">
        <Link to="/" className="pr-back">← Back to Dashboard</Link>
        <div className="pr-header-row">
          <div>
            <h1 className="pr-title">✂️ Pricing & Services</h1>
            <p className="pr-subtitle">{services.length} service{services.length !== 1 ? 's' : ''} configured · {totalActive} active</p>
          </div>
          <button
            className="pr-btn-add"
            onClick={() => {
              setForm({ ...EMPTY_SERVICE })
              setEditingId(null)
              setShowForm(true)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            + Add Service
          </button>
        </div>
      </div>

      {/* Shop Settings */}
      {settings && (
        <div className="pr-settings-card">
          <div className="pr-settings-header">
            <h3>⚙️ Shop Settings</h3>
            <span className="pr-settings-badge">🤖 Claude uses these for smart pricing</span>
          </div>
          <div className="pr-settings-grid">
            <div className="pr-setting-item">
              <label className="pr-setting-label">Puppy Intro Max Age</label>
              <div className="pr-setting-input-row">
                <input
                  type="number"
                  className="pr-setting-input"
                  value={settings.puppy_intro_max_months}
                  onChange={(e) => handleSettingsChange('puppy_intro_max_months', parseInt(e.target.value))}
                />
                <span className="pr-setting-unit">months</span>
              </div>
              <span className="pr-setting-help">Intro grooming for puppies under this age</span>
            </div>
            <div className="pr-setting-item">
              <label className="pr-setting-label">Adult Pricing After</label>
              <div className="pr-setting-input-row">
                <input
                  type="number"
                  className="pr-setting-input"
                  value={settings.puppy_adult_cutoff_months}
                  onChange={(e) => handleSettingsChange('puppy_adult_cutoff_months', parseInt(e.target.value))}
                />
                <span className="pr-setting-unit">months</span>
              </div>
              <span className="pr-setting-help">Claude flags when puppy needs adult pricing</span>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="pr-form-overlay">
          <div className="pr-form-card">
            <div className="pr-form-header">
              <h2>{editingId ? '✏️ Edit Service' : '✨ Add New Service'}</h2>
              <button className="pr-form-close" onClick={() => { setShowForm(false); setEditingId(null) }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="pr-form-grid">
                <div className="pr-form-group pr-form-span-2">
                  <label>Service Name *</label>
                  <input
                    type="text"
                    name="service_name"
                    value={form.service_name}
                    onChange={handleChange}
                    placeholder="e.g. Full Groom Under 10lbs"
                    required
                    className="pr-input"
                  />
                </div>
                <div className="pr-form-group">
                  <label>Category *</label>
                  <select name="category" value={form.category} onChange={handleChange} className="pr-input">
                    <option value="full_groom">✂️ Full Groom</option>
                    <option value="mini_groom">🔹 Mini Groom</option>
                    <option value="puppy">🐶 Puppy Services</option>
                    <option value="bath_brush">🛁 Bath & Brush / Outline Trim</option>
                    <option value="express_service">⚡ Express Service</option>
                    <option value="de_matting">🪢 De-Matting</option>
                    <option value="de_shed">🌬️ De-Shed</option>
                    <option value="nail_trim">💅 Nail Trim</option>
                    <option value="nail_filing">📐 Nail Filing</option>
                    <option value="face_trim">😊 Face Trim</option>
                    <option value="sanitary_trim">✂️ Sanitary Trim</option>
                    <option value="paw_pad_trim">🐾 Paw Pad Trim</option>
                    <option value="hand_scissoring">✂️ Hand Scissoring</option>
                    <option value="ear_cleaning">👂 Ear Cleaning</option>
                    <option value="teeth_brushing">🦷 Teeth Brushing</option>
                    <option value="anal_glands">⚕️ Anal Glands</option>
                    <option value="flea_bath">🐛 Flea Bath</option>
                    <option value="special_shampoo">🧴 Special Shampoo</option>
                    <option value="blueberry_facial">🫐 Blueberry Facial</option>
                    <option value="bow_bandana">🎀 Bow & Bandana</option>
                    <option value="add_on">✨ Add-On</option>
                    <option value="other">📦 Other</option>
                  </select>
                </div>
                <div className="pr-form-group">
                  <label>Time Block *</label>
                  <select name="time_block_minutes" value={form.time_block_minutes} onChange={handleChange} className="pr-input">
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                    <option value="150">2.5 hours</option>
                    <option value="180">3 hours</option>
                  </select>
                </div>
              </div>

              <div className="pr-form-group" style={{ marginTop: 12 }}>
                <label>Description</label>
                <input
                  type="text"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="e.g. Includes bath, haircut, nails, ears, anal glands"
                  className="pr-input"
                />
              </div>

              <div className="pr-form-divider">💰 Pricing</div>
              <div className="pr-form-grid">
                <div className="pr-form-group">
                  <label>Price Type</label>
                  <select name="price_type" value={form.price_type} onChange={handleChange} className="pr-input">
                    <option value="fixed">Fixed Price</option>
                    <option value="range">Price Range</option>
                    <option value="starting_at">Starting At</option>
                  </select>
                </div>
                <div className="pr-form-group">
                  <label>Price ($) *</label>
                  <input type="number" name="price" value={form.price} onChange={handleChange} step="0.01" required className="pr-input" />
                </div>
                {form.price_type === 'range' && (
                  <div className="pr-form-group">
                    <label>Max Price ($)</label>
                    <input type="number" name="price_max" value={form.price_max} onChange={handleChange} step="0.01" className="pr-input" />
                  </div>
                )}
              </div>

              {form.category !== 'add_on' && (
                <>
                  <div className="pr-form-divider">📏 Size & Coat Filters</div>
                  <div className="pr-form-grid">
                    <div className="pr-form-group">
                      <label>Min Weight (lbs)</label>
                      <input type="number" name="weight_min" value={form.weight_min} onChange={handleChange} className="pr-input" />
                    </div>
                    <div className="pr-form-group">
                      <label>Max Weight (lbs)</label>
                      <input type="number" name="weight_max" value={form.weight_max} onChange={handleChange} className="pr-input" />
                    </div>
                    <div className="pr-form-group">
                      <label>Coat Type</label>
                      <select name="coat_type" value={form.coat_type} onChange={handleChange} className="pr-input">
                        <option value="">Any</option>
                        <option value="smooth">Smooth</option>
                        <option value="double">Double Coat</option>
                        <option value="curly">Curly</option>
                        <option value="wire">Wire / Rough</option>
                        <option value="doodle">Doodle</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {form.category === 'puppy' && (
                <>
                  <div className="pr-form-divider">🐶 Puppy Age Range</div>
                  <div className="pr-form-grid">
                    <div className="pr-form-group">
                      <label>Min Age (months)</label>
                      <input type="number" name="age_min_months" value={form.age_min_months} onChange={handleChange} className="pr-input" />
                    </div>
                    <div className="pr-form-group">
                      <label>Max Age (months)</label>
                      <input type="number" name="age_max_months" value={form.age_max_months} onChange={handleChange} className="pr-input" />
                    </div>
                  </div>
                </>
              )}

              {error && <div className="pr-error">⚠️ {error}</div>}

              <div className="pr-form-actions">
                <button type="button" className="pr-btn-cancel" onClick={() => { setShowForm(false); setEditingId(null) }}>
                  Cancel
                </button>
                <button type="submit" className="pr-btn-save" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? '🐾 Update Service' : '🐾 Save Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Services by Category */}
      {services.length === 0 && !showForm ? (
        <div className="pr-empty">
          <div style={{ fontSize: 64, marginBottom: 16 }}>✂️</div>
          <h3>No services yet</h3>
          <p>Add your first grooming service to get started!</p>
          <button className="pr-btn-add" onClick={() => setShowForm(true)} style={{ marginTop: 16 }}>
            + Add Your First Service
          </button>
        </div>
      ) : (
        <div className="pr-categories">
          {CATEGORY_ORDER.map((cat) => {
            const catServices = services.filter((s) => s.category === cat)
            if (catServices.length === 0) return null
            const color = CATEGORY_COLORS[cat]
            return (
              <div key={cat} className="pr-category">
                <div className="pr-category-header" style={{ borderLeft: `4px solid ${color}` }}>
                  <h2 className="pr-category-title">{CATEGORY_LABELS[cat]}</h2>
                  <span className="pr-category-count">{catServices.length} service{catServices.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="pr-service-list">
                  {catServices.map((service) => (
                    <div
                      key={service.id}
                      className={`pr-service-card ${!service.is_active ? 'pr-service-inactive' : ''}`}
                    >
                      <div className="pr-service-main">
                        <div className="pr-service-info">
                          <div className="pr-service-name-row">
                            <h3 className="pr-service-name">{service.service_name}</h3>
                            {!service.is_active && <span className="pr-disabled-badge">Disabled</span>}
                          </div>
                          {service.description && (
                            <p className="pr-service-desc">{service.description}</p>
                          )}
                          <div className="pr-service-tags">
                            {service.weight_min && service.weight_max && (
                              <span className="pr-tag">⚖️ {service.weight_min}–{service.weight_max} lbs</span>
                            )}
                            {service.weight_min && !service.weight_max && (
                              <span className="pr-tag">⚖️ {service.weight_min}+ lbs</span>
                            )}
                            {!service.weight_min && service.weight_max && (
                              <span className="pr-tag">⚖️ Under {service.weight_max} lbs</span>
                            )}
                            {service.coat_type && <span className="pr-tag">🐾 {service.coat_type} coat</span>}
                            {service.age_min_months !== null && service.age_max_months !== null && service.category === 'puppy' && (
                              <span className="pr-tag">🐶 {service.age_min_months}–{service.age_max_months} mo</span>
                            )}
                            <span className="pr-tag">⏱️ {formatTime(service.time_block_minutes)}</span>
                          </div>
                        </div>
                        <div className="pr-service-price" style={{ color }}>
                          {formatPrice(service)}
                        </div>
                      </div>
                      <div className="pr-service-actions">
                        <button className="pr-action-btn pr-action-toggle" onClick={() => handleToggleActive(service)}>
                          {service.is_active ? '⏸️ Disable' : '▶️ Enable'}
                        </button>
                        <button className="pr-action-btn pr-action-edit" onClick={() => handleEdit(service)}>
                          ✏️ Edit
                        </button>
                        <button className="pr-action-btn pr-action-delete" onClick={() => handleDelete(service.id)}>
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
