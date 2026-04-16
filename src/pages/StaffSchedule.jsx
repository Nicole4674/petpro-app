import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function StaffSchedule() {
  var [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  var [staff, setStaff] = useState([])
  var [shifts, setShifts] = useState([])
  var [loading, setLoading] = useState(true)
  var [showAddShift, setShowAddShift] = useState(false)
  var [editingShift, setEditingShift] = useState(null)
  var [shiftForm, setShiftForm] = useState({
    staff_id: '', shift_date: '', start_time: '09:00', end_time: '17:00',
    break_minutes: 0, notes: ''
  })
  var [saving, setSaving] = useState(false)
  var [viewMode, setViewMode] = useState('employee') // 'employee' or 'team'

  useEffect(function() {
    fetchData()
  }, [weekStart])

  function getWeekStart(date) {
    var d = new Date(date)
    var day = d.getDay()
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d
  }

  function getWeekDays() {
    var days = []
    for (var i = 0; i < 7; i++) {
      var d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      days.push(d)
    }
    return days
  }

  function formatDateISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  function formatDateLabel(d) {
    return DAY_NAMES[d.getDay()] + ', ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getDate() + getOrdinal(d.getDate())
  }

  function formatDateShort(d) {
    return MONTH_NAMES[d.getMonth()] + ' ' + d.getDate()
  }

  function getOrdinal(n) {
    if (n > 3 && n < 21) return 'th'
    switch (n % 10) {
      case 1: return 'st'
      case 2: return 'nd'
      case 3: return 'rd'
      default: return 'th'
    }
  }

  function formatTime(t) {
    if (!t) return ''
    var parts = t.split(':')
    var h = parseInt(parts[0])
    var m = parts[1]
    var ampm = h >= 12 ? 'PM' : 'AM'
    if (h === 0) h = 12
    else if (h > 12) h = h - 12
    return h + ':' + m + ' ' + ampm
  }

  function getShiftHours(shift) {
    var start = shift.start_time.split(':')
    var end = shift.end_time.split(':')
    var startMin = parseInt(start[0]) * 60 + parseInt(start[1])
    var endMin = parseInt(end[0]) * 60 + parseInt(end[1])
    var totalMin = endMin - startMin - (shift.break_minutes || 0)
    return Math.max(0, totalMin / 60)
  }

  function getStaffDayHours(staffId, dateStr) {
    var dayShifts = shifts.filter(function(s) { return s.staff_id === staffId && s.shift_date === dateStr })
    var total = 0
    dayShifts.forEach(function(s) { total += getShiftHours(s) })
    return total
  }

  function getStaffWeekHours(staffId) {
    var days = getWeekDays()
    var total = 0
    days.forEach(function(d) { total += getStaffDayHours(staffId, formatDateISO(d)) })
    return total
  }

  async function fetchData() {
    setLoading(true)
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Fetch all staff, filter active in JS
    var { data: allStaffData, error: staffErr } = await supabase
      .from('staff_members')
      .select('*')
      .eq('groomer_id', user.id)
      .order('last_name')

    console.log('Staff data:', allStaffData, 'Error:', staffErr)

    var staffData = (allStaffData || []).filter(function(s) {
      return s.status === 'active' || !s.status
    })
    setStaff(staffData)

    // Fetch shifts for this week
    var weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)

    var { data: shiftData } = await supabase
      .from('staff_schedules')
      .select('*')
      .eq('groomer_id', user.id)
      .gte('shift_date', formatDateISO(weekStart))
      .lte('shift_date', formatDateISO(weekEnd))

    setShifts(shiftData || [])
    setLoading(false)
  }

  function navigateWeek(dir) {
    var newStart = new Date(weekStart)
    newStart.setDate(weekStart.getDate() + (dir * 7))
    setWeekStart(newStart)
  }

  function goThisWeek() {
    setWeekStart(getWeekStart(new Date()))
  }

  function openAddShift(staffId, dateStr) {
    setEditingShift(null)
    setShiftForm({
      staff_id: staffId || '',
      shift_date: dateStr || '',
      start_time: '09:00',
      end_time: '17:00',
      break_minutes: 0,
      notes: ''
    })
    setShowAddShift(true)
  }

  function openEditShift(shift) {
    setEditingShift(shift)
    setShiftForm({
      staff_id: shift.staff_id,
      shift_date: shift.shift_date,
      start_time: shift.start_time.substring(0, 5),
      end_time: shift.end_time.substring(0, 5),
      break_minutes: shift.break_minutes || 0,
      notes: shift.notes || ''
    })
    setShowAddShift(true)
  }

  async function handleSaveShift(e) {
    e.preventDefault()
    setSaving(true)

    var { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    var record = {
      groomer_id: user.id,
      staff_id: shiftForm.staff_id,
      shift_date: shiftForm.shift_date,
      start_time: shiftForm.start_time,
      end_time: shiftForm.end_time,
      break_minutes: parseInt(shiftForm.break_minutes) || 0,
      notes: shiftForm.notes.trim() || null
    }

    var error
    if (editingShift) {
      var result = await supabase
        .from('staff_schedules')
        .update(record)
        .eq('id', editingShift.id)
      error = result.error
    } else {
      var result = await supabase
        .from('staff_schedules')
        .insert([record])
      error = result.error
    }

    if (!error) {
      setShowAddShift(false)
      setEditingShift(null)
      fetchData()
    } else {
      alert('Error: ' + error.message)
    }
    setSaving(false)
  }

  async function handleDeleteShift() {
    if (!editingShift) return
    if (!window.confirm('Delete this shift?')) return

    var { error } = await supabase
      .from('staff_schedules')
      .delete()
      .eq('id', editingShift.id)

    if (!error) {
      setShowAddShift(false)
      setEditingShift(null)
      fetchData()
    } else {
      alert('Error: ' + error.message)
    }
  }

  async function copyLastWeek() {
    if (!window.confirm('Copy all shifts from last week to this week? Existing shifts this week will be kept.')) return

    var { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    var lastWeekStart = new Date(weekStart)
    lastWeekStart.setDate(weekStart.getDate() - 7)
    var lastWeekEnd = new Date(lastWeekStart)
    lastWeekEnd.setDate(lastWeekStart.getDate() + 6)

    var { data: lastWeekShifts } = await supabase
      .from('staff_schedules')
      .select('*')
      .eq('groomer_id', user.id)
      .gte('shift_date', formatDateISO(lastWeekStart))
      .lte('shift_date', formatDateISO(lastWeekEnd))

    if (!lastWeekShifts || lastWeekShifts.length === 0) {
      alert('No shifts found last week to copy.')
      return
    }

    var newShifts = lastWeekShifts.map(function(s) {
      var oldDate = new Date(s.shift_date + 'T00:00:00')
      var newDate = new Date(oldDate)
      newDate.setDate(oldDate.getDate() + 7)
      return {
        groomer_id: user.id,
        staff_id: s.staff_id,
        shift_date: formatDateISO(newDate),
        start_time: s.start_time,
        end_time: s.end_time,
        break_minutes: s.break_minutes,
        notes: s.notes,
        color: s.color
      }
    })

    var { error } = await supabase.from('staff_schedules').insert(newShifts)

    if (!error) {
      fetchData()
      alert('Copied ' + newShifts.length + ' shifts from last week!')
    } else {
      alert('Error copying: ' + error.message)
    }
  }

  var weekDays = getWeekDays()
  var isToday = function(d) {
    var today = new Date()
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  }

  var weekLabel = formatDateShort(weekDays[0]) + ' – ' + formatDateShort(weekDays[6]) + ', ' + weekDays[6].getFullYear()

  // Total hours for the whole week across all staff
  var totalWeekHours = 0
  staff.forEach(function(s) { totalWeekHours += getStaffWeekHours(s.id) })

  if (loading) return <div className="ss-loading">Loading schedule...</div>

  var ROLE_LABELS = {
    owner: 'Owner', manager: 'Manager', groomer: 'Groomer', bather: 'Bather',
    kennel_tech: 'Kennel Tech', front_desk: 'Front Desk', trainer: 'Trainer'
  }

  return (
    <div className="ss-page">
      {/* Header */}
      <div className="ss-header">
        <div className="ss-header-left">
          <h1 className="ss-title">📅 Staff Schedule</h1>
          <p className="ss-subtitle">Manage employee shifts and hours</p>
        </div>
        <div className="ss-header-actions">
          <button className="ss-copy-btn" onClick={function() { window.print() }}>🖨️ Print</button>
          <button className="ss-copy-btn" onClick={copyLastWeek}>📋 Copy Last Week</button>
          <button className="ss-add-btn" onClick={function() { openAddShift('', '') }}>+ Add Shift</button>
        </div>
      </div>

      {/* Navigation Bar */}
      <div className="ss-nav">
        <div className="ss-view-toggle">
          <button className={'ss-view-btn' + (viewMode === 'employee' ? ' ss-view-active' : '')} onClick={function() { setViewMode('employee') }}>Employee</button>
          <button className={'ss-view-btn' + (viewMode === 'team' ? ' ss-view-active' : '')} onClick={function() { setViewMode('team') }}>Team</button>
        </div>

        <div className="ss-week-nav">
          <button className="ss-nav-arrow" onClick={function() { navigateWeek(-1) }}>◀</button>
          <span className="ss-week-label">{weekLabel}</span>
          <button className="ss-nav-arrow" onClick={function() { navigateWeek(1) }}>▶</button>
        </div>

        <button className="ss-today-btn" onClick={goThisWeek}>This Week</button>
      </div>

      {/* Schedule Grid */}
      {staff.length === 0 ? (
        <div className="ss-empty">
          <div className="ss-empty-icon">👥</div>
          <h3>No staff members yet</h3>
          <p>Add staff on the Staff List page first, then come back to build their schedule.</p>
        </div>
      ) : (
        <div className="ss-grid-wrapper">
          <div className="ss-grid">
            {/* Header Row */}
            <div className="ss-grid-header">
              <div className="ss-grid-employee-header">
                <span>Employee</span>
                <span className="ss-total-hours">{totalWeekHours.toFixed(1)} hrs total</span>
              </div>
              {weekDays.map(function(day) {
                return (
                  <div key={formatDateISO(day)} className={'ss-grid-day-header' + (isToday(day) ? ' ss-today-header' : '')}>
                    <span className="ss-day-name">{DAY_NAMES[day.getDay()]}</span>
                    <span className="ss-day-date">{MONTH_NAMES[day.getMonth()] + ' ' + day.getDate() + getOrdinal(day.getDate())}</span>
                  </div>
                )
              })}
            </div>

            {/* Staff Rows */}
            {staff.map(function(member) {
              var weekHrs = getStaffWeekHours(member.id)
              return (
                <div key={member.id} className="ss-grid-row">
                  {/* Employee Info Cell */}
                  <div className="ss-grid-employee">
                    <div className="ss-emp-avatar" style={{ background: member.color || '#7c3aed' }}>
                      {(member.first_name?.[0] || '') + (member.last_name?.[0] || '')}
                    </div>
                    <div className="ss-emp-info">
                      <div className="ss-emp-name">{member.first_name} {member.last_name}</div>
                      <div className="ss-emp-role">{ROLE_LABELS[member.role] || member.role}</div>
                      <div className="ss-emp-hours">{weekHrs.toFixed(1)} hrs</div>
                    </div>
                  </div>

                  {/* Day Cells */}
                  {weekDays.map(function(day) {
                    var dateStr = formatDateISO(day)
                    var dayShifts = shifts.filter(function(s) { return s.staff_id === member.id && s.shift_date === dateStr })
                    var dayHrs = getStaffDayHours(member.id, dateStr)

                    return (
                      <div key={dateStr} className={'ss-grid-cell' + (isToday(day) ? ' ss-today-cell' : '')}>
                        {dayShifts.map(function(shift) {
                          return (
                            <div
                              key={shift.id}
                              className="ss-shift-block"
                              style={{ borderLeftColor: member.color || '#7c3aed' }}
                              onClick={function() { openEditShift(shift) }}
                            >
                              <div className="ss-shift-time">{formatTime(shift.start_time)} – {formatTime(shift.end_time)}</div>
                              {shift.notes && <div className="ss-shift-notes">{shift.notes}</div>}
                            </div>
                          )
                        })}
                        {dayHrs > 0 && <div className="ss-cell-hours">{dayHrs.toFixed(1)} hrs</div>}
                        <button
                          className="ss-add-cell-btn"
                          onClick={function() { openAddShift(member.id, dateStr) }}
                          title="Add shift"
                        >+</button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add/Edit Shift Modal */}
      {showAddShift && (
        <div className="sl-modal-overlay" onClick={function(e) { if (e.target.className === 'sl-modal-overlay') { setShowAddShift(false); setEditingShift(null) } }}>
          <div className="sl-modal" style={{ maxWidth: '480px' }}>
            <div className="sl-modal-header">
              <h2>{editingShift ? '✏️ Edit Shift' : '➕ Add Shift'}</h2>
              <button className="sl-modal-close" onClick={function() { setShowAddShift(false); setEditingShift(null) }}>✕</button>
            </div>

            <form onSubmit={handleSaveShift} className="sl-form">
              {/* Staff Member */}
              <div className="sl-form-group">
                <label className="sl-label">Staff Member *</label>
                <select
                  value={shiftForm.staff_id}
                  onChange={function(e) { setShiftForm(Object.assign({}, shiftForm, { staff_id: e.target.value })) }}
                  className="sl-input"
                  required
                  disabled={!!editingShift}
                >
                  <option value="">Select staff...</option>
                  {staff.map(function(s) {
                    return <option key={s.id} value={s.id}>{s.first_name} {s.last_name} — {ROLE_LABELS[s.role] || s.role}</option>
                  })}
                </select>
              </div>

              {/* Date */}
              <div className="sl-form-group">
                <label className="sl-label">Shift Date *</label>
                <input
                  type="date"
                  value={shiftForm.shift_date}
                  onChange={function(e) { setShiftForm(Object.assign({}, shiftForm, { shift_date: e.target.value })) }}
                  className="sl-input"
                  required
                />
              </div>

              {/* Times */}
              <div className="sl-form-row">
                <div className="sl-form-group">
                  <label className="sl-label">Start Time *</label>
                  <input
                    type="time"
                    value={shiftForm.start_time}
                    onChange={function(e) { setShiftForm(Object.assign({}, shiftForm, { start_time: e.target.value })) }}
                    className="sl-input"
                    required
                  />
                </div>
                <div className="sl-form-group">
                  <label className="sl-label">End Time *</label>
                  <input
                    type="time"
                    value={shiftForm.end_time}
                    onChange={function(e) { setShiftForm(Object.assign({}, shiftForm, { end_time: e.target.value })) }}
                    className="sl-input"
                    required
                  />
                </div>
              </div>

              {/* Break */}
              <div className="sl-form-group">
                <label className="sl-label">Break (minutes)</label>
                <input
                  type="number"
                  value={shiftForm.break_minutes}
                  onChange={function(e) { setShiftForm(Object.assign({}, shiftForm, { break_minutes: e.target.value })) }}
                  className="sl-input"
                  min="0"
                  max="120"
                  placeholder="0"
                />
              </div>

              {/* Notes */}
              <div className="sl-form-group">
                <label className="sl-label">Notes</label>
                <textarea
                  value={shiftForm.notes}
                  onChange={function(e) { setShiftForm(Object.assign({}, shiftForm, { notes: e.target.value })) }}
                  className="sl-input"
                  rows="2"
                  placeholder="e.g. Opening shift, Grooming only, Training..."
                />
              </div>

              <div className="sl-form-actions">
                {editingShift && (
                  <button type="button" className="ss-delete-btn" onClick={handleDeleteShift}>🗑️ Delete</button>
                )}
                <div style={{ flex: 1 }}></div>
                <button type="button" className="sl-btn-cancel" onClick={function() { setShowAddShift(false); setEditingShift(null) }}>Cancel</button>
                <button type="submit" className="sl-btn-save" disabled={saving}>
                  {saving ? 'Saving...' : editingShift ? '💾 Update Shift' : '💾 Add Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
