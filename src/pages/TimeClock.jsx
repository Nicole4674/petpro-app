import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function TimeClock() {
  var [loading, setLoading] = useState(true)
  var [staff, setStaff] = useState([])
  var [selectedStaff, setSelectedStaff] = useState(null)
  var [activeEntry, setActiveEntry] = useState(null) // current clock-in (no clock_out yet)
  var [entries, setEntries] = useState([])
  var [elapsedTime, setElapsedTime] = useState(0)
  var [weekStart, setWeekStart] = useState(getWeekStart(new Date()))
  var [viewMode, setViewMode] = useState('today') // 'today', 'week', 'history'
  var [onBreak, setOnBreak] = useState(false)
  var timerRef = useRef(null)

  useEffect(function () {
    fetchStaff()
  }, [])

  useEffect(function () {
    if (selectedStaff) {
      fetchEntries()
      fetchActiveEntry()
    }
  }, [selectedStaff, weekStart, viewMode])

  // Live timer for active clock-in
  useEffect(function () {
    if (activeEntry && !onBreak) {
      timerRef.current = setInterval(function () {
        var now = new Date()
        var start = new Date(activeEntry.clock_in)
        var breakMs = (activeEntry.break_minutes || 0) * 60 * 1000
        setElapsedTime(Math.floor((now - start - breakMs) / 1000))
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return function () { clearInterval(timerRef.current) }
  }, [activeEntry, onBreak])

  function getWeekStart(date) {
    var d = new Date(date)
    d.setDate(d.getDate() - d.getDay())
    d.setHours(0, 0, 0, 0)
    return d
  }

  function formatDateISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  function formatTime(dateStr) {
    var d = new Date(dateStr)
    var h = d.getHours()
    var m = String(d.getMinutes()).padStart(2, '0')
    var ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12 || 12
    return h + ':' + m + ' ' + ampm
  }

  function formatElapsed(totalSeconds) {
    var hours = Math.floor(totalSeconds / 3600)
    var mins = Math.floor((totalSeconds % 3600) / 60)
    var secs = totalSeconds % 60
    return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0')
  }

  function formatHoursDecimal(minutes) {
    return (minutes / 60).toFixed(2)
  }

  function getTodayStr() {
    return formatDateISO(new Date())
  }

  async function fetchStaff() {
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    var { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .eq('groomer_id', user.id)
      .eq('status', 'active')
      .order('first_name')

    if (data) {
      setStaff(data)
      // Auto-select first staff or check if current user is staff
      if (data.length > 0) {
        var selfStaff = data.find(function (s) { return s.auth_user_id === user.id })
        setSelectedStaff(selfStaff || data[0])
      }
    }
    setLoading(false)
  }

  async function fetchActiveEntry() {
    if (!selectedStaff) return

    var { data, error } = await supabase
      .from('time_clock')
      .select('*')
      .eq('staff_id', selectedStaff.id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      setActiveEntry(data)
      setOnBreak(data.on_break || false)
    } else {
      setActiveEntry(null)
      setOnBreak(false)
      setElapsedTime(0)
    }
  }

  async function fetchEntries() {
    if (!selectedStaff) return

    var query = supabase
      .from('time_clock')
      .select('*')
      .eq('staff_id', selectedStaff.id)
      .not('clock_out', 'is', null)
      .order('clock_in', { ascending: false })

    if (viewMode === 'today') {
      var today = getTodayStr()
      query = query.gte('clock_in', today + 'T00:00:00').lte('clock_in', today + 'T23:59:59')
    } else if (viewMode === 'week') {
      var weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      query = query.gte('clock_in', formatDateISO(weekStart) + 'T00:00:00').lte('clock_in', formatDateISO(weekEnd) + 'T23:59:59')
    } else {
      query = query.limit(50)
    }

    var { data, error } = await query
    if (data) setEntries(data)
  }

  async function handleClockIn() {
    if (!selectedStaff) return

    var { data, error } = await supabase
      .from('time_clock')
      .insert({
        staff_id: selectedStaff.id,
        groomer_id: selectedStaff.groomer_id,
        clock_in: new Date().toISOString(),
        date: getTodayStr(),
        on_break: false,
        break_minutes: 0
      })
      .select()
      .single()

    if (data) {
      setActiveEntry(data)
      setOnBreak(false)
    }
    if (error) console.error('Clock in error:', error)
  }

  async function handleClockOut() {
    if (!activeEntry) return

    var now = new Date()
    var start = new Date(activeEntry.clock_in)
    var breakMs = (activeEntry.break_minutes || 0) * 60 * 1000
    var totalMinutes = Math.round((now - start - breakMs) / 60000)

    var { error } = await supabase
      .from('time_clock')
      .update({
        clock_out: now.toISOString(),
        total_minutes: totalMinutes,
        on_break: false
      })
      .eq('id', activeEntry.id)

    if (!error) {
      setActiveEntry(null)
      setOnBreak(false)
      setElapsedTime(0)
      fetchEntries()
    }
    if (error) console.error('Clock out error:', error)
  }

  async function handleBreakToggle() {
    if (!activeEntry) return

    if (!onBreak) {
      // Starting break — save break_start timestamp
      var { error } = await supabase
        .from('time_clock')
        .update({
          on_break: true,
          break_start: new Date().toISOString()
        })
        .eq('id', activeEntry.id)

      if (!error) {
        setOnBreak(true)
        setActiveEntry(Object.assign({}, activeEntry, { on_break: true, break_start: new Date().toISOString() }))
      }
    } else {
      // Ending break — calculate break duration and add to total
      var breakStart = new Date(activeEntry.break_start)
      var breakEnd = new Date()
      var breakMins = Math.round((breakEnd - breakStart) / 60000)
      var newBreakTotal = (activeEntry.break_minutes || 0) + breakMins

      var { error } = await supabase
        .from('time_clock')
        .update({
          on_break: false,
          break_start: null,
          break_minutes: newBreakTotal
        })
        .eq('id', activeEntry.id)

      if (!error) {
        setOnBreak(false)
        setActiveEntry(Object.assign({}, activeEntry, { on_break: false, break_start: null, break_minutes: newBreakTotal }))
      }
    }
  }

  function getWeekTotal() {
    var total = 0
    entries.forEach(function (e) {
      total += (e.total_minutes || 0)
    })
    // Add current active entry time if exists
    if (activeEntry) {
      total += Math.floor(elapsedTime / 60)
    }
    return total
  }

  function getDayEntries(dateStr) {
    return entries.filter(function (e) {
      return e.date === dateStr
    })
  }

  function prevWeek() {
    var d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  function nextWeek() {
    var d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  if (loading) {
    return <div className="page-loading">Loading Time Clock...</div>
  }

  return (
    <div className="timeclock-page">
      <div className="timeclock-header">
        <h1>Time Clock</h1>
        <div className="timeclock-staff-select">
          <select
            value={selectedStaff ? selectedStaff.id : ''}
            onChange={function (e) {
              var s = staff.find(function (st) { return st.id === e.target.value })
              setSelectedStaff(s)
            }}
          >
            {staff.map(function (s) {
              return <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
            })}
          </select>
        </div>
      </div>

      {/* Clock In/Out Panel */}
      <div className="timeclock-panel">
        <div className="timeclock-status">
          {activeEntry ? (
            <div className="timeclock-active">
              <div className="timeclock-status-badge clocked-in">
                {onBreak ? 'ON BREAK' : 'CLOCKED IN'}
              </div>
              <div className="timeclock-timer">{formatElapsed(elapsedTime)}</div>
              <div className="timeclock-since">
                Since {formatTime(activeEntry.clock_in)}
                {activeEntry.break_minutes > 0 && (
                  <span className="timeclock-break-info"> ({activeEntry.break_minutes} min break)</span>
                )}
              </div>
              <div className="timeclock-actions">
                <button
                  className={'timeclock-btn timeclock-btn-break' + (onBreak ? ' on-break' : '')}
                  onClick={handleBreakToggle}
                >
                  {onBreak ? 'End Break' : 'Start Break'}
                </button>
                <button className="timeclock-btn timeclock-btn-out" onClick={handleClockOut}>
                  Clock Out
                </button>
              </div>
            </div>
          ) : (
            <div className="timeclock-idle">
              <div className="timeclock-status-badge clocked-out">NOT CLOCKED IN</div>
              <div className="timeclock-clock-display">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <button className="timeclock-btn timeclock-btn-in" onClick={handleClockIn}>
                Clock In
              </button>
            </div>
          )}
        </div>
      </div>

      {/* View Tabs */}
      <div className="timeclock-tabs">
        <button
          className={'timeclock-tab' + (viewMode === 'today' ? ' active' : '')}
          onClick={function () { setViewMode('today') }}
        >
          Today
        </button>
        <button
          className={'timeclock-tab' + (viewMode === 'week' ? ' active' : '')}
          onClick={function () { setViewMode('week') }}
        >
          This Week
        </button>
        <button
          className={'timeclock-tab' + (viewMode === 'history' ? ' active' : '')}
          onClick={function () { setViewMode('history') }}
        >
          History
        </button>
      </div>

      {/* Week Navigation (only in week view) */}
      {viewMode === 'week' && (
        <div className="timeclock-week-nav">
          <button onClick={prevWeek}>&#8592; Prev</button>
          <span>
            {MONTH_NAMES[weekStart.getMonth()] + ' ' + weekStart.getDate()} — {
              (function () {
                var end = new Date(weekStart)
                end.setDate(end.getDate() + 6)
                return MONTH_NAMES[end.getMonth()] + ' ' + end.getDate()
              })()
            }
          </span>
          <button onClick={nextWeek}>Next &#8594;</button>
        </div>
      )}

      {/* Summary Card */}
      <div className="timeclock-summary">
        <div className="timeclock-summary-item">
          <span className="timeclock-summary-label">Entries</span>
          <span className="timeclock-summary-value">{entries.length}</span>
        </div>
        <div className="timeclock-summary-item">
          <span className="timeclock-summary-label">Total Hours</span>
          <span className="timeclock-summary-value">{formatHoursDecimal(getWeekTotal())} hrs</span>
        </div>
        <div className="timeclock-summary-item">
          <span className="timeclock-summary-label">Total Break</span>
          <span className="timeclock-summary-value">
            {entries.reduce(function (sum, e) { return sum + (e.break_minutes || 0) }, 0)} min
          </span>
        </div>
      </div>

      {/* Entries Table */}
      <div className="timeclock-entries">
        {entries.length === 0 && !activeEntry ? (
          <div className="timeclock-empty">
            No time entries {viewMode === 'today' ? 'today' : 'for this period'}.
          </div>
        ) : (
          <table className="timeclock-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Break</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(function (entry) {
                var totalHrs = formatHoursDecimal(entry.total_minutes || 0)
                return (
                  <tr key={entry.id}>
                    <td>{entry.date}</td>
                    <td>{formatTime(entry.clock_in)}</td>
                    <td>{entry.clock_out ? formatTime(entry.clock_out) : '—'}</td>
                    <td>{entry.break_minutes || 0} min</td>
                    <td>{totalHrs} hrs</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
