// =======================================================
// PetPro — Staff Personal Dashboard
// URL: /staff/me
// =======================================================
// Staff land here after logging in at /staff/login.
// Read-only view of:
//   • This week's schedule (their shifts)
//   • Hours worked this week (from time_clock)
//   • Their own profile info
//
// They CANNOT edit the schedule (owner/manager does that).
// They CANNOT clock in from here (kiosk only).
// =======================================================
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function StaffMe() {
  var navigate = useNavigate()
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState('')
  var [staff, setStaff] = useState(null) // staff_members row
  var [shifts, setShifts] = useState([]) // this week's shifts
  var [hours, setHours] = useState({ totalMinutes: 0, entries: [] })
  var [weekStart, setWeekStart] = useState(getWeekStart(new Date()))

  useEffect(function () {
    loadDashboard()
  }, [])

  useEffect(function () {
    if (staff) loadScheduleAndHours(staff)
  }, [weekStart, staff])

  function getWeekStart(d) {
    var x = new Date(d)
    x.setDate(x.getDate() - x.getDay())
    x.setHours(0, 0, 0, 0)
    return x
  }
  function fmtISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  function fmtShortDate(d) { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() }
  function fmtTime12(t) {
    if (!t) return ''
    var parts = String(t).split(':')
    var h = parseInt(parts[0], 10)
    var m = parts[1] || '00'
    var ampm = h >= 12 ? 'PM' : 'AM'
    var h12 = h % 12 || 12
    return h12 + ':' + m.slice(0, 2) + ' ' + ampm
  }

  async function loadDashboard() {
    setLoading(true)
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/staff/login'); return }

    var { data: staffRow, error: staffErr } = await supabase
      .from('staff_members')
      .select('id, first_name, last_name, email, phone, role, color_code, hire_date, groomer_id, status')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (staffErr || !staffRow) {
      setError('Could not load your staff profile.')
      setLoading(false)
      return
    }
    if (staffRow.status !== 'active') {
      setError('Your account is inactive. Contact your shop owner.')
      setLoading(false)
      return
    }
    setStaff(staffRow)
    setLoading(false)
  }

  async function loadScheduleAndHours(s) {
    var weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)

    // Shifts this week
    var { data: shiftData } = await supabase
      .from('staff_schedules')
      .select('*')
      .eq('staff_id', s.id)
      .gte('shift_date', fmtISO(weekStart))
      .lte('shift_date', fmtISO(weekEnd))
      .order('shift_date')
    setShifts(shiftData || [])

    // Hours from time_clock
    var { data: clockData } = await supabase
      .from('time_clock')
      .select('*')
      .eq('staff_id', s.id)
      .gte('clock_in', weekStart.toISOString())
      .lte('clock_in', new Date(weekEnd.getTime() + 86400000).toISOString())
      .order('clock_in', { ascending: false })

    var total = 0
    ;(clockData || []).forEach(function (e) {
      if (e.total_minutes) total += e.total_minutes
      else if (e.clock_out && e.clock_in) {
        var mins = Math.round((new Date(e.clock_out) - new Date(e.clock_in)) / 60000) - (e.break_minutes || 0)
        total += Math.max(0, mins)
      }
    })
    setHours({ totalMinutes: total, entries: clockData || [] })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/staff/login')
  }

  function weekNavigate(dir) {
    var n = new Date(weekStart)
    n.setDate(weekStart.getDate() + (dir * 7))
    setWeekStart(n)
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading your dashboard...</div>
  }
  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', flexDirection: 'column', gap: '16px', background: '#f9fafb' }}>
        <div style={{ padding: '20px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '10px', color: '#991b1b', maxWidth: '420px', textAlign: 'center' }}>{error}</div>
        <button onClick={handleLogout} style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Log Out</button>
      </div>
    )
  }
  if (!staff) return null

  // Build 7-day view
  var weekDays = []
  for (var i = 0; i < 7; i++) {
    var d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    weekDays.push(d)
  }
  function shiftsForDay(d) {
    var iso = fmtISO(d)
    return shifts.filter(function (s) { return s.shift_date === iso })
  }

  var totalHours = Math.floor(hours.totalMinutes / 60)
  var totalMins = hours.totalMinutes % 60
  var shopName = 'PetPro'

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111827' }}>
      {/* Header */}
      <div style={{ background: '#7c3aed', color: '#fff', padding: '20px 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '14px', opacity: 0.9 }}>{shopName} · Staff Portal</div>
            <h1 style={{ margin: '2px 0 0', fontSize: '24px', fontWeight: '800' }}>Hi, {staff.first_name}! 👋</h1>
            <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '2px', textTransform: 'capitalize' }}>{(staff.role || '').replace(/_/g, ' ')}</div>
          </div>
          <button onClick={handleLogout} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Log Out</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px', display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>

        {/* Hours card */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '14px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>This Week</h3>
          <div style={{ fontSize: '32px', fontWeight: '800', color: '#16a34a' }}>
            {totalHours}h {totalMins}m
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
            {hours.entries.length} clock-in{hours.entries.length === 1 ? '' : 's'} · Clock in at the lobby kiosk
          </div>
        </div>

        {/* Schedule card */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>📅 My Schedule</h3>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={function () { weekNavigate(-1) }} style={{ padding: '6px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>←</button>
              <span style={{ fontSize: '13px', color: '#374151', minWidth: '120px', textAlign: 'center' }}>
                {MONTHS[weekStart.getMonth()]} {weekStart.getDate()} – {MONTHS[weekDays[6].getMonth()]} {weekDays[6].getDate()}
              </span>
              <button onClick={function () { weekNavigate(1) }} style={{ padding: '6px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>→</button>
              <button onClick={function () { setWeekStart(getWeekStart(new Date())) }} style={{ padding: '6px 10px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>This Week</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {weekDays.map(function (d, i) {
              var daysShifts = shiftsForDay(d)
              var isToday = fmtISO(d) === fmtISO(new Date())
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px',
                  padding: '10px 12px', borderRadius: '8px',
                  background: isToday ? '#faf5ff' : '#fafafa',
                  border: isToday ? '1px solid #c4b5fd' : '1px solid #f3f4f6',
                }}>
                  <div style={{ fontWeight: isToday ? '700' : '600', fontSize: '13px', color: isToday ? '#6d28d9' : '#374151' }}>
                    {fmtShortDate(d)}{isToday && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 6px', background: '#7c3aed', color: '#fff', borderRadius: '999px' }}>TODAY</span>}
                  </div>
                  <div style={{ fontSize: '13px', color: '#374151' }}>
                    {daysShifts.length === 0 ? (
                      <span style={{ color: '#9ca3af' }}>Off</span>
                    ) : (
                      daysShifts.map(function (s, idx) {
                        return (
                          <div key={idx} style={{ marginBottom: idx < daysShifts.length - 1 ? '4px' : 0 }}>
                            <strong>{fmtTime12(s.start_time)} – {fmtTime12(s.end_time)}</strong>
                            {s.notes && <span style={{ color: '#6b7280', marginLeft: '8px' }}>· {s.notes}</span>}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
            Your shop owner or manager sets your schedule. If something's wrong, let them know.
          </div>
        </div>

        {/* Profile card */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: '700' }}>👤 My Info</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '14px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Name</div>
              <div style={{ color: '#111827', fontWeight: '600' }}>{staff.first_name} {staff.last_name || ''}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email</div>
              <div style={{ color: '#111827' }}>{staff.email || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Phone</div>
              <div style={{ color: '#111827' }}>{staff.phone || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role</div>
              <div style={{ color: '#111827', textTransform: 'capitalize' }}>{(staff.role || '').replace(/_/g, ' ')}</div>
            </div>
            {staff.hire_date && (
              <div>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hire Date</div>
                <div style={{ color: '#111827' }}>{new Date(staff.hire_date + 'T00:00:00').toLocaleDateString()}</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
            To update your info, ask your shop owner.
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '12px' }}>
          <Link to="/kiosk" style={{ color: '#7c3aed', fontSize: '13px', fontWeight: '600', textDecoration: 'none' }}>
            Need to clock in? Open the lobby kiosk →
          </Link>
        </div>
      </div>
    </div>
  )
}
