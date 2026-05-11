// =============================================================================
// Analytics.jsx — Groomer-side metrics dashboard
// =============================================================================
// Day / Week / Month / Year toggle at the top. Pulls real data from
// appointments, clients, payments, subscriptions and renders:
//   • KPI cards: revenue, appointments, new clients, returning, avg ticket
//   • Donut wheel: New / Recurring / Returning client mix
//   • Revenue trend (SVG line chart)
//   • Service breakdown (SVG bar chart)
//   • Top clients leaderboard
//   • Grow your shop tips — static curated + smart adaptive ones based on
//     this groomer's actual data (lapsed clients, weak repeat rate, etc.)
//
// Charts are hand-rolled SVG so we don't pull in recharts. Keeps bundle
// small and lets us style consistently with the rest of the app.
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Standard period buttons. "Day" = today only. "Week"/"Month"/"Year" = trailing.
// 'custom' lets the groomer pick any start + end date (past OR future) — useful
// for "what did I make the week of my birthday last June" or "how booked am I
// the week before vacation in August."
const RANGES = [
  { id: 'day',    label: 'Today',     days: 1 },
  { id: 'week',   label: 'This Week', days: 7 },
  { id: 'month',  label: 'Month',     days: 30 },
  { id: 'year',   label: 'Year',      days: 365 },
  { id: 'custom', label: '📅 Custom', days: null },
]

// Industry-ish averages for the smart tips section. These are best-guess
// benchmarks for solo / small grooming shops — used to surface "you're
// doing better/worse than average" suggestions, not as gospel.
const INDUSTRY_REPEAT_RATE = 0.45  // ~45% of clients come back within 60 days

