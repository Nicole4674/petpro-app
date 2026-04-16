import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Sidebar({ onToggle }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [openSections, setOpenSections] = useState({
    grooming: true,
    boarding: true,
    staff: true,
    ai: true,
    tools: true,
  })

  function toggleSection(section) {
    setOpenSections(function(prev) {
      var updated = Object.assign({}, prev)
      updated[section] = !updated[section]
      return updated
    })
  }

  function goTo(path) {
    navigate(path)
  }

  function isActive(path) {
    return location.pathname === path
  }

  function toggleCollapse() {
    setCollapsed(!collapsed)
    if (onToggle) onToggle(!collapsed)
  }

  return (
    <div className={'sidebar' + (collapsed ? ' sidebar-collapsed' : '')}>
      {/* Logo / Brand */}
      <div className="sidebar-brand" onClick={function() { goTo('/') }}>
        <span className="sidebar-logo">🐾</span>
        {!collapsed && <span className="sidebar-brand-text">PetPro</span>}
      </div>

      {/* Toggle button */}
      <button className="sidebar-toggle" onClick={toggleCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
        {collapsed ? '▶' : '◀'}
      </button>

      <nav className="sidebar-nav">
        {/* Dashboard */}
        <div
          className={'sidebar-item' + (isActive('/') ? ' sidebar-item-active' : '')}
          onClick={function() { goTo('/') }}
          title="Dashboard"
        >
          <span className="sidebar-icon">📊</span>
          {!collapsed && <span className="sidebar-label">Dashboard</span>}
        </div>

        {/* Grooming Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={function() { if (!collapsed) toggleSection('grooming') }}>
            <span className="sidebar-icon">✂️</span>
            {!collapsed && (
              <>
                <span className="sidebar-section-title">Grooming</span>
                <span className={'sidebar-arrow' + (openSections.grooming ? ' sidebar-arrow-open' : '')}>▸</span>
              </>
            )}
          </div>
          {!collapsed && openSections.grooming && (
            <div className="sidebar-subitems">
              <div
                className={'sidebar-subitem' + (isActive('/calendar') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/calendar') }}
              >
                Calendar
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/clients') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/clients') }}
              >
                Clients
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/pricing') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/pricing') }}
              >
                Pricing
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/flagged') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/flagged') }}
              >
                Flagged Bookings
              </div>
            </div>
          )}
        </div>

        {/* Boarding Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={function() { if (!collapsed) toggleSection('boarding') }}>
            <span className="sidebar-icon">🏠</span>
            {!collapsed && (
              <>
                <span className="sidebar-section-title">Boarding</span>
                <span className={'sidebar-arrow' + (openSections.boarding ? ' sidebar-arrow-open' : '')}>▸</span>
              </>
            )}
          </div>
          {!collapsed && openSections.boarding && (
            <div className="sidebar-subitems">
              <div
                className={'sidebar-subitem' + (isActive('/boarding/calendar') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/boarding/calendar') }}
              >
                Boarding Calendar
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/boarding/setup') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/boarding/setup') }}
              >
                Boarding Setup
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/boarding/kennels') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/boarding/kennels') }}
              >
                Kennels
              </div>
            </div>
          )}
        </div>

        {/* Staff Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={function() { if (!collapsed) toggleSection('staff') }}>
            <span className="sidebar-icon">👥</span>
            {!collapsed && (
              <>
                <span className="sidebar-section-title">Staff</span>
                <span className={'sidebar-arrow' + (openSections.staff ? ' sidebar-arrow-open' : '')}>▸</span>
              </>
            )}
          </div>
          {!collapsed && openSections.staff && (
            <div className="sidebar-subitems">
              <div
                className={'sidebar-subitem' + (isActive('/staff') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/staff') }}
              >
                Staff List
              </div>
              <div className="sidebar-subitem sidebar-subitem-coming">
                Roles & Permissions
              </div>
              <div className="sidebar-subitem sidebar-subitem-coming">
                Time Clock
              </div>
              <div className="sidebar-subitem sidebar-subitem-coming">
                Payroll
              </div>
            </div>
          )}
        </div>

        {/* Daycare & Training (Coming Soon) */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={function() {}}>
            <span className="sidebar-icon">🐕</span>
            {!collapsed && (
              <>
                <span className="sidebar-section-title" style={{ opacity: 0.5 }}>Daycare</span>
                <span className="sidebar-coming-badge">Soon</span>
              </>
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={function() {}}>
            <span className="sidebar-icon">🎓</span>
            {!collapsed && (
              <>
                <span className="sidebar-section-title" style={{ opacity: 0.5 }}>Training</span>
                <span className="sidebar-coming-badge">Soon</span>
              </>
            )}
          </div>
        </div>

        {/* AI Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={function() { if (!collapsed) toggleSection('ai') }}>
            <span className="sidebar-icon">🤖</span>
            {!collapsed && (
              <>
                <span className="sidebar-section-title">AI</span>
                <span className={'sidebar-arrow' + (openSections.ai ? ' sidebar-arrow-open' : '')}>▸</span>
              </>
            )}
          </div>
          {!collapsed && openSections.ai && (
            <div className="sidebar-subitems">
              <div
                className={'sidebar-subitem' + (isActive('/voice') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/voice') }}
              >
                Voice Mode
              </div>
              <div className="sidebar-subitem sidebar-subitem-coming">
                Chat Settings
              </div>
              <div className="sidebar-subitem sidebar-subitem-coming">
                AI Preferences
              </div>
            </div>
          )}
        </div>

        {/* Tools Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={function() { if (!collapsed) toggleSection('tools') }}>
            <span className="sidebar-icon">🔧</span>
            {!collapsed && (
              <>
                <span className="sidebar-section-title">Tools</span>
                <span className={'sidebar-arrow' + (openSections.tools ? ' sidebar-arrow-open' : '')}>▸</span>
              </>
            )}
          </div>
          {!collapsed && openSections.tools && (
            <div className="sidebar-subitems">
              <div
                className={'sidebar-subitem' + (isActive('/import') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/import') }}
              >
                Import / Export
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Bottom section */}
      {!collapsed && (
        <div className="sidebar-footer">
          <div className="sidebar-footer-text">PetPro v1.0</div>
          <button className="sidebar-logout-btn" onClick={async function() {
            var { supabase } = await import('../lib/supabase')
            await supabase.auth.signOut()
            navigate('/login')
          }}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
