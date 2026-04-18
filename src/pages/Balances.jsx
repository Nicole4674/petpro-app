import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Balances() {
  var navigate = useNavigate()
  var [loading, setLoading] = useState(true)
  var [balances, setBalances] = useState([])
  var [totalOwed, setTotalOwed] = useState(0)
  var [clientCount, setClientCount] = useState(0)

  useEffect(function() {
    fetchBalances()
  }, [])

  async function fetchBalances() {
    setLoading(true)
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Get all checked-out appointments
    var { data: appts, error: aErr } = await supabase
      .from('appointments')
      .select(`
        id,
        appointment_date,
        start_time,
        quoted_price,
        final_price,
        discount_amount,
        checked_out_at,
        clients:client_id ( id, first_name, last_name, phone ),
        pets:pet_id ( id, name, breed ),
        services:service_id ( service_name )
      `)
      .eq('groomer_id', user.id)
      .not('checked_out_at', 'is', null)
      .order('appointment_date', { ascending: false })

    if (aErr) {
      console.error('Balances: appointments fetch error:', aErr)
      setBalances([])
      setLoading(false)
      return
    }

    if (!appts || appts.length === 0) {
      setBalances([])
      setTotalOwed(0)
      setClientCount(0)
      setLoading(false)
      return
    }

    // Get all payments for those appointments
    var apptIds = appts.map(function(a) { return a.id })
    var { data: payments } = await supabase
      .from('payments')
      .select('appointment_id, amount, created_at')
      .in('appointment_id', apptIds)

    // Build payment totals map
    var paidMap = {}
    var lastPaidMap = {}
    ;(payments || []).forEach(function(p) {
      if (!paidMap[p.appointment_id]) paidMap[p.appointment_id] = 0
      paidMap[p.appointment_id] += parseFloat(p.amount || 0)
      var ts = new Date(p.created_at).getTime()
      if (!lastPaidMap[p.appointment_id] || ts > lastPaidMap[p.appointment_id]) {
        lastPaidMap[p.appointment_id] = ts
      }
    })

    // Filter to appointments with unpaid balance
    var unpaid = []
    appts.forEach(function(a) {
      var servicePrice = parseFloat(a.final_price != null ? a.final_price : (a.quoted_price || 0))
      var discount = parseFloat(a.discount_amount || 0)
      var totalDue = servicePrice - discount
      var totalPaid = paidMap[a.id] || 0
      var balance = totalDue - totalPaid
      if (balance > 0.01) {
        unpaid.push({
          apptId: a.id,
          appointmentDate: a.appointment_date,
          startTime: a.start_time,
          clientId: a.clients ? a.clients.id : null,
          clientName: a.clients ? (a.clients.first_name + ' ' + a.clients.last_name) : 'Unknown',
          clientPhone: a.clients ? a.clients.phone : null,
          petName: a.pets ? a.pets.name : '—',
          petBreed: a.pets ? a.pets.breed : '',
          serviceName: a.services ? a.services.service_name : '—',
          totalDue: totalDue,
          totalPaid: totalPaid,
          balance: balance,
          lastPaidAt: lastPaidMap[a.id] || null
        })
      }
    })

    // Sort: never-paid first (lastPaidAt null), then by oldest lastPaidAt
    unpaid.sort(function(a, b) {
      if (a.lastPaidAt == null && b.lastPaidAt != null) return -1
      if (a.lastPaidAt != null && b.lastPaidAt == null) return 1
      if (a.lastPaidAt == null && b.lastPaidAt == null) {
        // Both unpaid — oldest appointment first
        return a.appointmentDate.localeCompare(b.appointmentDate)
      }
      return a.lastPaidAt - b.lastPaidAt
    })

    var sum = 0
    var clientSet = {}
    unpaid.forEach(function(u) {
      sum += u.balance
      if (u.clientId) clientSet[u.clientId] = true
    })

    setBalances(unpaid)
    setTotalOwed(sum)
    setClientCount(Object.keys(clientSet).length)
    setLoading(false)
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—'
    var d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatLastPaid(ts) {
    if (!ts) return 'Never paid'
    var d = new Date(ts)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function daysSince(dateStr) {
    if (!dateStr) return 0
    var d = new Date(dateStr + 'T00:00:00')
    var now = new Date()
    now.setHours(0, 0, 0, 0)
    return Math.floor((now - d) / (1000 * 60 * 60 * 24))
  }

  return (
    <div className="balances-page">
      <div className="balances-header">
        <div>
          <h1 className="balances-title">💰 Outstanding Balances</h1>
          <p className="balances-subtitle">Clients with unpaid balances from completed appointments</p>
        </div>
        <button className="balances-refresh-btn" onClick={fetchBalances} disabled={loading}>
          {loading ? '⟳ Refreshing…' : '⟳ Refresh'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="balances-summary">
        <div className="balances-summary-card balances-summary-owed">
          <div className="balances-summary-label">Total Owed</div>
          <div className="balances-summary-value">${totalOwed.toFixed(2)}</div>
        </div>
        <div className="balances-summary-card">
          <div className="balances-summary-label">Clients</div>
          <div className="balances-summary-value">{clientCount}</div>
        </div>
        <div className="balances-summary-card">
          <div className="balances-summary-label">Appointments</div>
          <div className="balances-summary-value">{balances.length}</div>
        </div>
      </div>

      {loading && (
        <div className="balances-loading">Loading balances…</div>
      )}

      {!loading && balances.length === 0 && (
        <div className="balances-empty">
          <div className="balances-empty-icon">✅</div>
          <div className="balances-empty-title">All caught up!</div>
          <div className="balances-empty-sub">No clients owe you money from completed appointments.</div>
        </div>
      )}

      {!loading && balances.length > 0 && (
        <div className="balances-list">
          {balances.map(function(b) {
            var daysOld = daysSince(b.appointmentDate)
            return (
              <div key={b.apptId} className="balance-row">
                <div
                  className="balance-row-main"
                  onClick={function() { if (b.clientId) navigate('/clients/' + b.clientId) }}
                >
                  <div className="balance-row-left">
                    <div className="balance-row-client">
                      {b.clientName}
                      {daysOld > 30 && (
                        <span className="balance-row-overdue">{daysOld} days overdue</span>
                      )}
                    </div>
                    <div className="balance-row-detail">
                      🐾 {b.petName}
                      {b.petBreed && <span className="balance-row-breed"> · {b.petBreed}</span>}
                    </div>
                    <div className="balance-row-detail">
                      ✂️ {b.serviceName} · {formatDate(b.appointmentDate)}
                    </div>
                    <div className="balance-row-lastpaid">
                      Last payment: <strong>{formatLastPaid(b.lastPaidAt)}</strong>
                    </div>
                  </div>

                  <div className="balance-row-right">
                    <div className="balance-row-amount">${b.balance.toFixed(2)}</div>
                    <div className="balance-row-ofdue">
                      of ${b.totalDue.toFixed(2)}
                      {b.totalPaid > 0 && (
                        <span className="balance-row-paid"> · ${b.totalPaid.toFixed(2)} paid</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="balance-row-actions">
                  <button
                    className="balance-action-btn balance-action-remind"
                    disabled
                    title="Coming soon with Twilio"
                  >
                    📲 Send Reminder
                  </button>
                  <button
                    className="balance-action-btn balance-action-pay"
                    onClick={function() {
                      // Navigate to calendar with query param so Calendar can auto-open payment popup
                      navigate('/calendar?openPayment=' + b.apptId)
                    }}
                  >
                    💵 Record Payment
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
