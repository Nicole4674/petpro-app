import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Active/inactive toggle — default to active only
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*, pets(id, name, breed)')
      .order('last_name', { ascending: true })

    if (error) {
      console.error('Error fetching clients:', error)
    } else {
      // Sort alphabetically by last name, then first name (handles nulls)
      const sorted = (data || []).sort((a, b) => {
        const lastA = (a.last_name || '').toLowerCase()
        const lastB = (b.last_name || '').toLowerCase()
        if (lastA !== lastB) return lastA.localeCompare(lastB)
        const firstA = (a.first_name || '').toLowerCase()
        const firstB = (b.first_name || '').toLowerCase()
        return firstA.localeCompare(firstB)
      })
      setClients(sorted)
    }
    setLoading(false)
  }

  const filteredClients = clients.filter((client) => {
    // Hide inactive clients unless the toggle is on
    if (!showInactive && client.is_active === false) return false
    const q = search.toLowerCase().trim()
    if (!q) return true
    const fullName = `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase()
    const phone = (client.phone || '')
    const email = (client.email || '').toLowerCase()
    const petNames = (client.pets || []).map(p => (p.name || '').toLowerCase()).join(' ')
    return fullName.includes(q) || phone.includes(q) || email.includes(q) || petNames.includes(q)
  })

  const activeCount = clients.filter(c => c.is_active !== false).length
  const inactiveCount = clients.filter(c => c.is_active === false).length

  if (loading) return <div className="loading">Loading clients...</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p>{activeCount} active {inactiveCount > 0 && <span style={{ color: '#9ca3af' }}>· {inactiveCount} inactive</span>}</p>
        </div>
        <Link to="/clients/new" className="btn-primary">+ Add Client</Link>
      </div>

      <div className="search-bar" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        {inactiveCount > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive ({inactiveCount})
          </label>
        )}
      </div>

      {filteredClients.length === 0 ? (
        <div className="empty-state">
          <p>{clients.length === 0 ? 'No clients yet. Add your first client!' : 'No clients match your search.'}</p>
        </div>
      ) : (
        <div className="client-list">
          {filteredClients.map((client) => (
            <Link
              to={`/clients/${client.id}`}
              key={client.id}
              className="client-card"
              style={client.is_active === false ? { opacity: 0.6 } : {}}
            >
              <div className="client-card-header">
                <h3>{client.first_name} {client.last_name}</h3>
                {client.is_active === false && (
                  <span style={{
                    marginLeft: '8px',
                    padding: '2px 8px',
                    background: '#f3f4f6',
                    color: '#6b7280',
                    borderRadius: '999px',
                    fontSize: '10px',
                    fontWeight: '700',
                  }}>💤 INACTIVE</span>
                )}
                {client.is_first_time && <span className="badge badge-new">New Client</span>}
              </div>
              <p className="client-phone">{client.phone}</p>
              {client.pets && client.pets.length > 0 && (
                <div className="client-pets-preview">
                  {client.pets.map((pet) => (
                    <span key={pet.id} className="pet-tag">{pet.name} ({pet.breed})</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
