import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

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
    const q = search.toLowerCase().trim()
    if (!q) return true
    const fullName = `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase()
    const phone = (client.phone || '')
    const email = (client.email || '').toLowerCase()
    const petNames = (client.pets || []).map(p => (p.name || '').toLowerCase()).join(' ')
    return fullName.includes(q) || phone.includes(q) || email.includes(q) || petNames.includes(q)
  })

  if (loading) return <div className="loading">Loading clients...</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p>{clients.length} total clients</p>
        </div>
        <Link to="/clients/new" className="btn-primary">+ Add Client</Link>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredClients.length === 0 ? (
        <div className="empty-state">
          <p>{clients.length === 0 ? 'No clients yet. Add your first client!' : 'No clients match your search.'}</p>
        </div>
      ) : (
        <div className="client-list">
          {filteredClients.map((client) => (
            <Link to={`/clients/${client.id}`} key={client.id} className="client-card">
              <div className="client-card-header">
                <h3>{client.first_name} {client.last_name}</h3>
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
