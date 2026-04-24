import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

var ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  groomer: 'Groomer',
  bather: 'Bather',
  kennel_tech: 'Kennel Tech',
  front_desk: 'Front Desk',
  trainer: 'Trainer'
}

// Preset color swatches — two rows:
//   BRIGHT (default, high-contrast, easy to spot on a busy calendar)
//   NEUTRAL (for groomers who prefer calmer, earth-tone colors)
// Click any swatch to set the staff member's calendar color.
// Custom color picker below stays for anyone who wants a specific hex.
var BRIGHT_COLORS = [
  { name: 'Purple',  hex: '#7c3aed' },
  { name: 'Blue',    hex: '#2563eb' },
  { name: 'Cyan',    hex: '#0891b2' },
  { name: 'Green',   hex: '#16a34a' },
  { name: 'Amber',   hex: '#f59e0b' },
  { name: 'Orange',  hex: '#ea580c' },
  { name: 'Red',     hex: '#dc2626' },
  { name: 'Pink',    hex: '#d946ef' },
]
var NEUTRAL_COLORS = [
  { name: 'Tan',        hex: '#d4a574' },
  { name: 'Taupe',      hex: '#a8937a' },
  { name: 'Cream',      hex: '#e8dfd0' },
  { name: 'Sage',       hex: '#9caf88' },
  { name: 'Dusty Rose', hex: '#c9a0a0' },
  { name: 'Stone',      hex: '#9ca3af' },
  { name: 'Slate',      hex: '#64748b' },
  { name: 'Charcoal',   hex: '#334155' },
]

var ROLE_COLORS = {
  owner: '#7c3aed',
  manager: '#2563eb',
  groomer: '#d946ef',
  bather: '#0891b2',
  kennel_tech: '#16a34a',
  front_desk: '#f59e0b',
  trainer: '#ea580c'
}

var ROLE_ICONS = {
  owner: '👑',
  manager: '⭐',
  groomer: '✂️',
  bather: '🛁',
  kennel_tech: '🏠',
  front_desk: '🖥️',
  trainer: '🎓'
}

