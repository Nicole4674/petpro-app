import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PayPeriods() {
  var navigate = useNavigate()
  var [loading, setLoading] = useState(true)
  var [periods, setPeriods] = useState([])
  var [paychecks, setPaychecks] = useState([])   // all paychecks for this groomer
  var [staffMap, setStaffMap] = useState({})     // staff_id → staff row
  var [groomerId, setGroomerId] = useState(null)
  var [expanded, setExpanded] = useState({})     // period_id → true/false

  useEffect(function() {
    fetchAll()
  }, [])

  // ==========================================
  // Load pay periods + all paychecks + all staff in parallel
  // so we can show paycheck details inline under each period
  // ==========================================
  async function fetchAll() {
    setLoading(true)
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setGroomerId(user.id)

    var results = await Promise.all([
      supabase.from('pay_periods').select('*').eq('groomer_id', user.id).order('start_date', { ascending: false }),
      supabase.from('paychecks').select('*').eq('groomer_id', user.id),
      supabase.from('staff_members').select('id, first_name, last_name, worker_type, role').eq('groomer_id', user.id),
    ])

    var pdRes = results[0]
    var pcRes = results[1]
    var stRes = results[2]

    if (pdRes && pdRes.data) setPeriods(pdRes.data)
    if (pcRes && pcRes.data) setPaychecks(pcRes.data)
    if (stRes && stRes.data) {
      var sm = {}
      stRes.data.forEach(function(s) { sm[s.id] = s })
      setStaffMap(sm)
    }
    setLoading(false)
  }

  function getPaychecksForPeriod(periodId) {
    return paychecks.filter(function(p) { return p.pay_period_id === periodId })
  }

  function getStaffName(staffId) {
    var s = staffMap[staffId]
    if (!s) return 'Unknown Staff'
    return ((s.first_name || '') + ' ' + (s.last_name || '')).trim() || 'Unknown Staff'
  }

  function getStaffWorkerType(staffId) {
    var s = staffMap[staffId]
    return s ? (s.worker_type || 'w2') : 'w2'
  }

  function toggleExpand(periodId) {
    setExpanded(function(prev) {
      var next = Object.assign({}, prev)
      next[periodId] = !prev[periodId]
      return next
    })
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    var d = new Date(dateStr + 'T00:00:00')
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear()
  }

  function fmtMoney(n) {
    return '$' + Number(n || 0).toFixed(2)
  }

  function statusBadge(status) {
    if (status === 'open') return <span className="pp-badge pp-badge-open">🟢 Open</span>
    if (status === 'closed') return <span className="pp-badge pp-badge-closed">🔒 Closed</span>
    if (status === 'paid') return <span className="pp-badge pp-badge-paid">✅ Paid</span>
    return <span className="pp-badge">{status}</span>
  }

  if (loading) {
    return <div className="page-loading">Loading payroll...</div>
  }

  return (
    <div className="pp-page">
      <div className="pp-header">
        <div>
          <h1>💰 Payroll — Pay Periods</h1>
          <p className="pp-subtitle">Review past pay periods, run payroll for the current period.</p>
        </div>
        <button className="pp-run-btn" onClick={function() { navigate('/payroll/run') }}>
          ➕ Run New Pay Period
        </button>
      </div>

      {periods.length === 0 ? (
        <div className="pp-empty">
          <div className="pp-empty-icon">📅</div>
          <h3>No pay periods yet</h3>
          <p>
            Once you run your first payroll, pay periods will show up here with their status
            (Open, Closed, or Paid) and totals for gross pay, taxes, and net pay.
          </p>
          <p className="pp-empty-hint">
            💡 Before running payroll, make sure you've set up your <strong>Tax Settings</strong>
            (state, business EIN) and each staff member's <strong>Pay tab</strong>.
          </p>
        </div>
      ) : (
        <div className="pp-table-wrap">
          <table className="pp-table">
            <thead>
              <tr>
                <th style={{ width: '32px' }}></th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Type</th>
                <th>Status</th>
                <th>Paychecks</th>
                <th style={{ width: '100px' }}></th>
              </tr>
            </thead>
            <tbody>
              {periods.map(function(p) {
                var pcs = getPaychecksForPeriod(p.id)
                var isOpen = !!expanded[p.id]
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={'pp-row-parent' + (isOpen ? ' pp-row-parent-open' : '')}
                      onClick={function() { toggleExpand(p.id) }}
                    >
                      <td className="pp-expand-cell">{isOpen ? '▼' : '▶'}</td>
                      <td>{formatDate(p.start_date)}</td>
                      <td>{formatDate(p.end_date)}</td>
                      <td className="pp-type">
                        {p.period_type === 'weekly' && 'Weekly'}
                        {p.period_type === 'bi_weekly' && 'Bi-Weekly'}
                        {p.period_type === 'semi_monthly' && 'Semi-Monthly'}
                        {p.period_type === 'monthly' && 'Monthly'}
                      </td>
                      <td>{statusBadge(p.status)}</td>
                      <td>{pcs.length}</td>
                      <td>
                        <button
                          className="pp-view-btn"
                          onClick={function(e) { e.stopPropagation(); toggleExpand(p.id) }}
                        >
                          {isOpen ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="pp-row-expand">
                        <td colSpan="7">
                          {pcs.length === 0 ? (
                            <div className="pp-expand-empty">
                              No paychecks recorded for this period yet.
                            </div>
                          ) : (
                            <table className="pp-paycheck-table">
                              <thead>
                                <tr>
                                  <th>Staff</th>
                                  <th>Type</th>
                                  <th>Hours</th>
                                  <th>Gross</th>
                                  <th>Tips</th>
                                  <th>Taxes</th>
                                  <th>Net</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {pcs.map(function(pc) {
                                  var totTax =
                                    Number(pc.federal_tax_withheld || 0) +
                                    Number(pc.state_tax_withheld || 0) +
                                    Number(pc.social_security_withheld || 0) +
                                    Number(pc.medicare_withheld || 0)
                                  var wt = getStaffWorkerType(pc.staff_id)
                                  return (
                                    <tr
                                      key={pc.id}
                                      className="pp-paycheck-row"
                                      onClick={function() { navigate('/payroll/paycheck/' + pc.id) }}
                                    >
                                      <td>{getStaffName(pc.staff_id)}</td>
                                      <td>
                                        <span className={'pp-worker-tag ' + (wt === '1099' ? 'pp-worker-1099' : 'pp-worker-w2')}>
                                          {wt === '1099' ? '1099' : 'W-2'}
                                        </span>
                                      </td>
                                      <td>{Number(pc.hours_worked || 0).toFixed(2)}</td>
                                      <td>{fmtMoney(pc.gross_pay)}</td>
                                      <td>{fmtMoney(pc.tips)}</td>
                                      <td>{fmtMoney(totTax)}</td>
                                      <td><strong>{fmtMoney(pc.net_pay)}</strong></td>
                                      <td>
                                        <button
                                          className="pp-paycheck-detail-btn"
                                          onClick={function(e) {
                                            e.stopPropagation()
                                            navigate('/payroll/paycheck/' + pc.id)
                                          }}
                                        >
                                          Detail →
                                        </button>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