export default function Analytics() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState(null)
  const [range, setRange] = useState('month')
  // Custom date range — defaults to the previous full week so it's never
  // empty. Only used when range === 'custom'.
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  })
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)

  // Raw data buckets — pulled once per range change
  const [appts, setAppts] = useState([])
  const [allClients, setAllClients] = useState([])  // every client (need first-appt date)
  const [payments, setPayments] = useState([])
  const [activeSubs, setActiveSubs] = useState([])
  const [recurringSeries, setRecurringSeries] = useState([])

  // ─── Load data when range changes ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }
        if (cancelled) return
        setUserId(user.id)

        // Custom range = use the picked start/end. Otherwise = trailing N days
        // ending today.
        let startISO, endISO
        if (range === 'custom') {
          // Defensive: if start > end, swap them so the query works
          startISO = customStart <= customEnd ? customStart : customEnd
          endISO = customStart <= customEnd ? customEnd : customStart
        } else {
          const days = RANGES.find(r => r.id === range)?.days || 30
          const now = new Date()
          startISO = new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10)
          endISO = now.toISOString().slice(0, 10)
        }

        // Pull appointments in range with linked client + service info.
        // Using final_price ?? quoted_price for revenue (final_price wins
        // because it accounts for last-minute add-ons / discounts).
        const apptsP = supabase
          .from('appointments')
          .select('id, client_id, appointment_date, status, quoted_price, final_price, services(service_name), checked_out_at')
          .eq('groomer_id', user.id)
          .gte('appointment_date', startISO)
          .lte('appointment_date', endISO)
          .order('appointment_date', { ascending: true })

        // Every client (small table, needed to know who's "new" — first-ever
        // appt vs returning). We pull just the IDs + names + created_at.
        const clientsP = supabase
          .from('clients')
          .select('id, first_name, last_name, created_at')
          .eq('groomer_id', user.id)

        // Payments in range so revenue is reconciled (handles tips +
        // discount-applied charges that don't always reflect in quoted_price).
        const paymentsP = supabase
          .from('payments')
          .select('amount, tip_amount, refunded_amount, created_at, appointment_id, client_id')
          .eq('groomer_id', user.id)
          .gte('created_at', startISO + 'T00:00:00')

        // Active subscriptions for the "recurring" donut bucket + MRR card
        const subsP = supabase
          .from('client_subscriptions')
          .select('client_id, status, cancel_at_period_end, subscription_plans(price_cents, billing_interval)')
          .eq('groomer_id', user.id)
          .eq('status', 'active')

        // Recurring series → also count clients on these as "recurring"
        const seriesP = supabase
          .from('recurring_series')
          .select('client_id, status')
          .eq('groomer_id', user.id)
          .eq('status', 'active')

        const [
          { data: apptRows },
          { data: clientRows },
          { data: paymentRows },
          { data: subRows },
          { data: seriesRows },
        ] = await Promise.all([apptsP, clientsP, paymentsP, subsP, seriesP])

        if (!cancelled) {
          setAppts(apptRows || [])
          setAllClients(clientRows || [])
          setPayments(paymentRows || [])
          setActiveSubs(subRows || [])
          setRecurringSeries(seriesRows || [])
        }
      } catch (e) {
        console.error('[Analytics] load:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [range, customStart, customEnd, navigate])

  // ─── Derived metrics ──────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const days = RANGES.find(r => r.id === range)?.days || 30
    const now = new Date()
    const startMs = now.getTime() - (days - 1) * 86400000
    const startISO = new Date(startMs).toISOString().slice(0, 10)

    // Revenue from payments (most accurate)
    let grossPaid = 0, totalTips = 0, totalRefunds = 0
    for (const p of payments) {
      grossPaid += parseFloat(p.amount || 0)
      totalTips += parseFloat(p.tip_amount || 0)
      totalRefunds += parseFloat(p.refunded_amount || 0)
    }
    const netRevenue = Math.max(0, grossPaid - totalRefunds + totalTips)

    // Appointment buckets
    const completed = appts.filter(a => a.checked_out_at || a.status === 'completed')
    const noShows = appts.filter(a => a.status === 'no_show')
    const cancelled = appts.filter(a => a.status === 'cancelled')
    const avgTicket = completed.length > 0 ? netRevenue / completed.length : 0

    // Build a Set of client_ids who had ANY appt before the range starts
    // (so we can tell new vs returning). For each client, find min appt date.
    // We don't have all-history appts here so approximate via clients.created_at:
    // if their record was created in the range, treat as "new this period".
    const clientFirstSeen = {}
    for (const c of allClients) {
      clientFirstSeen[c.id] = c.created_at ? c.created_at.slice(0, 10) : '0000-01-01'
    }

    // Client mix: who's actually appearing in this range?
    const clientsInRange = new Set(appts.map(a => a.client_id).filter(Boolean))
    const recurringClientIds = new Set([
      ...activeSubs.map(s => s.client_id),
      ...recurringSeries.map(r => r.client_id),
    ])

    let newCount = 0, recurringCount = 0, returningCount = 0
    for (const cid of clientsInRange) {
      if (recurringClientIds.has(cid)) {
        recurringCount++
      } else if ((clientFirstSeen[cid] || '0000-01-01') >= startISO) {
        newCount++
      } else {
        returningCount++
      }
    }

    // MRR — only show if there are subs
    let mrrCents = 0
    for (const s of activeSubs) {
      if (s.cancel_at_period_end) continue
      const plan = s.subscription_plans
      if (!plan) continue
      const c = plan.price_cents || 0
      if (plan.billing_interval === 'week') mrrCents += c * 4.33
      else if (plan.billing_interval === 'year') mrrCents += c / 12
      else mrrCents += c
    }
    const mrr = mrrCents / 100

    // Service breakdown — sum revenue + count by service name
    const byService = {}
    for (const a of completed) {
      const name = a.services?.service_name || 'Other'
      if (!byService[name]) byService[name] = { name, count: 0, revenue: 0 }
      byService[name].count++
      byService[name].revenue += parseFloat(a.final_price || a.quoted_price || 0)
    }
    const services = Object.values(byService).sort((a, b) => b.revenue - a.revenue).slice(0, 8)

    // Revenue over time — bucket by day for ranges <=30, by week for year
    const bucketSize = days <= 30 ? 1 : 7  // 1-day vs 7-day buckets
    const buckets = {}
    for (const p of payments) {
      const d = (p.created_at || '').slice(0, 10)
      if (!d) continue
      // For year view, snap to the start of the week (rough, treats weeks as 7-day rolls)
      let key = d
      if (bucketSize === 7) {
        const dt = new Date(d + 'T00:00:00')
        const dayOfWeek = dt.getDay()
        const weekStart = new Date(dt.getTime() - dayOfWeek * 86400000)
        key = weekStart.toISOString().slice(0, 10)
      }
      if (!buckets[key]) buckets[key] = 0
      const net = parseFloat(p.amount || 0) - parseFloat(p.refunded_amount || 0) + parseFloat(p.tip_amount || 0)
      buckets[key] += Math.max(0, net)
    }
    const trend = Object.entries(buckets)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Top clients in range
    const clientStats = {}
    for (const a of completed) {
      const cid = a.client_id
      if (!cid) continue
      if (!clientStats[cid]) clientStats[cid] = { id: cid, visits: 0, revenue: 0, last: '' }
      clientStats[cid].visits++
      clientStats[cid].revenue += parseFloat(a.final_price || a.quoted_price || 0)
      if (a.appointment_date > clientStats[cid].last) clientStats[cid].last = a.appointment_date
    }
    // Attach names
    const nameById = {}
    for (const c of allClients) nameById[c.id] = `${c.first_name || ''} ${c.last_name || ''}`.trim()
    const topClients = Object.values(clientStats)
      .map(c => ({ ...c, name: nameById[c.id] || '—' }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    // Repeat rate proxy = % of returning + recurring clients out of all who came in
    const totalClients = clientsInRange.size
    const repeatRate = totalClients > 0 ? (returningCount + recurringCount) / totalClients : 0

    // ─── TIPS — every payment with tip_amount > 0 ─────────────────────
    // Drives the "Tips Earned" card. Useful for taxes + spotting top tippers.
    const tipPayments = payments
      .filter(p => parseFloat(p.tip_amount || 0) > 0)
      .map(p => ({
        amount: parseFloat(p.tip_amount || 0),
        date: (p.created_at || '').slice(0, 10),
        clientId: p.client_id,
        method: p.method || 'unknown',
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
    const tipsTotal = tipPayments.reduce((sum, t) => sum + t.amount, 0)
    const tipsCount = tipPayments.length
    // Tip rate = % of completed appointments that received any tip.
    // Falls back to 0 if no completed appts (avoid divide-by-zero).
    const tipRate = completed.length > 0 ? tipsCount / completed.length : 0
    const avgTip = tipsCount > 0 ? tipsTotal / tipsCount : 0
    // Group tips by client → top tippers leaderboard
    const tipsByClient = {}
    for (const t of tipPayments) {
      if (!t.clientId) continue
      if (!tipsByClient[t.clientId]) tipsByClient[t.clientId] = { id: t.clientId, total: 0, count: 0 }
      tipsByClient[t.clientId].total += t.amount
      tipsByClient[t.clientId].count++
    }
    const topTippers = Object.values(tipsByClient)
      .map(t => ({ ...t, name: nameById[t.id] || '—' }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
    // Cap shown tip rows at 50 — older ones still in tipPayments for export later
    const recentTips = tipPayments.slice(0, 50).map(t => ({
      ...t,
      clientName: nameById[t.clientId] || '—',
    }))

    // Lapsed client count for tip section: anyone with a visit 56-180 days ago
    // and no visit since. Computed from appointments table — needs data outside
    // the current range though, so we approximate using clients who have >=1
    // visit but none in the last 56 days. Best-effort with what we have loaded.
    // For accuracy we'd need a separate query — leaving as a soft estimate.
    return {
      grossPaid, netRevenue, totalTips, totalRefunds, mrr,
      apptCount: appts.length,
      completed: completed.length,
      noShows: noShows.length,
      cancelled: cancelled.length,
      avgTicket,
      newCount, recurringCount, returningCount,
      totalClients,
      services,
      trend,
      topClients,
      repeatRate,
      // Tip data for the Tips Earned section
      tipsTotal, tipsCount, tipRate, avgTip,
      topTippers, recentTips,
    }
  }, [appts, allClients, payments, activeSubs, recurringSeries, range])

  if (loading) {
    return <div style={{ padding: '60px', textAlign: 'center', color: '#9ca3af' }}>Loading analytics…</div>
  }

  // Build a friendly label for the current range (used in headers + tips)
  let rangeLabel = RANGES.find(r => r.id === range)?.label || ''
  if (range === 'custom') {
    const fmt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    rangeLabel = `${fmt(customStart)} – ${fmt(customEnd)}`
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ─── Header + range toggle ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1f2937', margin: '0 0 4px' }}>📊 Analytics</h1>
          <p style={{ color: '#6b7280', margin: 0, fontSize: '14px' }}>How your shop is doing — {rangeLabel.toLowerCase()}.</p>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', flexWrap: 'wrap' }}>
          {RANGES.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)}
              style={{
                padding: '8px 18px',
                background: range === r.id ? '#7c3aed' : 'transparent',
                color: range === r.id ? '#fff' : '#6b7280',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date pickers — only shown when Custom is selected.
          Works for past dates (last June) AND future dates (week before
          a vacation in August), so groomers can plan ahead too. */}
      {range === 'custom' && (
        <div style={{ background: '#faf5ff', border: '1.5px solid #ddd6fe', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#5b21b6', fontSize: '13px' }}>📅 Pick range:</span>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>
            From
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', marginTop: '2px' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>
            To
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', marginTop: '2px' }}
            />
          </label>
          <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 600 }}>
            Tip: pick any range — past for review, future for planning ahead.
          </span>
        </div>
      )}

      {/* ─── KPI cards ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <KpiCard label="REVENUE" value={`$${metrics.netRevenue.toFixed(0)}`} sub={`${metrics.totalTips > 0 ? `incl. $${metrics.totalTips.toFixed(0)} tips` : 'net of refunds'}`} accent="#7c3aed" />
        <KpiCard label="APPOINTMENTS" value={metrics.completed} sub={`${metrics.apptCount} booked · ${metrics.noShows} no-show`} accent="#16a34a" />
        <KpiCard label="NEW CLIENTS" value={metrics.newCount} sub={`first time this ${rangeLabel.toLowerCase()}`} accent="#0ea5e9" />
        <KpiCard label="RETURNING" value={metrics.returningCount + metrics.recurringCount} sub={`${metrics.recurringCount} on subscription/recurring`} accent="#f59e0b" />
        <KpiCard label="AVG TICKET" value={`$${metrics.avgTicket.toFixed(0)}`} sub="per completed appt" accent="#dc2626" />
        {metrics.mrr > 0 && (
          <KpiCard label="MRR" value={`$${metrics.mrr.toFixed(0)}`} sub="monthly recurring revenue" accent="#7c3aed" />
        )}
      </div>

      {/* ─── Donut wheel + revenue trend, side by side ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <Card title="🥧 Client Mix">
          <DonutChart
            slices={[
              { label: 'New', value: metrics.newCount, color: '#0ea5e9' },
              { label: 'Returning', value: metrics.returningCount, color: '#f59e0b' },
              { label: 'Recurring', value: metrics.recurringCount, color: '#7c3aed' },
            ]}
            centerLabel={`${metrics.totalClients}`}
            centerSubLabel="clients"
          />
          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px', textAlign: 'center' }}>
            Recurring = active subscription or recurring schedule. New = first appointment in this range.
          </div>
        </Card>

        <Card title="📈 Revenue Trend">
          {metrics.trend.length === 0 ? (
            <EmptyChartHint text="No revenue recorded in this range yet." />
          ) : (
            <LineChart data={metrics.trend} />
          )}
        </Card>
      </div>

      {/* ─── Service breakdown ─── */}
      <Card title="✂️ Service Breakdown">
        {metrics.services.length === 0 ? (
          <EmptyChartHint text="No completed appointments to break down yet." />
        ) : (
          <BarChart data={metrics.services} />
        )}
      </Card>

      {/* ─── Top clients leaderboard ─── */}
      <Card title="🏆 Top Clients">
        {metrics.topClients.length === 0 ? (
          <EmptyChartHint text="Once you've checked out a few appointments, your top clients will show here." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={thStyle}>Client</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Visits</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Revenue</th>
                <th style={thStyle}>Last visit</th>
              </tr>
            </thead>
            <tbody>
              {metrics.topClients.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}><strong>{c.name}</strong></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{c.visits}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>${c.revenue.toFixed(2)}</td>
                  <td style={tdStyle}>{c.last ? new Date(c.last + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* ─── Tips Earned ─── */}
      {/* Total + avg + tip rate at the top, top tippers leaderboard,
          full list of every tip in this range so groomers can verify
          for tax purposes. Honors the date toggle above. */}
      <Card title="💵 Tips Earned">
        {metrics.tipsCount === 0 ? (
          <EmptyChartHint text={`No tips recorded in this ${rangeLabel.toLowerCase()}. Once payments come in with a tip amount, they'll show here.`} />
        ) : (
          <>
            {/* Tip KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
              <TipStat label="TOTAL TIPS" value={`$${metrics.tipsTotal.toFixed(2)}`} sub={`${metrics.tipsCount} tip${metrics.tipsCount === 1 ? '' : 's'}`} />
              <TipStat label="AVG TIP" value={`$${metrics.avgTip.toFixed(2)}`} sub="per tipped appt" />
              <TipStat label="TIP RATE" value={`${(metrics.tipRate * 100).toFixed(0)}%`} sub="of completed appts" />
            </div>

            {/* Top Tippers leaderboard — only show if 2+ tippers */}
            {metrics.topTippers.length >= 2 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>🏅 Top Tippers</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {metrics.topTippers.map((t, i) => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: i === 0 ? '#fef3c7' : '#f9fafb', borderRadius: '6px', fontSize: '13px' }}>
                      <span><strong>{i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : `${i + 1}. `}{t.name}</strong> <span style={{ color: '#9ca3af', fontSize: '11px' }}>· {t.count} tip{t.count === 1 ? '' : 's'}</span></span>
                      <span style={{ color: '#16a34a', fontWeight: 800 }}>${t.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full tip list — capped at 50 rows for performance */}
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '6px' }}>📜 Recent Tips ({metrics.recentTips.length})</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Client</th>
                    <th style={thStyle}>Method</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Tip</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.recentTips.map((t, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={tdStyle}>{t.date ? new Date(t.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                      <td style={tdStyle}>{t.clientName}</td>
                      <td style={{ ...tdStyle, color: '#9ca3af', fontSize: '11px', textTransform: 'uppercase' }}>{t.method}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>${t.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* ─── Grow your shop tips ─── */}
      <GrowYourShopTips metrics={metrics} userId={userId} rangeLabel={rangeLabel} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CARD + KPI SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function Card({ title, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '18px 20px', marginBottom: '16px' }}>
      <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 800, color: '#1f2937' }}>{title}</h3>
      {children}
    </div>
  )
}

function KpiCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderTop: `4px solid ${accent}`,
      borderRadius: '12px',
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 700, letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: '#1f2937', marginTop: '4px' }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{sub}</div>
    </div>
  )
}

function EmptyChartHint({ text }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>
      {text}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CHART SUBCOMPONENTS — pure SVG, no library
// ═══════════════════════════════════════════════════════════════════════════

// Donut chart — slices passed as [{label, value, color}].
// Renders a colored ring with a number in the center.
function DonutChart({ slices, centerLabel, centerSubLabel }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  const size = 200
  const stroke = 36
  const radius = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * radius

  // If total is 0, draw a single grey ring so it doesn't look broken
  if (total === 0) {
    return (
      <div style={{ textAlign: 'center' }}>
        <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
          <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 28, fontWeight: 800, fill: '#9ca3af' }}>0</text>
          <text x={cx} y={cy + 18} textAnchor="middle" style={{ fontSize: 11, fill: '#9ca3af' }}>clients</text>
        </svg>
      </div>
    )
  }

  let offset = 0
  return (
    <div style={{ textAlign: 'center' }}>
      {/* Wheel + center number stacked via absolute positioning so the
          legend below isn't fighting negative margins. */}
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
          {/* Background ring */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
          {slices.map((s, i) => {
            if (s.value === 0) return null
            const len = (s.value / total) * circ
            const dasharray = `${len} ${circ - len}`
            const dashoffset = -offset
            offset += len
            return (
              <circle
                key={i}
                cx={cx} cy={cy} r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
              />
            )
          })}
        </svg>
        {/* Center label — absolute so it doesn't displace flow */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#1f2937', lineHeight: 1 }}>{centerLabel}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: '4px' }}>{centerSubLabel}</div>
        </div>
      </div>
      {/* Legend — sits cleanly below the wheel now */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '12px', marginTop: '14px' }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: s.color, display: 'inline-block' }} />
            <span><strong>{s.value}</strong> {s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Line chart for revenue trend — 1 series, smooth path
function LineChart({ data }) {
  const w = 500
  const h = 180
  const pad = { top: 10, right: 10, bottom: 28, left: 40 }
  const innerW = w - pad.left - pad.right
  const innerH = h - pad.top - pad.bottom
  const max = Math.max(...data.map(d => d.total), 1)

  const xStep = data.length > 1 ? innerW / (data.length - 1) : innerW
  const points = data.map((d, i) => ({
    x: pad.left + (data.length > 1 ? i * xStep : innerW / 2),
    y: pad.top + innerH - (d.total / max) * innerH,
    label: d.date,
    value: d.total,
  }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaD = pathD + ` L ${points[points.length - 1].x} ${pad.top + innerH} L ${points[0].x} ${pad.top + innerH} Z`

  // Y-axis ticks: 0, max/2, max
  const yTicks = [0, max / 2, max]

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={w} height={h} style={{ display: 'block', minWidth: '100%' }} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        {/* Y gridlines + labels */}
        {yTicks.map((v, i) => {
          const y = pad.top + innerH - (v / max) * innerH
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={pad.left + innerW} y2={y} stroke="#f3f4f6" strokeWidth="1" />
              <text x={pad.left - 6} y={y + 3} textAnchor="end" style={{ fontSize: 10, fill: '#9ca3af' }}>${Math.round(v)}</text>
            </g>
          )
        })}
        {/* Area fill */}
        <path d={areaD} fill="#7c3aed" fillOpacity="0.1" />
        {/* Line */}
        <path d={pathD} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill="#7c3aed" />
            <title>{p.label}: ${p.value.toFixed(2)}</title>
          </g>
        ))}
        {/* X-axis labels (first, middle, last) */}
        {[0, Math.floor(data.length / 2), data.length - 1]
          .filter((idx, i, arr) => arr.indexOf(idx) === i && idx >= 0 && idx < data.length)
          .map((idx, i) => {
            const p = points[idx]
            const dt = new Date(data[idx].date + 'T12:00:00')
            const lab = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            return <text key={i} x={p.x} y={h - 8} textAnchor="middle" style={{ fontSize: 10, fill: '#6b7280' }}>{lab}</text>
          })}
      </svg>
    </div>
  )
}

// Bar chart — horizontal bars (better for service names that vary in length)
function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.revenue), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map((d, i) => {
        const pct = (d.revenue / max) * 100
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px 50px', gap: '10px', alignItems: 'center', fontSize: '12px' }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{d.name}</div>
            <div style={{ background: '#f3f4f6', height: '20px', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg, #7c3aed, #a855f7)' }} />
            </div>
            <div style={{ textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>${d.revenue.toFixed(0)}</div>
            <div style={{ textAlign: 'right', color: '#9ca3af', fontSize: '11px' }}>{d.count}×</div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// GROW YOUR SHOP TIPS — static curated + smart adaptive based on real data
// ═══════════════════════════════════════════════════════════════════════════

const STATIC_TIPS = [
  {
    icon: '⭐',
    title: 'Ask for a Google review at checkout',
    body: 'Right after you hand the dog back, while they\'re happy: "If you loved Bella\'s groom, a quick Google review means the world." Print a QR card with your Google review link. Repeat clients = 5x more likely to leave one if asked.',
  },
  {
    icon: '📸',
    title: 'Post a before/after to local Facebook groups',
    body: 'Local mom + neighborhood Facebook groups are gold. One good before/after post per week of an extreme matted-coat transformation lands new clients consistently. Tag the breed.',
  },
  {
    icon: '🎁',
    title: 'Referral discount card',
    body: 'Hand existing clients 3 cards: "$10 off your next groom when a friend books." Easy revenue, zero ad spend, and the friend usually rebooks too.',
  },
  {
    icon: '🤝',
    title: 'Partner with local pet stores + vets',
    body: 'Drop your business cards (or a $5-off coupon) at independent pet stores, dog daycares, vet offices, even doggy daycares. Most are happy to display them — they\'re NOT competition.',
  },
  {
    icon: '📅',
    title: 'Auto-rebook recurring clients',
    body: 'When a client says "see you in 6 weeks," book it on the spot before they leave. Filling next month\'s calendar today is the #1 way to stop the slow-week panic.',
  },
]

function GrowYourShopTips({ metrics, userId, rangeLabel }) {
  // Smart adaptive tips — these only render if the metric condition is met
  const smartTips = []

  // Repeat rate compared to industry
  if (metrics.totalClients >= 5) {
    if (metrics.repeatRate >= INDUSTRY_REPEAT_RATE + 0.10) {
      smartTips.push({
        icon: '🔥',
        title: `You're crushing the repeat rate — ${(metrics.repeatRate * 100).toFixed(0)}%`,
        body: `Industry average is ~${(INDUSTRY_REPEAT_RATE * 100).toFixed(0)}%. Your retention is way above. Lean into that with referral cards — your existing clients clearly love you.`,
        tone: 'good',
      })
    } else if (metrics.repeatRate < INDUSTRY_REPEAT_RATE - 0.10) {
      smartTips.push({
        icon: '⚠️',
        title: `Repeat rate is ${(metrics.repeatRate * 100).toFixed(0)}% — room to grow`,
        body: `Industry average is ~${(INDUSTRY_REPEAT_RATE * 100).toFixed(0)}%. Try: rebook on the spot at checkout, send a thank-you text 2 days after, post a report card to their portal.`,
        tone: 'warn',
      })
    }
  }

  // No-show rate alert
  if (metrics.apptCount >= 10) {
    const noShowRate = metrics.noShows / metrics.apptCount
    if (noShowRate >= 0.10) {
      smartTips.push({
        icon: '🚫',
        title: `No-show rate is ${(noShowRate * 100).toFixed(0)}%`,
        body: 'High no-shows kill your day. Make sure SMS reminders are ON in Shop Settings, consider a no-show fee policy, and call 1st-time clients the day before.',
        tone: 'warn',
      })
    }
  }

  // No new clients warning
  if (metrics.newCount === 0 && metrics.completed >= 5) {
    smartTips.push({
      icon: '🌱',
      title: `Zero new clients ${rangeLabel.toLowerCase()}`,
      body: 'All your appointments are existing clients (great!) — but no new growth. Try one of the tips below: post a before/after, drop cards at a local pet store, or share your portal link.',
      tone: 'warn',
    })
  }

  // Subscription push
  if (metrics.totalClients >= 10 && metrics.recurringCount === 0) {
    smartTips.push({
      icon: '🔁',
      title: 'No subscription clients yet',
      body: 'You have a solid client base — try offering an "unlimited nail trims" or "monthly bath" subscription. Even 5 subscribers at $30/mo = $150/mo guaranteed without lifting a finger.',
      tone: 'idea',
    })
  }

  return (
    <div style={{ marginTop: '24px', background: 'linear-gradient(135deg, #fef3c7, #fef9e7)', border: '1.5px solid #fde68a', borderRadius: '14px', padding: '20px 22px' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 800, color: '#92400e' }}>💡 Grow your shop</h3>
      <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#78350f' }}>Curated tips + smart suggestions based on your real numbers.</p>

      {/* Smart tips first (the data-driven ones) */}
      {smartTips.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          {smartTips.map((t, i) => (
            <Tip key={'smart' + i} icon={t.icon} title={t.title} body={t.body} tone={t.tone} highlight />
          ))}
        </div>
      )}

      {/* Static evergreen tips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
        {STATIC_TIPS.map((t, i) => (
          <Tip key={i} icon={t.icon} title={t.title} body={t.body} />
        ))}
      </div>
    </div>
  )
}

function Tip({ icon, title, body, tone, highlight }) {
  // tone: 'good' (green), 'warn' (red-ish), 'idea' (purple), undefined (neutral)
  const accentBg = tone === 'good' ? '#dcfce7' :
                   tone === 'warn' ? '#fef2f2' :
                   tone === 'idea' ? '#ede9fe' :
                   '#fff'
  const accentBorder = tone === 'good' ? '#86efac' :
                       tone === 'warn' ? '#fecaca' :
                       tone === 'idea' ? '#c4b5fd' :
                       '#fde68a'
  return (
    <div style={{
      background: accentBg,
      border: `1.5px solid ${accentBorder}`,
      borderRadius: '10px',
      padding: '12px 14px',
      ...(highlight ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : {}),
    }}>
      <div style={{ fontSize: '13px', fontWeight: 800, color: '#1f2937', marginBottom: '4px' }}>{icon} {title}</div>
      <div style={{ fontSize: '12px', color: '#374151', lineHeight: 1.4 }}>{body}</div>
    </div>
  )
}

// Shared cell styles for the top-clients table
const thStyle = { textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }
const tdStyle = { padding: '10px 12px', verticalAlign: 'middle' }

// Small green KPI tile used in the Tips Earned section
function TipStat({ label, value, sub }) {
  return (
    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 12px' }}>
      <div style={{ fontSize: '10px', color: '#166534', fontWeight: 700, letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{sub}</div>
    </div>
  )
}
