import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import '../boarding-styles.css'

export default function Kennels() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [kennels, setKennels] = useState([])
  const [showAddForm, setShowAddForm] = useState(null) // category_id or null
  const [newKennel, setNewKennel] = useState({ name: '', notes: '' })
  const [editingKennel, setEditingKennel] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Load categories
      const { data: cats } = await supabase
        .from('kennel_categories')
        .select('*')
        .eq('groomer_id', user.id)
        .order('display_order')

      // Load all kennels
      const { data: kens } = await supabase
        .from('kennels')
        .select('*')
        .eq('groomer_id', user.id)
        .order('position')

      setCategories(cats || [])
      setKennels(kens || [])
    } catch (err) {
      console.error('Error loading kennels:', err)
    } finally {
      setLoading(false)
    }
  }

  function getKennelsForCategory(categoryId) {
    return kennels.filter(k => k.category_id === categoryId)
  }

  async function addKennel(categoryId) {
    if (!newKennel.name.trim()) {
      alert('Please enter a kennel name')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const categoryKennels = getKennelsForCategory(categoryId)

      const { data, error } = await supabase
        .from('kennels')
        .insert({
          groomer_id: user.id,
          category_id: categoryId,
          name: newKennel.name.trim(),
          notes: newKennel.notes.trim(),
          position: categoryKennels.length,
          is_active: true,
          is_under_maintenance: false
        })
        .select()
        .single()

      if (error) throw error

      setKennels([...kennels, data])
      setNewKennel({ name: '', notes: '' })
      setShowAddForm(null)
    } catch (err) {
      console.error('Error adding kennel:', err)
      alert('Error: ' + err.message)
    }
  }

  async function quickAddKennels(categoryId, categoryName, count) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const existing = getKennelsForCategory(categoryId)
      const startNum = existing.length + 1
      const newKennels = []

      for (let i = 0; i < count; i++) {
        newKennels.push({
          groomer_id: user.id,
          category_id: categoryId,
          name: categoryName + ' ' + (startNum + i),
          notes: '',
          position: existing.length + i,
          is_active: true,
          is_under_maintenance: false
        })
      }

      const { data, error } = await supabase
        .from('kennels')
        .insert(newKennels)
        .select()

      if (error) throw error

      setKennels([...kennels, ...data])
    } catch (err) {
      console.error('Error quick-adding kennels:', err)
      alert('Error: ' + err.message)
    }
  }

  async function toggleKennelActive(kennel) {
    try {
      const { error } = await supabase
        .from('kennels')
        .update({ is_active: !kennel.is_active })
        .eq('id', kennel.id)

      if (error) throw error

      setKennels(kennels.map(k =>
        k.id === kennel.id ? { ...k, is_active: !k.is_active } : k
      ))
    } catch (err) {
      console.error('Error toggling kennel:', err)
    }
  }

  async function toggleMaintenance(kennel) {
    try {
      const { error } = await supabase
        .from('kennels')
        .update({ is_under_maintenance: !kennel.is_under_maintenance })
        .eq('id', kennel.id)

      if (error) throw error

      setKennels(kennels.map(k =>
        k.id === kennel.id ? { ...k, is_under_maintenance: !k.is_under_maintenance } : k
      ))
    } catch (err) {
      console.error('Error toggling maintenance:', err)
    }
  }

  async function deleteKennel(id) {
    if (!confirm('Delete this kennel? This cannot be undone.')) return

    try {
      const { error } = await supabase
        .from('kennels')
        .delete()
        .eq('id', id)

      if (error) throw error
      setKennels(kennels.filter(k => k.id !== id))
    } catch (err) {
      console.error('Error deleting kennel:', err)
      alert('Error: ' + err.message)
    }
  }

  async function renameKennel(id, newName) {
    try {
      const { error } = await supabase
        .from('kennels')
        .update({ name: newName })
        .eq('id', id)

      if (error) throw error

      setKennels(kennels.map(k =>
        k.id === id ? { ...k, name: newName } : k
      ))
      setEditingKennel(null)
    } catch (err) {
      console.error('Error renaming kennel:', err)
    }
  }

  if (loading) {
    return (
      <div className="kennels-page">
        <div className="boarding-loading">Loading kennels...</div>
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div className="kennels-page">
        <div className="kennels-empty">
          <div className="kennels-empty-icon">🏠</div>
          <h2>No Kennel Categories Yet</h2>
          <p>Set up your boarding first to create kennel categories.</p>
          <button className="boarding-btn boarding-btn-primary" onClick={() => navigate('/boarding/setup')}>
            Go to Boarding Setup →
          </button>
        </div>
      </div>
    )
  }

  const totalKennels = kennels.length
  const activeKennels = kennels.filter(k => k.is_active && !k.is_under_maintenance).length

  return (
    <div className="kennels-page">
      <div className="kennels-header">
        <div>
          <h1>🏠 Manage Kennels</h1>
          <p className="kennels-subtitle">
            {totalKennels} total kennel{totalKennels !== 1 ? 's' : ''} · {activeKennels} active · {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <button className="boarding-btn boarding-btn-secondary" onClick={() => navigate('/boarding/setup')}>
          ⚙️ Edit Setup
        </button>
      </div>

      {categories.map(category => {
        const catKennels = getKennelsForCategory(category.id)
        const activeCount = catKennels.filter(k => k.is_active && !k.is_under_maintenance).length

        return (
          <div key={category.id} className="kennels-category-section">
            <div className="kennels-category-header">
              <div>
                <h2 className="kennels-category-title">{category.name}</h2>
                <div className="kennels-category-meta">
                  {category.size_label && <span className="boarding-tag">{category.size_label}</span>}
                  <span className="boarding-tag">${parseFloat(category.base_price || 0).toFixed(2)}/night</span>
                  <span className="boarding-tag">{activeCount}/{catKennels.length} active</span>
                  {category.default_capacity > 1 && (
                    <span className="boarding-tag">Holds {category.default_capacity} dogs</span>
                  )}
                </div>
              </div>
              <div className="kennels-quick-actions">
                <button
                  className="kennels-quick-btn"
                  onClick={() => quickAddKennels(category.id, category.name, 1)}
                  title="Quick add 1 kennel"
                >
                  + 1
                </button>
                <button
                  className="kennels-quick-btn"
                  onClick={() => quickAddKennels(category.id, category.name, 5)}
                  title="Quick add 5 kennels"
                >
                  + 5
                </button>
                <button
                  className="kennels-quick-btn"
                  onClick={() => quickAddKennels(category.id, category.name, 10)}
                  title="Quick add 10 kennels"
                >
                  + 10
                </button>
              </div>
            </div>

            {/* Kennel Grid */}
            {catKennels.length > 0 ? (
              <div className="kennels-grid">
                {catKennels.map(kennel => (
                  <div
                    key={kennel.id}
                    className={
                      'kennel-card' +
                      (!kennel.is_active ? ' kennel-card-inactive' : '') +
                      (kennel.is_under_maintenance ? ' kennel-card-maintenance' : '')
                    }
                  >
                    <div className="kennel-card-top">
                      {editingKennel === kennel.id ? (
                        <input
                          className="kennel-rename-input"
                          defaultValue={kennel.name}
                          autoFocus
                          onBlur={(e) => renameKennel(kennel.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renameKennel(kennel.id, e.target.value)
                            if (e.key === 'Escape') setEditingKennel(null)
                          }}
                        />
                      ) : (
                        <span
                          className="kennel-card-name"
                          onDoubleClick={() => setEditingKennel(kennel.id)}
                          title="Double-click to rename"
                        >
                          {kennel.name}
                        </span>
                      )}
                      <div className="kennel-card-status">
                        {kennel.is_under_maintenance && <span className="kennel-badge kennel-badge-maintenance">🔧</span>}
                        {!kennel.is_active && <span className="kennel-badge kennel-badge-inactive">OFF</span>}
                        {kennel.is_active && !kennel.is_under_maintenance && <span className="kennel-badge kennel-badge-active">✓</span>}
                      </div>
                    </div>
                    {kennel.notes && <div className="kennel-card-notes">{kennel.notes}</div>}
                    <div className="kennel-card-actions">
                      <button
                        className="kennel-action-btn"
                        onClick={() => toggleKennelActive(kennel)}
                        title={kennel.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {kennel.is_active ? '🟢' : '⚪'}
                      </button>
                      <button
                        className="kennel-action-btn"
                        onClick={() => toggleMaintenance(kennel)}
                        title={kennel.is_under_maintenance ? 'End maintenance' : 'Mark for maintenance'}
                      >
                        🔧
                      </button>
                      <button
                        className="kennel-action-btn"
                        onClick={() => setEditingKennel(kennel.id)}
                        title="Rename"
                      >
                        ✏️
                      </button>
                      <button
                        className="kennel-action-btn kennel-action-delete"
                        onClick={() => deleteKennel(kennel.id)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add custom kennel card */}
                {showAddForm === category.id ? (
                  <div className="kennel-card kennel-card-add-form">
                    <input
                      className="boarding-input"
                      placeholder="Kennel name..."
                      value={newKennel.name}
                      onChange={e => setNewKennel({ ...newKennel, name: e.target.value })}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') addKennel(category.id) }}
                    />
                    <input
                      className="boarding-input"
                      placeholder="Notes (optional)"
                      value={newKennel.notes}
                      onChange={e => setNewKennel({ ...newKennel, notes: e.target.value })}
                      style={{ marginTop: '8px' }}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button className="boarding-btn boarding-btn-primary" style={{ padding: '6px 16px', fontSize: '13px' }}
                        onClick={() => addKennel(category.id)}>
                        Add
                      </button>
                      <button className="boarding-btn boarding-btn-secondary" style={{ padding: '6px 16px', fontSize: '13px' }}
                        onClick={() => { setShowAddForm(null); setNewKennel({ name: '', notes: '' }) }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="kennel-card kennel-card-add"
                    onClick={() => { setShowAddForm(category.id); setNewKennel({ name: '', notes: '' }) }}
                  >
                    <span className="kennel-add-icon">+</span>
                    <span className="kennel-add-text">Custom Kennel</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="kennels-empty-category">
                <p>No kennels yet. Use the quick-add buttons above or add a custom one:</p>
                <button
                  className="boarding-btn boarding-btn-primary"
                  style={{ marginTop: '8px' }}
                  onClick={() => quickAddKennels(category.id, category.name, 5)}
                >
                  + Add 5 {category.name}s
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
