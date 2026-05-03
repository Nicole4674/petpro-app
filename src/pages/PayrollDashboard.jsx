import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PayrollDashboard() {
  var navigate = useNavigate()
  var [loading, setLoading] = useState(true)
  var [groomerId, setGroomerId] = useState(null)

  // YTD stats
  var [stats, setStats] = useState({
    ytdGross: 0,
    ytdTips: 0,
    ytdNet: 0,
    ytdTaxes: 0,
    ytdDeductions: 0,
    paycheckCount: 0,
    staffCount: 0
  })

  // Setup checklist
  var [checklist, setChecklist] = useState({
    taxSettingsExists: false,
    einFilled: false,
    staffWithPay: 0,
    stateTaxConfigured: false
  })

  // Recent pay periods
  var [recentPeriods, setRecentPeriods] = useState([])

  // Time clock activity
  var [clockedIn, setClockedIn] = useState([])
  var [weekHours, setWeekHours] = useState([])

  useEffect(function() {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setGroomerId(user.id)

    // YEAR-TO-DATE window
    var yearStart = new Date().getFullYear() + '-01-01'

    // 1. YTD paycheck stats
    // NOTE: gross_pay on the paychecks table = wages only (no tips). Tips are
    // tracked in their own column. Show them as a separate YTD card so the
    // math stays visually sane: Gross + Tips − Taxes − Deductions = Net.
    var { data: paychecks } = await supabase
      .from('paychecks')
      .select('gross_pay, tips, net_pay, federal_tax, state_tax, social_security_tax, medicare_tax, pre_tax_deductions_total, post_tax_deductions_total')
      .eq('groomer_id', user.id)
      .gte('created_at', yearStart)

    var ytdGross = 0, ytdTips = 0, ytdNet = 0, ytdTaxes = 0, ytdDeductions = 0, paycheckCount = 0
    if (paychecks && paychecks.length > 0) {
      paycheckCount = paychecks.length
      paychecks.forEach(function(p) {
        ytdGross += parseFloat(p.gross_pay || 0)
        ytdTips += parseFloat(p.tips || 0)
        ytdNet += parseFloat(p.net_pay || 0)
        ytdTaxes += parseFloat(p.federal_tax || 0)
                  + parseFloat(p.state_tax || 0)
                  + parseFloat(p.social_security_tax || 0)
                  + parseFloat(p.medicare_tax || 0)
        // Other deductions (401k, health insurance, garnishments, etc.) — kept
        // separate from taxes so the YTD card math reads cleanly:
        //   Gross + Tips − Taxes − Deductions = Net
        ytdDeductions += parseFloat(p.pre_tax_deductions_total || 0)
                       + parseFloat(p.post_tax_deductions_total || 0)
      })
    }

    // 2. Staff count + staff-with-pay count
    // Staff use `status` ('active'/'inactive'/'invited'), not `is_active`.
    // Column is `role`, not `staff_role` (Supabase returns null/error silently
    // if you select a column that doesn't exist — that caused the 0 staff bug).
    var { data: staff } = await supabase
      .from('staff_members')
      .select('id, first_name, last_name, role, worker_type, pay_type, hourly_rate, commission_percent, salary_amount, status')
      .eq('groomer_id', user.id)
      .eq('status', 'active')

    var staffCount = staff ? staff.length : 0
    var staffWithPay = 0
    var staffById = {}
    if (staff) {
      staff.forEach(function(s) {
        staffById[s.id] = s
        var hasPay = false
        if (s.pay_type === 'hourly' && parseFloat(s.hourly_rate) > 0) hasPay = true
        if (s.pay_type === 'commission' && parseFloat(s.commission_percent) > 0) hasPay = true
        if (s.pay_type === 'hourly_commission'
            && parseFloat(s.hourly_rate) > 0
            && parseFloat(s.commission_percent) > 0) hasPay = true
        if (s.pay_type === 'salary' && parseFloat(s.salary_amount) > 0) hasPay = true
        if (hasPay) staffWithPay += 1
      })
    }

    // 2b. Currently clocked in (clock_out IS NULL)
    var { data: liveClock } = await supabase
      .from('time_clock')
      .select('*')
      .eq('groomer_id', user.id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })

    var liveList = []
    if (liveClock && liveClock.length > 0) {
      liveClock.forEach(function(tc) {
        var s = staffById[tc.staff_id]
        if (s) {
          liveList.push({
            id: tc.id,
            staffId: tc.staff_id,
            name: (s.first_name || '') + ' ' + (s.last_name || ''),
            role: s.role || '',
            clockIn: tc.clock_in
          })
        }
      })
    }

    // 2c. This week's completed hours per W-2 staff
    // Week = last 7 days (skeleton — shop-configurable later)
    var weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - 7)
    var weekStartIso = weekStart.toISOString()

    var { data: weekClock } = await supabase
      .from('time_clock')
      .select('staff_id, total_minutes')
      .eq('groomer_id', user.id)
      .gte('clock_in', weekStartIso)
      .not('clock_out', 'is', null)

    var hoursMap = {}
    if (weekClock && weekClock.length > 0) {
      weekClock.forEach(function(tc) {
        if (!tc.staff_id) return
        hoursMap[tc.staff_id] = (hoursMap[tc.staff_id] || 0) + (parseFloat(tc.total_minutes) || 0)
      })
    }

    var hoursList = Object.keys(hoursMap).map(function(sid) {
      var s = staffById[sid]
      return {
        staffId: sid,
        name: s ? ((s.first_name || '') + ' ' + (s.last_name || '')) : 'Unknown',
        role: s ? (s.role || '') : '',
        workerType: s ? (s.worker_type || 'w2') : 'w2',
        totalHours: hoursMap[sid] / 60
      }
    }).sort(function(a, b) { return b.totalHours - a.totalHours })

    // 3. Tax settings checklist
    var { data: taxSettings } = await supabase
      .from('shop_tax_settings')
      .select('*')
      .eq('groomer_id', user.id)
      .maybeSingle()

    var taxSettingsExists = !!taxSettings
    var einFilled = taxSettings && taxSettings.business_ein && taxSettings.business_ein.length > 0
    var stateTaxConfigured = taxSettings && (
      taxSettings.has_state_income_tax === false
      || parseFloat(taxSettings.state_tax_rate) > 0
    )

    // 4. Recent pay periods (last 5)
    var { data: periods } = await supabase
      .from('pay_periods')
      .select('*')
      .eq('groomer_id', user.id)
      .order('start_date', { ascending: false })
      .limit(5)

    setStats({
      ytdGross: ytdGross,
      ytdTips: ytdTips,
      ytdNet: ytdNet,
      ytdTaxes: ytdTaxes,
      ytdDeductions: ytdDeductions,
      paycheckCount: paycheckCount,
      staffCount: staffCount
    })
    setChecklist({
      taxSettingsExists: taxSettingsExists,
      einFilled: einFilled,
      staffWithPay: staffWithPay,
      stateTaxConfigured: stateTaxConfigured
    })
    setRecentPeriods(periods || [])
    setClockedIn(liveList)
    setWeekHours(hoursList)
    setLoading(false)
  }

  // Time helpers for the Clock Activity card
  function formatClockTime(ts) {
    if (!ts) return '—'
    var d = new Date(ts)
    var h = d.getHours()
    var m = d.getMinutes()
    var ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12
    if (h === 0) h = 12
    return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm
  }

  function timeSince(ts) {
    if (!ts) return ''
    var then = new Date(ts).getTime()
    var now = Date.now()
    var diffMin = Math.floor((now - then) / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return diffMin + 'm'
    var h = Math.floor(diffMin / 60)
    var m = diffMin % 60
    if (m === 0) return h + 'h'
    return h + 'h ' + m + 'm'
  }

  function formatHours(h) {
    return (Math.round(h * 100) / 100).toFixed(2)
  }

  function money(n) {
    return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    var d = new Date(dateStr + 'T00:00:00')
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear()
  }

  function statusBadge(status) {
    if (status === 'open') return <span className="pp-badge pp-badge-open">🟢 Open</span>
    if (status === 'closed') return <span className="pp-badge pp-badge-closed">🔒 Closed</span>
    if (status === 'paid') return <span className="pp-badge pp-badge-paid">✅ Paid</span>
    return <span className="pp-badge">{status}</span>
  }

  // Checklist row helper
  function checkRow(done, label, fixHref, fixLabel) {
    return (
      <div className={'pd-check-row ' + (done ? 'pd-check-done' : 'pd-check-todo')}>
        <span className="pd-check-icon">{done ? '✅' : '⚠️'}</span>
        <span className="pd-check-label">{label}</span>
        {!done && fixHref && (
          <button
            className="pd-check-fix"
            onClick={function() { navigate(fixHref) }}
          >
            {fixLabel || 'Fix this'}
          </button>
        )}
      </div>
    )
  }

  if (loading) {
    return <div className="page-loading">Loading payroll dashboard...</div>
  }

  var currentYear = new Date().getFullYear()
  var allSetup = checklist.taxSettingsExists
              && checklist.einFilled
              && checklist.staffWithPay > 0
              && checklist.stateTaxConfigured

  return (
    <div className="pd-page">

      {/* HEADER */}
      <div className="pd-header">
        <div>
          <h1>💰 Payroll Dashboard</h1>
          <p className="pd-subtitle">
            Run payroll, track YTD totals, and manage tax settings — all in one place.
          </p>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="pd-stats-grid">
        <div className="pd-stat-card pd-stat-gross">
          <div className="pd-stat-label">YTD Gross Pay ({currentYear})</div>
          <div className="pd-stat-value">{money(stats.ytdGross)}</div>
          <div className="pd-stat-hint">wages only (tips shown separately)</div>
        </div>
        <div className="pd-stat-card pd-stat-tips">
          <div className="pd-stat-label">YTD Tips ({currentYear})</div>
          <div className="pd-stat-value">{money(stats.ytdTips)}</div>
        </div>
        <div className="pd-stat-card pd-stat-net">
          <div className="pd-stat-label">YTD Net Pay ({currentYear})</div>
          <div className="pd-stat-value">{money(stats.ytdNet)}</div>
        </div>
        <div className="pd-stat-card pd-stat-tax">
          <div className="pd-stat-label">YTD Taxes Withheld</div>
          <div className="pd-stat-value">{money(stats.ytdTaxes)}</div>
          <div className="pd-stat-hint">federal + state + SS + Medicare</div>
        </div>
        <div className="pd-stat-card pd-stat-tax">
          <div className="pd-stat-label">YTD Other Deductions</div>
          <div className="pd-stat-value">{money(stats.ytdDeductions)}</div>
          <div className="pd-stat-hint">401k, health, garnishments, etc.</div>
        </div>
        <div className="pd-stat-card pd-stat-count">
          <div className="pd-stat-label">Paychecks Run</div>
          <div className="pd-stat-value">{stats.paycheckCount}</div>
        </div>
        <div className="pd-stat-card pd-stat-staff">
          <div className="pd-stat-label">Staff on Payroll</div>
          <div className="pd-stat-value">{stats.staffCount}</div>
        </div>
      </div>

      {/* TWO COLUMN: CHECKLIST + QUICK ACTIONS */}
      <div className="pd-two-col">

        {/* SETUP CHECKLIST */}
        <div className="pd-card pd-checklist-card">
          <div className="pd-card-header">
            <h2>🛠️ Setup Checklist</h2>
            {allSetup && <span className="pd-ready-pill">✨ Ready to run payroll</span>}
          </div>
          <div className="pd-checklist">
            {checkRow(
              checklist.taxSettingsExists,
              'Tax Settings filled out',
              '/payroll/tax-settings',
              'Set up'
            )}
            {checkRow(
              checklist.einFilled,
              'Business EIN entered',
              '/payroll/tax-settings',
              'Add EIN'
            )}
            {checkRow(
              checklist.stateTaxConfigured,
              'State tax rate configured',
              '/payroll/tax-settings',
              'Configure'
            )}
            {checkRow(
              checklist.staffWithPay > 0,
              'At least 1 staff with pay setup (' + checklist.staffWithPay + ' of ' + stats.staffCount + ')',
              '/staff',
              'Go to Staff'
            )}
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="pd-card pd-actions-card">
          <div className="pd-card-header">
            <h2>⚡ Quick Actions</h2>
          </div>
          <div className="pd-actions-grid">
            <button
              className="pd-action pd-action-primary"
              onClick={function() { navigate('/payroll/run') }}
            >
              <div className="pd-action-icon">🏃</div>
              <div className="pd-action-label">Run Payroll</div>
              <div className="pd-action-hint">Start a new pay period</div>
            </button>
            <button
              className="pd-action"
              onClick={function() { navigate('/payroll/tax-settings') }}
            >
              <div className="pd-action-icon">🧾</div>
              <div className="pd-action-label">Tax Settings</div>
              <div className="pd-action-hint">State, EIN, rates</div>
            </button>
            {/* Reports — hidden for launch, coming in v1.1
            <button
              className="pd-action"
              onClick={function() { navigate('/payroll/reports') }}
            >
              <div className="pd-action-icon">📊</div>
              <div className="pd-action-label">Reports</div>
              <div className="pd-action-hint">Payroll summaries</div>
            </button>
            */}
            {/* Year-End Forms — hidden for launch, coming in v1.1
            <button
              className="pd-action"
              onClick={function() { navigate('/payroll/year-end') }}
            >
              <div className="pd-action-icon">📄</div>
              <div className="pd-action-label">Year-End Forms</div>
              <div className="pd-action-hint">W-2, 1099, 941</div>
            </button>
            */}
          </div>
        </div>
      </div>

      {/* TIME CLOCK ACTIVITY */}
      <div className="pd-two-col">

        {/* Currently clocked in */}
        <div className="pd-card pd-clock-card">
          <div className="pd-card-header">
            <h2>🟢 Currently Clocked In</h2>
            <div className="pd-clock-header-right">
              <span className="pd-clock-count">{clockedIn.length} staff</span>
              {clockedIn.length > 0 && (
                <button
                  className="pd-view-all"
                  onClick={function() { navigate('/staff/timeclock') }}
                >
                  View all →
                </button>
              )}
            </div>
          </div>
          {clockedIn.length === 0 ? (
            <div className="pd-clock-empty">
              <p>Nobody clocked in right now.</p>
            </div>
          ) : (
            <div className="pd-clock-list">
              {clockedIn.slice(0, 5).map(function(c) {
                return (
                  <div key={c.id} className="pd-clock-row">
                    <div className="pd-clock-dot"></div>
                    <div className="pd-clock-info">
                      <div className="pd-clock-name">{c.name}</div>
                      {c.role && <div className="pd-clock-role">{c.role}</div>}
                    </div>
                    <div className="pd-clock-time">
                      <div className="pd-clock-dur">{timeSince(c.clockIn)}</div>
                      <div className="pd-clock-start">since {formatClockTime(c.clockIn)}</div>
                    </div>
                  </div>
                )
              })}
              {clockedIn.length > 5 && (
                <div className="pd-hours-more">
                  + {clockedIn.length - 5} more clocked in
                </div>
              )}
            </div>
          )}
        </div>

        {/* Last 7 days hours */}
        <div className="pd-card pd-hours-card">
          <div className="pd-card-header">
            <h2>⏱️ Hours — Last 7 Days</h2>
            <button
              className="pd-view-all"
              onClick={function() { navigate('/staff/timeclock') }}
            >
              Full timesheet →
            </button>
          </div>
          {weekHours.length === 0 ? (
            <div className="pd-clock-empty">
              <p>No completed time clock entries in the last 7 days.</p>
            </div>
          ) : (
            <div className="pd-hours-list">
              {weekHours.slice(0, 8).map(function(h) {
                return (
                  <div key={h.staffId} className="pd-hours-row">
                    <div className="pd-hours-info">
                      <div className="pd-hours-name">{h.name}</div>
                      <div className="pd-hours-meta">
                        {h.role && <span>{h.role}</span>}
                        {h.role && <span className="pd-dot-sep">•</span>}
                        <span className={'pd-worker-tag ' + (h.workerType === '1099' ? 'pd-worker-1099' : 'pd-worker-w2')}>
                          {h.workerType === '1099' ? '1099' : 'W-2'}
                        </span>
                      </div>
                    </div>
                    <div className="pd-hours-total">
                      <strong>{formatHours(h.totalHours)}</strong> hrs
                    </div>
                  </div>
                )
              })}
              {weekHours.length > 8 && (
                <div className="pd-hours-more">+ {weekHours.length - 8} more</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RECENT PAY PERIODS */}
      <div className="pd-card">
        <div className="pd-card-header">
          <h2>📅 Recent Pay Periods</h2>
          {recentPeriods.length > 0 && (
            <button
              className="pd-view-all"
              onClick={function() { navigate('/payroll/pay-periods') }}
            >
              View all →
            </button>
          )}
        </div>

        {recentPeriods.length === 0 ? (
          <div className="pd-empty">
            <div className="pd-empty-icon">📅</div>
            <p>No pay periods yet. Once you run your first payroll, they'll show up here.</p>
          </div>
        ) : (
          <div className="pd-table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPeriods.map(function(p) {
                  return (
                    <tr
                      key={p.id}
                      onClick={function() { navigate('/payroll/pay-periods') }}
                      className="pd-table-row"
                    >
                      <td>{formatDate(p.start_date)}</td>
                      <td>{formatDate(p.end_date)}</td>
                      <td>
                        {p.period_type === 'weekly' && 'Weekly'}
                        {p.period_type === 'bi_weekly' && 'Bi-Weekly'}
                        {p.period_type === 'semi_monthly' && 'Semi-Monthly'}
                        {p.period_type === 'monthly' && 'Monthly'}
                      </td>
                      <td>{statusBadge(p.status)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
