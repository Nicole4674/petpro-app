import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [flagCount, setFlagCount] = useState(0)

  useEffect(() => {
    fetchFlagCount()
  }, [])

  const fetchFlagCount = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('groomer_id', user.id)
      .eq('has_flags', true)
      .eq('flag_status', 'pending')

    setFlagCount(count || 0)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>PetPro Dashboard</h1>
        <button onClick={handleSignOut}>Sign Out</button>
      </header>
      <main className="dashboard-main">
        <div className="dashboard-grid">
          <Link to="/calendar" className="dashboard-card dashboard-card-link">
            <h2>Calendar</h2>
            <p>View and manage appointments</p>
          </Link>
          <Link to="/clients" className="dashboard-card dashboard-card-link">
            <h2>Clients & Pets</h2>
            <p>Manage client profiles and pet safety info</p>
          </Link>
          <Link to="/pricing" className="dashboard-card dashboard-card-link">
            <h2>Pricing & Services</h2>
            <p>Set up your service menu and prices</p>
          </Link>
          <Link to="/flagged" className="dashboard-card dashboard-card-link dashboard-card-ai">
            <h2>
              PetPro AI
              {flagCount > 0 && <span className="flag-count-badge">{flagCount}</span>}
            </h2>
            <p>
              {flagCount > 0
                ? `${flagCount} booking${flagCount !== 1 ? 's' : ''} need${flagCount === 1 ? 's' : ''} review`
                : 'All bookings clear — no flags'}
            </p>
          </Link>
        </div>
      </main>
    </div>
  )
}
