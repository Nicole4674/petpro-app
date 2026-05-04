import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import usePermissions from '../hooks/usePermissions'
import { supabase } from '../lib/supabase'

export default function Sidebar({ onToggle }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { canAccess, canAccessAny, loading, role } = usePermissions()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false) // Task #73 — mobile drawer open/closed
  const [unreadMessages, setUnreadMessages] = useState(0)
  // Classic Mode — if groomer_ai_enabled is off, hide the 🤖 AI sidebar section entirely
  const [groomerAiEnabled, setGroomerAiEnabled] = useState(true)
  // Mobile groomer mode — when true, show the 📍 Route nav item.
  // Default false so storefront groomers don't see a feature they don't need.
  const [isMobile, setIsMobile] = useState(false)
  const [openSections, setOpenSections] = useState({
    grooming: true,
    boarding: true,
    staff: true,
    payroll: true,
    ai: true,
    tools: true,
    settings: true,
  })

  // Track unread messages count (live)
  useEffect(function() {
    var userId = null
    var channel = null

    async function load() {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      userId = user.id

      var { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('groomer_id', userId)
        .eq('sender_type', 'client')
        .eq('read_by_groomer', false)
      setUnreadMessages(count || 0)

      channel = supabase
        .channel('sidebar-messages-' + userId)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: 'groomer_id=eq.' + userId,
        }, async function() {
          var { count: c2 } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('groomer_id', userId)
            .eq('sender_type', 'client')
            .eq('read_by_groomer', false)
          setUnreadMessages(c2 || 0)
        })
        .subscribe()
    }
    load()

    return function() {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // Read the AI toggle from shop_settings — hides the 🤖 AI section when off (Classic Mode)
  useEffect(function () {
    var cancelled = false
    async function loadAiFlag() {
      try {
        var { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        // Pull both shop flags in one query — cheaper than 2 round trips
        var { data } = await supabase
          .from('shop_settings')
          .select('groomer_ai_enabled, is_mobile')
          .eq('groomer_id', user.id)
          .maybeSingle()
        if (cancelled) return
        setGroomerAiEnabled(!data || data.groomer_ai_enabled !== false)
        setIsMobile(!!(data && data.is_mobile))
      } catch (e) { /* fail open */ }
    }
    loadAiFlag()
    return function () { cancelled = true }
  }, [])

  function toggleSection(section) {
    setOpenSections(function(prev) {
      var updated = Object.assign({}, prev)
      updated[section] = !updated[section]
      return updated
    })
  }

  function goTo(path) {
    navigate(path)
    // Task #73 — close the mobile drawer after navigating so the user sees the page
    setMobileOpen(false)
  }

  function isActive(path) {
    return location.pathname === path
  }

  function toggleCollapse() {
    setCollapsed(!collapsed)
    if (onToggle) onToggle(!collapsed)
  }

  return (
    <>
      {/* Task #73 — Mobile hamburger button (only visible on small screens via CSS) */}
      <button
        className="sidebar-hamburger"
        onClick={function () { setMobileOpen(true) }}
        title="Open menu"
        aria-label="Open navigation menu"
      >
        <span className="sidebar-hamburger-icon">☰</span>
        {unreadMessages > 0 && (
          <span className="sidebar-hamburger-badge">
            {unreadMessages > 9 ? '9+' : unreadMessages}
          </span>
        )}
      </button>

      {/* Task #73 — Backdrop that closes the drawer when tapped */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={function () { setMobileOpen(false) }}
          aria-hidden="true"
        />
      )}

      <div className={'sidebar' + (collapsed ? ' sidebar-collapsed' : '') + (mobileOpen ? ' sidebar-mobile-open' : '')}>
      {/* Task #73 — Close button for mobile drawer (only visible on small screens via CSS) */}
      <button
        className="sidebar-mobile-close"
        onClick={function () { setMobileOpen(false) }}
        title="Close menu"
        aria-label="Close navigation menu"
      >
        ✕
      </button>
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

        {/* Messages — top-level with unread badge */}
        <div
          className={'sidebar-item' + (isActive('/messages') ? ' sidebar-item-active' : '')}
          onClick={function() { goTo('/messages') }}
          title="Messages"
          style={{ position: 'relative' }}
        >
          <span className="sidebar-icon">💬</span>
          {!collapsed && <span className="sidebar-label">Messages</span>}
          {unreadMessages > 0 && (
            <span style={{
              position: 'absolute',
              right: collapsed ? '8px' : '16px',
              top: collapsed ? '6px' : '50%',
              transform: collapsed ? 'none' : 'translateY(-50%)',
              background: '#dc3545',
              color: '#fff',
              borderRadius: '10px',
              padding: '2px 7px',
              fontSize: '11px',
              fontWeight: 700,
              minWidth: '18px',
              textAlign: 'center',
              lineHeight: '1.2',
            }}>
              {unreadMessages > 99 ? '99+' : unreadMessages}
            </span>
          )}
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
              {/* Route — only shown when shop_settings.is_mobile = true.
                  Storefront groomers don't see this nav item at all. */}
              {isMobile && canAccessAny(['calendar.view_own', 'calendar.view_all']) && (
              <div
                className={'sidebar-subitem' + (isActive('/route') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/route') }}
              >
                📍 Route
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
              {canAccess('clients.view_list') && (
              <div
                className={'sidebar-subitem' + (isActive('/balances') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/balances') }}
              >
                Balances
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
              {/* Phase A — Agreements page (waivers + e-signature) */}
              {canAccess('pricing.view') && (
              <div
                className={'sidebar-subitem' + (isActive('/agreements') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/agreements') }}
              >
                Agreements
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
            </div>
          )}
        </div>
        )}

        {/* Payroll Section — visible if user has payroll permission */}
        {canAccess('staff.view_payroll') && (
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={function() { if (!collapsed) toggleSection('payroll') }}>
            <span className="sidebar-icon">💰</span>
            {!collapsed && (
              <>
                <span className="sidebar-section-title">Payroll</span>
                <span className={'sidebar-arrow' + (openSections.payroll ? ' sidebar-arrow-open' : '')}>▸</span>
              </>
            )}
          </div>
          {!collapsed && openSections.payroll && (
            <div className="sidebar-subitems">
              <div
                className={'sidebar-subitem' + (isActive('/payroll') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/payroll') }}
              >
                Dashboard
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/payroll/pay-periods') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/payroll/pay-periods') }}
              >
                Pay Periods
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/payroll/tax-settings') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/payroll/tax-settings') }}
              >
                Tax Settings
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/expenses') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/expenses') }}
              >
                💰 Expenses
              </div>
              {/* Reports — hidden for launch, coming in v1.1
              <div
                className={'sidebar-subitem' + (isActive('/payroll/reports') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/payroll/reports') }}
              >
                Reports
              </div>
              */}
              {/* Year-End Forms — hidden for launch, coming in v1.1
              <div
                className={'sidebar-subitem' + (isActive('/payroll/year-end') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/payroll/year-end') }}
              >
                Year-End Forms
              </div>
              */}
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

        {/* AI Section — visible if user has AI permissions AND groomer_ai_enabled is ON (Classic Mode hides it) */}
        {groomerAiEnabled && canAccessAny(['ai.voice_booking', 'ai.access_settings', 'ai.view_flags']) && (
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
              <div
                className={'sidebar-subitem' + (isActive('/ai/chat-settings') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/ai/chat-settings') }}
              >
                Chat Settings
              </div>
              )}
              {canAccess('ai.access_settings') && (
              <div
                className={'sidebar-subitem' + (isActive('/ai/booking-rules') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/ai/booking-rules') }}
              >
                AI Booking Rules
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

        {/* Tools Section — always visible (Contact is available to every user; Import/Export gated by permission) */}
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
              {canAccess('settings.import_export') && (
                <div
                  className={'sidebar-subitem' + (isActive('/import') ? ' sidebar-subitem-active' : '')}
                  onClick={function() { goTo('/import') }}
                >
                  Import / Export
                </div>
              )}
              <div
                className={'sidebar-subitem' + (isActive('/contact') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/contact') }}
              >
                Contact
              </div>
            </div>
          )}
        </div>

        {/* Settings Section */}
        <div className="sidebar-section">
          <div className="sidebar-section-header" onClick={function() { if (!collapsed) toggleSection('settings') }}>
            <span className="sidebar-icon">⚙️</span>
            {!collapsed && (
              <>
                <span className="sidebar-section-title">Settings</span>
                <span className={'sidebar-arrow' + (openSections.settings ? ' sidebar-arrow-open' : '')}>▸</span>
              </>
            )}
          </div>
          {!collapsed && openSections.settings && (
            <div className="sidebar-subitems">
              <div
                className={'sidebar-subitem' + (isActive('/settings/shop') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/settings/shop') }}
              >
                🏪 Shop Settings
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/account') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/account') }}
              >
                💳 Account &amp; Billing
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/roadmap') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/roadmap') }}
              >
                🚀 Coming Soon
              </div>
              <div
                className={'sidebar-subitem' + (isActive('/help') ? ' sidebar-subitem-active' : '')}
                onClick={function() { goTo('/help') }}
              >
                📚 Help
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
    </>
  )
}