export default function StaffList() {
  var navigate = useNavigate()
  var [staff, setStaff] = useState([])
  var [loading, setLoading] = useState(true)
  var [search, setSearch] = useState('')
  var [filterRole, setFilterRole] = useState('all')
  var [filterStatus, setFilterStatus] = useState('active')
  var [showAddForm, setShowAddForm] = useState(false)
  var [saving, setSaving] = useState(false)
  var [newStaff, setNewStaff] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: 'groomer',
    color_code: '#d946ef',
    hire_date: '',
    pay_type: 'hourly',
    hourly_rate: '',
    commission_percent: '',
    internal_notes: ''
  })

  useEffect(function() {
    fetchStaff()
  }, [])

  async function fetchStaff() {
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    var { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .eq('groomer_id', user.id)
      .order('role', { ascending: true })
      .order('first_name', { ascending: true })

    if (!error && data) {
      setStaff(data)
    }
    setLoading(false)
  }

  async function handleAddStaff(e) {
    e.preventDefault()
    setSaving(true)

    var { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    var record = {
      groomer_id: user.id,
      first_name: newStaff.first_name.trim(),
      last_name: newStaff.last_name.trim(),
      email: newStaff.email.trim(),
      phone: newStaff.phone.trim() || null,
      role: newStaff.role,
      color_code: newStaff.color_code,
      hire_date: newStaff.hire_date || null,
      pay_type: newStaff.pay_type,
      hourly_rate: newStaff.hourly_rate ? parseFloat(newStaff.hourly_rate) : null,
      commission_percent: newStaff.commission_percent ? parseFloat(newStaff.commission_percent) : null,
      internal_notes: newStaff.internal_notes.trim() || null,
      status: 'active'
    }

    var { error } = await supabase.from('staff_members').insert([record])

    if (!error) {
      setShowAddForm(false)
      setNewStaff({
        first_name: '', last_name: '', email: '', phone: '',
        role: 'groomer', color_code: '#d946ef', hire_date: '',
        pay_type: 'hourly', hourly_rate: '', commission_percent: '',
        internal_notes: ''
      })
      fetchStaff()
    } else {
      alert('Error adding staff: ' + error.message)
    }
    setSaving(false)
  }

  async function toggleStatus(staffMember) {
    var newStatus = staffMember.status === 'active' ? 'inactive' : 'active'
    var { error } = await supabase
      .from('staff_members')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', staffMember.id)

    if (!error) {
      fetchStaff()
    }
  }

  function getInitials(first, last) {
    return ((first || '')[0] || '') + ((last || '')[0] || '')
  }

  function formatDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Filter staff
  var filtered = staff.filter(function(s) {
    var q = search.toLowerCase()
    var matchSearch = !q ||
      (s.first_name || '').toLowerCase().includes(q) ||
      (s.last_name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.phone || '').includes(q)
    var matchRole = filterRole === 'all' || s.role === filterRole
    var matchStatus = filterStatus === 'all' || s.status === filterStatus
    return matchSearch && matchRole && matchStatus
  })

  if (loading) {
    return (
      <div className="sl-loading">
        <div className="sl-loading-paw">🐾</div>
        <p>Loading staff...</p>
      </div>
    )
  }

  return (
    <div className="sl-page">
      {/* Header */}
      <div className="sl-header">
        <div className="sl-header-left">
          <h1 className="sl-title">👥 Staff & Team</h1>
          <p className="sl-subtitle">Manage your team, roles, and permissions</p>
        </div>
        <button className="sl-add-btn" onClick={function() { setShowAddForm(true) }}>
          ✨ Add Staff Member
        </button>
      </div>

      {/* Stats Cards */}
      <div className="sl-stats-row">
        <div className="sl-stat-card">
          <div className="sl-stat-number">{staff.length}</div>
          <div className="sl-stat-label">Total Staff</div>
        </div>
        <div className="sl-stat-card">
          <div className="sl-stat-number">{staff.filter(function(s) { return s.status === 'active' }).length}</div>
          <div className="sl-stat-label">Active</div>
        </div>
        <div className="sl-stat-card">
          <div className="sl-stat-number">{staff.filter(function(s) { return s.role === 'groomer' }).length}</div>
          <div className="sl-stat-label">Groomers</div>
        </div>
        <div className="sl-stat-card">
          <div className="sl-stat-number">{staff.filter(function(s) { return s.status === 'invited' }).length}</div>
          <div className="sl-stat-label">Pending Invites</div>
        </div>
      </div>

      {/* Filters */}
      <div className="sl-filters">
        <div className="sl-search-box">
          <span className="sl-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search staff by name, email, or phone..."
            value={search}
            onChange={function(e) { setSearch(e.target.value) }}
            className="sl-search-input"
          />
        </div>
        <select
          value={filterRole}
          onChange={function(e) { setFilterRole(e.target.value) }}
          className="sl-filter-select"
        >
          <option value="all">All Roles</option>
          <option value="owner">👑 Owner</option>
          <option value="manager">⭐ Manager</option>
          <option value="groomer">✂️ Groomer</option>
          <option value="bather">🛁 Bather</option>
          <option value="kennel_tech">🏠 Kennel Tech</option>
          <option value="front_desk">🖥️ Front Desk</option>
          <option value="trainer">🎓 Trainer</option>
        </select>
        <select
          value={filterStatus}
          onChange={function(e) { setFilterStatus(e.target.value) }}
          className="sl-filter-select"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="invited">Invited</option>
        </select>
      </div>

      {/* Staff Grid */}
      {filtered.length === 0 ? (
        <div className="sl-empty">
          <div className="sl-empty-icon">🐾</div>
          <h3>{staff.length === 0 ? 'No staff members yet' : 'No matches found'}</h3>
          <p>{staff.length === 0 ? 'Add your first team member to get started!' : 'Try adjusting your filters'}</p>
          {staff.length === 0 && (
            <button className="sl-add-btn" onClick={function() { setShowAddForm(true) }}>
              ✨ Add Your First Staff Member
            </button>
          )}
        </div>
      ) : (
        <div className="sl-grid">
          {filtered.map(function(s) {
            return (
              <div key={s.id} className={'sl-card' + (s.status === 'inactive' ? ' sl-card-inactive' : '')}>
                {/* Color stripe */}
                <div className="sl-card-stripe" style={{ backgroundColor: s.color_code || '#7c3aed' }}></div>

                <div className="sl-card-body">
                  {/* Avatar + Name */}
                  <div className="sl-card-top">
                    <div className="sl-avatar" style={{ backgroundColor: s.color_code || '#7c3aed' }}>
                      {s.profile_photo_url ? (
                        <img src={s.profile_photo_url} alt={s.first_name} className="sl-avatar-img" />
                      ) : (
                        <span className="sl-avatar-initials">{getInitials(s.first_name, s.last_name)}</span>
                      )}
                    </div>
                    <div className="sl-card-name-area">
                      <h3 className="sl-card-name">{s.first_name} {s.last_name}</h3>
                      <span className="sl-role-badge" style={{ backgroundColor: ROLE_COLORS[s.role] || '#7c3aed' }}>
                        {ROLE_ICONS[s.role] || '👤'} {ROLE_LABELS[s.role] || s.role}
                      </span>
                    </div>
                    <div className={'sl-status-dot' + (s.status === 'active' ? ' sl-status-active' : s.status === 'invited' ? ' sl-status-invited' : ' sl-status-inactive')}
                      title={s.status}
                    ></div>
                  </div>

                  {/* Contact Info */}
                  <div className="sl-card-info">
                    <div className="sl-info-row">
                      <span className="sl-info-icon">📧</span>
                      <span className="sl-info-text">{s.email}</span>
                    </div>
                    {s.phone && (
                      <div className="sl-info-row">
                        <span className="sl-info-icon">📱</span>
                        <span className="sl-info-text">{s.phone}</span>
                      </div>
                    )}
                    {s.hire_date && (
                      <div className="sl-info-row">
                        <span className="sl-info-icon">📅</span>
                        <span className="sl-info-text">Hired {formatDate(s.hire_date)}</span>
                      </div>
                    )}
                  </div>

                  {/* Pay Info */}
                  <div className="sl-card-pay">
                    {s.pay_type === 'hourly' && s.hourly_rate && (
                      <span className="sl-pay-tag">💵 ${parseFloat(s.hourly_rate).toFixed(2)}/hr</span>
                    )}
                    {s.pay_type === 'commission' && s.commission_percent && (
                      <span className="sl-pay-tag">📊 {s.commission_percent}% commission</span>
                    )}
                    {s.pay_type === 'hourly_commission' && (
                      <span className="sl-pay-tag">💵 ${parseFloat(s.hourly_rate || 0).toFixed(2)}/hr + {s.commission_percent || 0}%</span>
                    )}
                    {s.pay_type === 'salary' && (
                      <span className="sl-pay-tag">💼 Salary</span>
                    )}
                  </div>

                  {/* Internal Notes Preview */}
                  {s.internal_notes && (
                    <div className="sl-card-note">
                      📝 {s.internal_notes.length > 60 ? s.internal_notes.substring(0, 60) + '...' : s.internal_notes}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="sl-card-actions">
                    <button className="sl-action-btn sl-action-profile" onClick={function() { navigate('/staff/' + s.id) }}>
                      🐾 View Profile
                    </button>
                    <button
                      className={'sl-action-btn ' + (s.status === 'active' ? 'sl-action-deactivate' : 'sl-action-activate')}
                      onClick={function() { toggleStatus(s) }}
                    >
                      {s.status === 'active' ? '⏸️ Deactivate' : '▶️ Activate'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Staff Modal */}
      {showAddForm && (
        <div className="sl-modal-overlay" onClick={function(e) { if (e.target.className === 'sl-modal-overlay') setShowAddForm(false) }}>
          <div className="sl-modal">
            <div className="sl-modal-header">
              <h2>✨ Add New Staff Member</h2>
              <button className="sl-modal-close" onClick={function() { setShowAddForm(false) }}>✕</button>
            </div>

            <form onSubmit={handleAddStaff} className="sl-form">
              {/* Name Row */}
              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">First Name *</label>
                  <input
                    type="text"
                    value={newStaff.first_name}
                    onChange={function(e) { setNewStaff(Object.assign({}, newStaff, { first_name: e.target.value })) }}
                    className="sl-input"
                    required
                    placeholder="Sophia"
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Last Name *</label>
                  <input
                    type="text"
                    value={newStaff.last_name}
                    onChange={function(e) { setNewStaff(Object.assign({}, newStaff, { last_name: e.target.value })) }}
                    className="sl-input"
                    required
                    placeholder="Aceves"
                  />
                </div>
              </div>

              {/* Email + Phone */}
              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Email *</label>
                  <input
                    type="email"
                    value={newStaff.email}
                    onChange={function(e) { setNewStaff(Object.assign({}, newStaff, { email: e.target.value })) }}
                    className="sl-input"
                    required
                    placeholder="sophia@example.com"
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Phone</label>
                  <input
                    type="tel"
                    value={newStaff.phone}
                    onChange={function(e) { setNewStaff(Object.assign({}, newStaff, { phone: e.target.value })) }}
                    className="sl-input"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              {/* Role + Color */}
              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Role *</label>
                  <select
                    value={newStaff.role}
                    onChange={function(e) {
                      var r = e.target.value
                      setNewStaff(Object.assign({}, newStaff, { role: r, color_code: ROLE_COLORS[r] || '#7c3aed' }))
                    }}
                    className="sl-input"
                  >
                    <option value="owner">👑 Owner</option>
                    <option value="manager">⭐ Manager</option>
                    <option value="groomer">✂️ Groomer</option>
                    <option value="bather">🛁 Bather</option>
                    <option value="kennel_tech">🏠 Kennel Tech</option>
                    <option value="front_desk">🖥️ Front Desk</option>
                    <option value="trainer">🎓 Trainer</option>
                  </select>
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Calendar Color</label>
                  {/* Bright swatches */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    {BRIGHT_COLORS.map(function (c) {
                      var selected = newStaff.color_code === c.hex
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          title={c.name + ' (bright)'}
                          onClick={function () { setNewStaff(Object.assign({}, newStaff, { color_code: c.hex })) }}
                          style={{
                            width: '28px', height: '28px', borderRadius: '50%',
                            border: selected ? '3px solid #111827' : '2px solid #fff',
                            boxShadow: '0 0 0 1px #e5e7eb',
                            background: c.hex, cursor: 'pointer', padding: 0,
                          }}
                        />
                      )
                    })}
                  </div>
                  {/* Neutral swatches */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    {NEUTRAL_COLORS.map(function (c) {
                      var selected = newStaff.color_code === c.hex
                      return (
                        <button
                          key={c.hex}
                          type="button"
                          title={c.name + ' (neutral)'}
                          onClick={function () { setNewStaff(Object.assign({}, newStaff, { color_code: c.hex })) }}
                          style={{
                            width: '28px', height: '28px', borderRadius: '50%',
                            border: selected ? '3px solid #111827' : '2px solid #fff',
                            boxShadow: '0 0 0 1px #e5e7eb',
                            background: c.hex, cursor: 'pointer', padding: 0,
                          }}
                        />
                      )
                    })}
                  </div>
                  <div className="sl-color-picker-row">
                    <input
                      type="color"
                      value={newStaff.color_code}
                      onChange={function(e) { setNewStaff(Object.assign({}, newStaff, { color_code: e.target.value })) }}
                      className="sl-color-input"
                    />
                    <span className="sl-color-preview" style={{ backgroundColor: newStaff.color_code }}></span>
                    <span className="sl-color-hex">{newStaff.color_code}</span>
                    <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '8px' }}>or pick custom</span>
                  </div>
                </div>
              </div>

              {/* Hire Date */}
              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Hire Date</label>
                  <input
                    type="date"
                    value={newStaff.hire_date}
                    onChange={function(e) { setNewStaff(Object.assign({}, newStaff, { hire_date: e.target.value })) }}
                    className="sl-input"
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">Pay Type</label>
                  <select
                    value={newStaff.pay_type}
                    onChange={function(e) { setNewStaff(Object.assign({}, newStaff, { pay_type: e.target.value })) }}
                    className="sl-input"
                  >
                    <option value="hourly">💵 Hourly</option>
                    <option value="commission">📊 Commission</option>
                    <option value="salary">💼 Salary</option>
                    <option value="hourly_commission">💵 Hourly + Commission</option>
                  </select>
                </div>
              </div>

              {/* Pay Details */}
              <div className="sl-form-row">
                {(newStaff.pay_type === 'hourly' || newStaff.pay_type === 'hourly_commission') && (
                  <div className="sl-form-group">
                    <label className="sl-label">Hourly Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newStaff.hourly_rate}
                      onChange={function(e) { setNewStaff(Object.assign({}, newStaff, { hourly_rate: e.target.value })) }}
                      className="sl-input"
                      placeholder="15.00"
                    />
                  </div>
                )}
                {(newStaff.pay_type === 'commission' || newStaff.pay_type === 'hourly_commission') && (
                  <div className="sl-form-group">
                    <label className="sl-label">Commission %</label>
                    <input
                      type="number"
                      step="0.5"
                      value={newStaff.commission_percent}
                      onChange={function(e) { setNewStaff(Object.assign({}, newStaff, { commission_percent: e.target.value })) }}
                      className="sl-input"
                      placeholder="40"
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="sl-form-group">
                <label className="sl-label">Internal Notes (only visible to Owner/Manager)</label>
                <textarea
                  value={newStaff.internal_notes}
                  onChange={function(e) { setNewStaff(Object.assign({}, newStaff, { internal_notes: e.target.value })) }}
                  className="sl-textarea"
                  rows="3"
                  placeholder="Great with anxious dogs, prefers morning shifts..."
                />
              </div>

              {/* Submit */}
              <div className="sl-form-actions">
                <button type="button" className="sl-cancel-btn" onClick={function() { setShowAddForm(false) }}>
                  Cancel
                </button>
                <button type="submit" className="sl-submit-btn" disabled={saving}>
                  {saving ? '🐾 Adding...' : '✨ Add Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
