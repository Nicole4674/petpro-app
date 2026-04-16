import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import usePermissions from '../hooks/usePermissions'

export default function Sidebar({ onToggle }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { canAccess, canAccessAny, loading, role } = usePermissions()
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

        {/* Grooming Section — visible if user can access any grooming-related permission */}
        {canAccessAny(['calendar.view_own', 'clients.view_list', 'pricing.view', 'ai.view_flags']) && (
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
              {canAccessAny(['calendar.view_own', 'calendar.view_all']) && (
              <div
                className={'sidebar-subitem' + (isActive('/calendar') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/calendar') }}
              >
                Calendar
              </div>
              )}
              {canAccess('clients.view_list') && (
              <div
                className={'sidebar-subitem' + (isActive('/clients') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/clients') }}
              >
                Clients
              </div>
              )}
              {canAccess('pricing.view') && (
              <div
                className={'sidebar-subitem' + (isActive('/pricing') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/pricing') }}
              >
                Pricing
              </div>
              )}
              {canAccessAny(['calendar.view_own', 'calendar.view_all']) && (
              <div
                className={'sidebar-subitem' + (isActive('/waitlist') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/waitlist') }}
              >
                Waitlist
              </div>
              )}
              {canAccess('ai.view_flags') && (
              <div
                className={'sidebar-subitem' + (isActive('/flagged') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/flagged') }}
              >
                Flagged Bookings
              </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Boarding Section — visible if user can access any boarding permission */}
        {canAccessAny(['boarding.view_calendar', 'boarding.manage_runs']) && (
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
              {canAccess('boarding.view_calendar') && (
              <div
                className={'sidebar-subitem' + (isActive('/boarding/calendar') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/boarding/calendar') }}
              >
                Boarding Calendar
              </div>
              )}
              {canAccess('boarding.manage_runs') && (
              <div
                className={'sidebar-subitem' + (isActive('/boarding/setup') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/boarding/setup') }}
              >
                Boarding Setup
              </div>
              )}
              {canAccess('boarding.manage_runs') && (
              <div
                className={'sidebar-subitem' + (isActive('/boarding/kennels') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/boarding/kennels') }}
              >
                Kennels
              </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Staff Section — visible if user can view staff or clock in */}
        {canAccessAny(['staff.view_list', 'staff.clock_own']) && (
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
              {canAccess('staff.view_list') && (
              <div
                className={'sidebar-subitem' + (isActive('/staff') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/staff') }}
              >
                Staff List
              </div>
              )}
              {canAccessAny(['staff.view_list', 'calendar.view_all']) && (
              <div
                className={'sidebar-subitem' + (isActive('/staff/schedule') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/staff/schedule') }}
              >
                Schedule
              </div>
              )}
              {canAccess('staff.toggle_permissions') && (
              <div className="sidebar-subitem sidebar-subitem-coming">
                Roles & Permissions
              </div>
              )}
              {canAccess('staff.clock_own') && (
              <div
                className={'sidebar-subitem' + (isActive('/staff/timeclock') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/staff/timeclock') }}
              >
                Time Clock
              </div>
              )}
              {canAccess('staff.view_payroll') && (
              <div className="sidebar-subitem sidebar-subitem-coming">
                Payroll
              </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Daycare & Training (Coming Soon) — always visible */}
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

        {/* AI Section — visible if user has any AI permissions */}
        {canAccessAny(['ai.voice_booking', 'ai.access_settings', 'ai.view_flags']) && (
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
              {canAccess('ai.voice_booking') && (
              <div
                className={'sidebar-subitem' + (isActive('/voice') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/voice') }}
              >
                Voice Mode
              </div>
              )}
              {canAccess('ai.access_settings') && (
              <div className="sidebar-subitem sidebar-subitem-coming">
                Chat Settings
              </div>
              )}
              {canAccess('ai.access_settings') && (
              <div className="sidebar-subitem sidebar-subitem-coming">
                AI Preferences
              </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Tools Section — visible if user can import/export */}
        {canAccess('settings.import_export') && (
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
        )}
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
