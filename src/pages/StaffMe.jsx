// =======================================================
// PetPro — Staff Personal Dashboard
// URL: /staff/me
// =======================================================
// Styled to match the owner-side StaffDetail profile layout:
//   • Top profile card (avatar, name, role badge, email, hire date)
//   • 7-column weekly schedule grid (matches owner-side look)
//   • Hours-this-week card
//   • My Info card
// Read-only for staff — owner/manager sets the schedule.
// =======================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Role colors matching owner-side StaffDetail
var ROLE_COLORS = {
  owner: '#7c3aed', manager: '#2563eb', groomer: '#d946ef',
  bather: '#0891b2', kennel_tech: '#16a34a',
  front_desk: '#f59e0b', trainer: '#ea580c'
}
var ROLE_ICONS = {
  owner: '👑', manager: '⭐', groomer: '✂️',
  bather: '🛁', kennel_tech: '🏠',
  front_desk: '🖥️', trainer: '🎓'
}

export default function StaffMe() {
  var navigate = useNavigate()
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState('')
  var [staff, setStaff] = useState(null)
  var [shifts, setShifts] = useState([])
  var [hours, setHours] = useState({ totalMinutes: 0, entries: [] })
  // Tips this week for THIS staff member — sum of payments.tip_amount
  // for appointments where staff_id matches them, within the week range.
  var [tipsThisWeek, setTipsThisWeek] = useState({ total: 0, count: 0 })
  var [weekStart, setWeekStart] = useState(getWeekStart(new Date()))

  useEffect(function () { loadDashboard() }, [])
  useEffect(function () { if (staff) loadScheduleAndHours(staff) }, [weekStart, staff])

  function getWeekStart(d) {
    var x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0, 0, 0, 0); return x
  }
  function fmtISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  function fmtTime12(t) {
    if (!t) return ''
    var parts = String(t).split(':')
    var h = parseInt(parts[0], 10); var m = parts[1] || '00'
    var ampm = h >= 12 ? 'PM' : 'AM'; var h12 = h % 12 || 12
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

    if (staffErr) { setError('DB error: ' + staffErr.message); setLoading(false); return }
    if (!staffRow) { setError('No staff profile linked to your login.'); setLoading(false); return }
    if (staffRow.status !== 'active') { setError('Your account is inactive. Contact your shop owner.'); setLoading(false); return }
    setStaff(staffRow); setLoading(false)
  }

  async function loadScheduleAndHours(s) {
    var weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
    var { data: shiftData } = await supabase
      .from('staff_schedules').select('*').eq('staff_id', s.id)
      .gte('shift_date', fmtISO(weekStart)).lte('shift_date', fmtISO(weekEnd)).order('shift_date')
    setShifts(shiftData || [])

    var { data: clockData } = await supabase
      .from('time_clock').select('*').eq('staff_id', s.id)
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

    // Tips this week — payments.tip_amount where the linked appointment's
    // staff_id matches this staff member. Done as a join through Supabase.
    try {
      var { data: tipPayments } = await supabase
        .from('payments')
        .select('tip_amount, created_at, appointments!inner(staff_id)')
        .eq('appointments.staff_id', s.id)
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', new Date(weekEnd.getTime() + 86400000).toISOString())

      var tipTotal = 0
      var tipCount = 0
      ;(tipPayments || []).forEach(function (p) {
        var amt = parseFloat(p.tip_amount) || 0
        if (amt > 0) {
          tipTotal += amt
          tipCount += 1
        }
      })
      setTipsThisWeek({ total: tipTotal, count: tipCount })
    } catch (err) {
      console.warn('[StaffMe] tips fetch error:', err)
      setTipsThisWeek({ total: 0, count: 0 })
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut(); navigate('/staff/login')
  }

  function weekNavigate(dir) {
    var n = new Date(weekStart); n.setDate(weekStart.getDate() + (dir * 7)); setWeekStart(n)
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading your dashboard...</div>
  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', flexDirection: 'column', gap: '16px', background: '#f9fafb' }}>
        <div style={{ padding: '20px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '10px', color: '#991b1b', maxWidth: '420px', textAlign: 'center' }}>{error}</div>
        <button onClick={handleLogout} style={{ padding: '10px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Log Out</button>
      </div>
    )
  }
  if (!staff) return null

  // Week days array
  var weekDays = []
  for (var i = 0; i < 7; i++) {
    var d = new Date(weekStart); d.setDate(weekStart.getDate() + i); weekDays.push(d)
  }
  function shiftsForDay(d) {
    var iso = fmtISO(d)
    return shifts.filter(function (s) { return s.shift_date === iso })
  }

  var totalHours = Math.floor(hours.totalMinutes / 60)
  var totalMins = hours.totalMinutes % 60
  var fullName = ((staff.first_name || '') + ' ' + (staff.last_name || '')).trim()
  var initials = ((staff.first_name || '?').charAt(0) + (staff.last_name || '').charAt(0)).toUpperCase()
  var roleColor = ROLE_COLORS[staff.role] || '#7c3aed'
  var roleIcon = ROLE_ICONS[staff.role] || '👤'
  var roleLabel = (staff.role || '').replace(/_/g, ' ')
  var weekRangeLabel = MONTHS[weekStart.getMonth()] + ' ' + weekStart.getDate() + ' – ' + MONTHS[weekDays[6].getMonth()] + ' ' + weekDays[6].getDate() + ', ' + weekStart.getFullYear()

  return (
    <div style={{ minHeight: '100vh', background: '#faf5ff', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111827' }}>
      {/* Top bar with log out */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>PetPro · Staff Portal</div>
        <button onClick={handleLogout} style={{ padding: '7px 14px', background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '8px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Log Out</button>
      </div>

      <div style={{ maxWidth: '920px', margin: '0 auto', padding: '24px' }}>

        {/* Profile Header Card */}
        <div style={{ background: '#fff', borderRadius: '16px', borderTop: '4px solid ' + roleColor, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{
            width: '76px', height: '76px', borderRadius: '50%',
            background: roleColor, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', fontWeight: '800', flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <h1 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: '800' }}>{fullName}</h1>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span style={{
                padding: '4px 12px', borderRadius: '999px',
                background: roleColor, color: '#fff',
                fontSize: '12px', fontWeight: '700',
                textTransform: 'capitalize',
              }}>
                {roleIcon} {roleLabel}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#16a34a', fontWeight: '600' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }}></span>
                Active
              </span>
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {staff.email && <span>✉️ {staff.email}</span>}
              {staff.hire_date && <span>📅 Hired {new Date(staff.hire_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
            </div>
          </div>
        </div>

        {/* This Week — Hours + Tips side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {/* Hours */}
          <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 22px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600', marginBottom: '2px' }}>Hours This Week</div>
            <div style={{ fontSize: '30px', fontWeight: '800', color: '#16a34a', lineHeight: '1' }}>{totalHours}h {totalMins}m</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {hours.entries.length} clock-in{hours.entries.length === 1 ? '' : 's'} · clock in at the lobby kiosk
            </div>
          </div>

          {/* Tips */}
          <div style={{ background: '#fff', borderRadius: '14px', padding: '18px 22px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600', marginBottom: '2px' }}>Tips This Week</div>
            <div style={{ fontSize: '30px', fontWeight: '800', color: '#7c3aed', lineHeight: '1' }}>${tipsThisWeek.total.toFixed(2)}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              {tipsThisWeek.count === 0
                ? 'No tips yet this week'
                : tipsThisWeek.count + ' tipped appointment' + (tipsThisWeek.count === 1 ? '' : 's')}
            </div>
          </div>
        </div>

        {/* Schedule — 7-column grid like owner-side */}
        <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #e5e7eb', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>📅 My Schedule</h2>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={function () { weekNavigate(-1) }} style={{ padding: '6px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>◀</button>
              <span style={{ fontSize: '13px', color: '#374151', minWidth: '180px', textAlign: 'center', fontWeight: '600' }}>{weekRangeLabel}</span>
              <button onClick={function () { weekNavigate(1) }} style={{ padding: '6px 10px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>▶</button>
              <button onClick={function () { setWeekStart(getWeekStart(new Date())) }} style={{ padding: '6px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>This Week</button>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
            {(hours.totalMinutes / 60).toFixed(1)} hrs this week
          </div>

          {/* 7 columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
            {weekDays.map(function (d, i) {
              var daysShifts = shiftsForDay(d)
              var isToday = fmtISO(d) === fmtISO(new Date())
              var cardBg = isToday ? '#faf5ff' : '#fff'
              var cardBorder = isToday ? '2px solid ' + roleColor : '1px solid #e5e7eb'

              return (
                <div key={i} style={{
                  background: cardBg, border: cardBorder, borderRadius: '10px',
                  overflow: 'hidden', minHeight: '150px', display: 'flex', flexDirection: 'column',
                }}>
                  {/* Day header */}
                  <div style={{
                    background: isToday ? roleColor : '#faf5ff',
                    color: isToday ? '#fff' : '#6d28d9',
                    padding: '8px 6px', textAlign: 'center', fontWeight: '700',
                  }}>
                    <div style={{ fontSize: '12px', opacity: 0.9 }}>{DAYS[d.getDay()]}</div>
                    <div style={{ fontSize: '12px' }}>{MONTHS[d.getMonth()]} {d.getDate()}</div>
                    {isToday && <div style={{ fontSize: '9px', marginTop: '2px', padding: '1px 6px', background: 'rgba(255,255,255,0.25)', borderRadius: '999px', display: 'inline-block' }}>TODAY</div>}
                  </div>
                  {/* Day body */}
                  <div style={{ flex: 1, padding: '8px 6px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    {daysShifts.length === 0 ? (
                      <span style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: '13px' }}>Day Off</span>
                    ) : (
                      <div style={{ color: '#111827' }}>
                        {daysShifts.map(function (s, idx) {
                          return (
                            <div key={idx} style={{ marginBottom: idx < daysShifts.length - 1 ? '6px' : 0 }}>
                              <div style={{ fontWeight: '700', fontSize: '12px' }}>{fmtTime12(s.start_time)}</div>
                              <div style={{ fontSize: '11px', color: '#6b7280' }}>to {fmtTime12(s.end_time)}</div>
                              {s.notes && <div style={{ fontSize: '10px', color: '#6b7280', fontStyle: 'italic', marginTop: '2px' }}>{s.notes}</div>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af', fontStyle: 'italic', textAlign: 'center' }}>
            Your shop owner or manager sets your schedule. If something's wrong, let them know.
          </div>
        </div>

        {/* My Info */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: '700' }}>👤 My Info</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', fontSize: '14px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600', marginBottom: '2px' }}>Name</div>
              <div style={{ color: '#111827', fontWeight: '600' }}>{fullName}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600', marginBottom: '2px' }}>Email</div>
              <div style={{ color: '#111827' }}>{staff.email || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600', marginBottom: '2px' }}>Phone</div>
              <div style={{ color: '#111827' }}>{staff.phone || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600', marginBottom: '2px' }}>Role</div>
              <div style={{ color: '#111827', textTransform: 'capitalize' }}>{roleLabel}</div>
            </div>
            {staff.hire_date && (
              <div>
                <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '600', marginBottom: '2px' }}>Hire Date</div>
                <div style={{ color: '#111827' }}>{new Date(staff.hire_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
            To update your info, ask your shop owner.
          </div>
        </div>

      </div>
    </div>
  )
}
