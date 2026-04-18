// =======================================================
// PetPro — Run Payroll page
// Phase 3A.5 / Chunk 4
// 4-step multi-step flow:
//   1. Setup       — pick dates, period type, staff to include
//   2. Calculate   — auto-pulls hours + revenue + tips + YTD wages
//   3. Review      — editable table of estimated paychecks
//   4. Done        — saves pay_period + paychecks rows to Supabase
//
// DESIGN PHILOSOPHY:
//   All tax numbers here are ESTIMATES. Shop owner can edit every
//   cell before finalizing. PetPro does NOT process payments — the
//   shop owner pays staff however they normally do.
// =======================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calculatePaychecksForPeriod } from '../lib/payrollTax'

export default function RunPayroll() {
  var navigate = useNavigate()

  // ----- Step state -----
  var [step, setStep] = useState(1)    // 1 Setup, 2 Calculate, 3 Review, 4 Done
  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [error, setError] = useState('')
  var [groomerId, setGroomerId] = useState(null)

  // ----- Setup step state -----
  var [periodType, setPeriodType] = useState('bi_weekly')
  var [startDate, setStartDate] = useState('')
  var [endDate, setEndDate] = useState('')
  var [payDate, setPayDate] = useState('')
  var [allStaff, setAllStaff] = useState([])
  var [selectedStaffIds, setSelectedStaffIds] = useState([])
  var [shopSettings, setShopSettings] = useState(null)

  // ----- Calculate + Review step state -----
  var [paycheckResults, setPaycheckResults] = useState([])
  var [editedPaychecks, setEditedPaychecks] = useState({}) // staffId -> overrides

  // ----- Done step state -----
  var [finalizedPeriod, setFinalizedPeriod] = useState(null)

  // ========================================================
  // INITIAL LOAD
  // ========================================================
  useEffect(function () {
    init()
  }, [])

  async function init() {
    setLoading(true)
    var { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setGroomerId(user.id)

    // Active staff only — 'status' column is 'active' | 'inactive' | 'invited'
    var { data: staff } = await supabase
      .from('staff_members')
      .select('*')
      .eq('groomer_id', user.id)
      .eq('status', 'active')
      .order('first_name')

    if (staff) {
      setAllStaff(staff)
      setSelectedStaffIds(staff.map(function (s) { return s.id }))
    }

    // Shop tax settings (may be null if they haven't set up)
    var { data: settings } = await supabase
      .from('shop_tax_settings')
      .select('*')
      .eq('groomer_id', user.id)
      .maybeSingle()
    setShopSettings(settings)

    // Default dates — last 14 days, pay in 3 days
    var today = new Date()
    var start = new Date(today); start.setDate(start.getDate() - 13)
    var end = new Date(today); end.setDate(end.getDate() - 1)
    var pay = new Date(today); pay.setDate(pay.getDate() + 3)
    setStartDate(toDateInput(start))
    setEndDate(toDateInput(end))
    setPayDate(toDateInput(pay))

    setLoading(false)
  }

  function toDateInput(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0')
  }

  // ========================================================
  // STEP 1: toggle staff include/exclude
  // ========================================================
  function toggleStaff(id) {
    setSelectedStaffIds(function (prev) {
      if (prev.indexOf(id) !== -1) return prev.filter(function (x) { return x !== id })
      return prev.concat([id])
    })
  }

  function selectAll() {
    setSelectedStaffIds(allStaff.map(function (s) { return s.id }))
  }
  function selectNone() {
    setSelectedStaffIds([])
  }

  // ========================================================
  // STEP 2: pull hours + revenue + tips + YTD wages, then calc
  // ========================================================
  async function runCalculation() {
    setError('')
    setStep(2)

    try {
      var selectedStaff = allStaff.filter(function (s) {
        return selectedStaffIds.indexOf(s.id) !== -1
      })

      var periodActivity = {}

      for (var i = 0; i < selectedStaff.length; i++) {
        var s = selectedStaff[i]
        var activity = {
          hoursWorked: 0,
          serviceRevenue: 0,
          tipsAmount: 0,
          ytdWages: 0
        }

        // --- Hours from time_clock (uses total_minutes so breaks are subtracted) ---
        try {
          var { data: clockEntries } = await supabase
            .from('time_clock')
            .select('clock_in, clock_out, total_minutes, break_minutes')
            .eq('staff_id', s.id)
            .gte('clock_in', startDate + 'T00:00:00')
            .lte('clock_in', endDate + 'T23:59:59')
            .not('clock_out', 'is', null)

          if (clockEntries) {
            var totalMinutes = 0
            clockEntries.forEach(function (e) {
              // Prefer the break-adjusted total_minutes stamped at clock-out.
              if (e.total_minutes != null) {
                totalMinutes += parseFloat(e.total_minutes) || 0
              } else {
                // Fallback for older rows that never got total_minutes written:
                // compute raw minutes and subtract any break_minutes.
                var inT = new Date(e.clock_in)
                var outT = new Date(e.clock_out)
                var mins = (outT - inT) / (1000 * 60)
                var brk = parseFloat(e.break_minutes) || 0
                var net = mins - brk
                if (net > 0 && net < 1440) totalMinutes += net
              }
            })
            activity.hoursWorked = Math.round((totalMinutes / 60) * 100) / 100
          }
        } catch (e) { /* table may not exist yet — continue */ }

        // --- Service revenue + tips from appointments ---
        try {
          var { data: appts } = await supabase
            .from('appointments')
            .select('price, tip_amount, assigned_staff_id')
            .eq('assigned_staff_id', s.id)
            .gte('appointment_date', startDate)
            .lte('appointment_date', endDate)

          if (appts) {
            appts.forEach(function (a) {
              activity.serviceRevenue += parseFloat(a.price) || 0
              activity.tipsAmount += parseFloat(a.tip_amount) || 0
            })
          }
        } catch (e) { /* skip if columns/table differ */ }

        // --- YTD wages for FUTA/SUTA caps ---
        try {
          var yearStart = new Date().getFullYear() + '-01-01'
          var { data: ytdChecks } = await supabase
            .from('paychecks')
            .select('gross_pay')
            .eq('staff_id', s.id)
            .gte('pay_date', yearStart)
          if (ytdChecks) {
            activity.ytdWages = ytdChecks.reduce(function (sum, c) {
              return sum + (parseFloat(c.gross_pay) || 0)
            }, 0)
          }
        } catch (e) { /* no paychecks yet is fine */ }

        periodActivity[s.id] = activity
      }

      // --- Active deduction rules for all selected staff (one bulk query) ---
      var deductionsByStaffId = {}
      try {
        var staffIds = selectedStaff.map(function (ss) { return ss.id })
        if (staffIds.length > 0) {
          var { data: ruleRows } = await supabase
            .from('staff_deductions')
            .select('*')
            .in('staff_id', staffIds)
            .eq('is_active', true)
          if (ruleRows) {
            ruleRows.forEach(function (rr) {
              if (!deductionsByStaffId[rr.staff_id]) deductionsByStaffId[rr.staff_id] = []
              deductionsByStaffId[rr.staff_id].push(rr)
            })
          }
        }
      } catch (e) { /* staff_deductions table not set up yet — run with no deductions */ }

      var results = calculatePaychecksForPeriod(selectedStaff, periodActivity, shopSettings, deductionsByStaffId)
      results.forEach(function (r) {
        r.activity = periodActivity[r.staffId]
      })

      setPaycheckResults(results)
      setEditedPaychecks({})
      setStep(3)
    } catch (err) {
      setError(err.message || 'Something went wrong while calculating paychecks.')
      setStep(1)
    }
  }

  // ========================================================
  // STEP 3: edits + final paycheck merge
  // ========================================================
  function updatePaycheckField(staffId, field, value) {
    setEditedPaychecks(function (prev) {
      var next = Object.assign({}, prev)
      if (!next[staffId]) next[staffId] = {}
      next[staffId][field] = value
      return next
    })
  }

  function getFinalPaycheck(staffId) {
    var base = paycheckResults.find(function (r) { return r.staffId === staffId })
    if (!base) return null
    var pc = Object.assign({}, base.paycheck)
    var edits = editedPaychecks[staffId] || {}

    // Apply numeric overrides
    Object.keys(edits).forEach(function (k) {
      var v = parseFloat(edits[k])
      if (!isNaN(v)) pc[k] = v
    })

    // Recompute taxable + net from the merged values.
    // Pre-tax deductions reduce taxable income (so fed/state/SS/medicare shrink too).
    // Post-tax deductions reduce ONLY net pay.
    var preTax = parseFloat(pc.pre_tax_deductions_total) || 0
    var postTax = parseFloat(pc.post_tax_deductions_total) || 0

    var taxable = Math.round((((pc.gross_pay || 0) + (pc.tips || 0)) - preTax) * 100) / 100
    if (taxable < 0) taxable = 0
    pc.taxable_income = taxable

    var withhold = (pc.social_security_tax || 0)
      + (pc.medicare_tax || 0)
      + (pc.federal_tax || 0)
      + (pc.state_tax || 0)

    var net = Math.round((taxable - withhold - postTax) * 100) / 100
    if (net < 0) net = 0
    pc.net_pay = net
    return pc
  }

  // ========================================================
  // STEP 4: save to Supabase
  // ========================================================
  async function finalizePayroll() {
    setSaving(true)
    setError('')

    try {
      // 1. pay_periods row
      var { data: period, error: pErr } = await supabase
        .from('pay_periods')
        .insert({
          groomer_id: groomerId,
          start_date: startDate,
          end_date: endDate,
          pay_date: payDate,
          period_type: periodType,
          status: 'closed'
        })
        .select()
        .single()
      if (pErr) throw pErr

      // 2. paychecks rows — use .select() so we get IDs back for deduction snapshots
      var rows = paycheckResults.map(function (r) {
        var pc = getFinalPaycheck(r.staffId) || r.paycheck
        return Object.assign({
          groomer_id: groomerId,
          pay_period_id: period.id,
          staff_id: r.staffId,
          pay_date: payDate,
          hours_worked: r.activity.hoursWorked,
          service_revenue: r.activity.serviceRevenue
        }, pc)
      })
      var { data: insertedChecks, error: cErr } = await supabase
        .from('paychecks')
        .insert(rows)
        .select()
      if (cErr) throw cErr

      // 3. Snapshot each applied deduction into paycheck_deductions, then bump amount_paid_to_date
      //    on each rule so caps track correctly across payroll runs.
      try {
        // Map staff_id -> inserted paycheck row (for pulling paycheck IDs)
        var checkByStaffId = {}
        if (insertedChecks) {
          insertedChecks.forEach(function (c) { checkByStaffId[c.staff_id] = c })
        }

        var snapshotRows = []
        var ruleBumps = {}   // staff_deduction_id -> total additional $ paid this run

        paycheckResults.forEach(function (r) {
          var check = checkByStaffId[r.staffId]
          if (!check) return
          var applied = r.appliedDeductions || []
          applied.forEach(function (ad) {
            var rule = ad.rule
            if (!rule) return
            snapshotRows.push({
              paycheck_id: check.id,
              groomer_id: groomerId,
              staff_deduction_id: rule.id,
              name: rule.name,
              deduction_type: rule.deduction_type,
              tax_treatment: rule.tax_treatment,
              amount_type: rule.amount_type,
              amount_configured: rule.amount,
              amount_deducted: ad.amount_deducted
            })
            ruleBumps[rule.id] = (ruleBumps[rule.id] || 0) + (parseFloat(ad.amount_deducted) || 0)
          })
        })

        if (snapshotRows.length > 0) {
          var { error: dErr } = await supabase.from('paycheck_deductions').insert(snapshotRows)
          if (dErr) throw dErr
        }

        // Bump amount_paid_to_date on each rule (read-modify-write — Supabase has no atomic increment)
        var ruleIds = Object.keys(ruleBumps)
        if (ruleIds.length > 0) {
          var { data: currentRules } = await supabase
            .from('staff_deductions')
            .select('id, amount_paid_to_date')
            .in('id', ruleIds)
          if (currentRules) {
            for (var k = 0; k < currentRules.length; k++) {
              var cr = currentRules[k]
              var newPaid = Math.round(
                ((parseFloat(cr.amount_paid_to_date) || 0) + (ruleBumps[cr.id] || 0)) * 100
              ) / 100
              await supabase
                .from('staff_deductions')
                .update({ amount_paid_to_date: newPaid, updated_at: new Date().toISOString() })
                .eq('id', cr.id)
            }
          }
        }
      } catch (dedErr) {
        // Paychecks were already saved — surface the deduction issue without losing the run.
        console.error('Deduction snapshot/bump failed:', dedErr)
        setError('Paychecks saved, but deduction history failed: ' + (dedErr.message || dedErr))
      }

      setFinalizedPeriod(period)
      setStep(4)
    } catch (err) {
      setError(err.message || 'Something went wrong saving the paychecks.')
    }
    setSaving(false)
  }

  // ========================================================
  // HELPERS
  // ========================================================
  function money(n) {
    return '$' + (parseFloat(n) || 0).toFixed(2)
  }

  // Totals for the Review summary cards.
  // "shopCost" = the true money-out-the-door number for the shop:
  //   gross pay (staff earnings) + tips (passed through) +
  //   employer-side taxes that the SHOP pays on top of gross (SS/Medicare
  //   match + FUTA + SUTA). These don't appear on the staff's paycheck
  //   but they DO leave the shop's bank account.
  var totals = { gross: 0, tips: 0, taxes: 0, deductions: 0, net: 0, shopCost: 0 }
  paycheckResults.forEach(function (r) {
    var pc = getFinalPaycheck(r.staffId) || r.paycheck
    totals.gross += pc.gross_pay || 0
    totals.tips += pc.tips || 0
    totals.taxes += (pc.social_security_tax || 0)
      + (pc.medicare_tax || 0)
      + (pc.federal_tax || 0)
      + (pc.state_tax || 0)
    totals.deductions += (parseFloat(pc.pre_tax_deductions_total) || 0)
      + (parseFloat(pc.post_tax_deductions_total) || 0)
    totals.net += pc.net_pay || 0
    totals.shopCost += (pc.gross_pay || 0)
      + (pc.tips || 0)
      + (parseFloat(pc.employer_ss_match) || 0)
      + (parseFloat(pc.employer_medicare_match) || 0)
      + (parseFloat(pc.employer_futa) || 0)
      + (parseFloat(pc.employer_suta) || 0)
  })

  if (loading) return <div className="page-loading">Loading payroll setup...</div>

  // ========================================================
  // RENDER
  // ========================================================
  return (
    <div className="rp-page">
      {/* ---------- Header ---------- */}
      <div className="rp-header">
        <div>
          <h1>💰 Run Payroll</h1>
          <p className="rp-subtitle">
            Estimate paychecks for a pay period. Review every line before finalizing.
          </p>
        </div>
        <button className="rp-back-btn" onClick={function () { navigate('/payroll') }}>
          ← Dashboard
        </button>
      </div>

      {/* ---------- Estimates-only disclaimer ---------- */}
      <div className="rp-disclaimer">
        ⚠️ <strong>ESTIMATES ONLY.</strong> PetPro does not file or pay taxes.
        Tax math is a bookkeeping helper — always confirm with your accountant.
      </div>

      {/* ---------- Step indicator ---------- */}
      <div className="rp-steps">
        {[1, 2, 3, 4].map(function (n) {
          var labels = { 1: 'Setup', 2: 'Calculate', 3: 'Review', 4: 'Done' }
          var cls = 'rp-step'
          if (step === n) cls += ' rp-step-active'
          if (step > n) cls += ' rp-step-done'
          return (
            <div key={n} className="rp-step-wrap">
              <div className={cls}>
                <div className="rp-step-num">{step > n ? '✓' : n}</div>
                <div className="rp-step-label">{labels[n]}</div>
              </div>
              {n < 4 && <div className={'rp-step-line' + (step > n ? ' rp-step-line-done' : '')}></div>}
            </div>
          )
        })}
      </div>

      {/* ---------- STEP 1: Setup ---------- */}
      {step === 1 && (
        <div className="rp-card">
          <h2 className="rp-card-title">Step 1 — Pay Period Setup</h2>

          <div className="rp-grid-2">
            <div className="rp-field">
              <label>Pay Period Type</label>
              <select value={periodType} onChange={function (e) { setPeriodType(e.target.value) }}>
                <option value="weekly">Weekly</option>
                <option value="bi_weekly">Bi-Weekly</option>
                <option value="semi_monthly">Semi-Monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="rp-field">
              <label>Pay Date <span className="rp-field-hint">(when you'll actually pay staff)</span></label>
              <input type="date" value={payDate} onChange={function (e) { setPayDate(e.target.value) }} />
            </div>
            <div className="rp-field">
              <label>Period Start</label>
              <input type="date" value={startDate} onChange={function (e) { setStartDate(e.target.value) }} />
            </div>
            <div className="rp-field">
              <label>Period End</label>
              <input type="date" value={endDate} onChange={function (e) { setEndDate(e.target.value) }} />
            </div>
          </div>

          <div className="rp-staff-section">
            <div className="rp-staff-header">
              <h3 className="rp-section-title">Who's getting paid?</h3>
              {allStaff.length > 0 && (
                <div className="rp-staff-toggles">
                  <button type="button" className="rp-mini-btn" onClick={selectAll}>Select all</button>
                  <button type="button" className="rp-mini-btn" onClick={selectNone}>None</button>
                </div>
              )}
            </div>

            {allStaff.length === 0 ? (
              <div className="rp-empty-inline">
                No active staff yet. Add staff from the Staff page to run payroll.
              </div>
            ) : (
              <div className="rp-staff-list">
                {allStaff.map(function (s) {
                  var checked = selectedStaffIds.indexOf(s.id) !== -1
                  return (
                    <label key={s.id} className={'rp-staff-row' + (checked ? ' rp-staff-checked' : '')}>
                      <input type="checkbox" checked={checked} onChange={function () { toggleStaff(s.id) }} />
                      <div className="rp-staff-info">
                        <div className="rp-staff-name">{s.first_name} {s.last_name}</div>
                        <div className="rp-staff-meta">
                          <span className={'rp-tag rp-tag-' + (s.worker_type || 'w2')}>
                            {(s.worker_type || 'w2').toUpperCase()}
                          </span>
                          <span className="rp-staff-paytype">{(s.pay_type || 'hourly').replace('_', ' + ')}</span>
                          {s.role && <span className="rp-staff-role">{s.role}</span>}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {error && <div className="rp-error">{error}</div>}

          <div className="rp-actions">
            <button className="rp-btn rp-btn-secondary" onClick={function () { navigate('/payroll') }}>
              Cancel
            </button>
            <button
              className="rp-btn rp-btn-primary"
              disabled={!startDate || !endDate || !payDate || selectedStaffIds.length === 0}
              onClick={runCalculation}
            >
              Next: Calculate →
            </button>
          </div>
        </div>
      )}

      {/* ---------- STEP 2: Calculating ---------- */}
      {step === 2 && (
        <div className="rp-card rp-calc-card">
          <div className="rp-spinner"></div>
          <h2>Calculating paychecks…</h2>
          <p>
            Pulling hours from Time Clock, service revenue from Appointments, and YTD wages.
            This usually takes just a few seconds.
          </p>
        </div>
      )}

      {/* ---------- STEP 3: Review ---------- */}
      {step === 3 && (
        <>
          {/* Summary totals (same vibe as Dashboard stat cards) */}
          <div className="rp-totals">
            <div className="rp-total-card rp-total-gross">
              <div className="rp-total-label">GROSS PAY</div>
              <div className="rp-total-value">{money(totals.gross)}</div>
            </div>
            <div className="rp-total-card rp-total-tips">
              <div className="rp-total-label">TIPS</div>
              <div className="rp-total-value">{money(totals.tips)}</div>
            </div>
            <div className="rp-total-card rp-total-tax">
              <div className="rp-total-label">EST. TAXES</div>
              <div className="rp-total-value">{money(totals.taxes)}</div>
            </div>
            <div className="rp-total-card rp-total-ded">
              <div className="rp-total-label">DEDUCTIONS</div>
              <div className="rp-total-value">{money(totals.deductions)}</div>
            </div>
            <div className="rp-total-card rp-total-net">
              <div className="rp-total-label">NET PAY</div>
              <div className="rp-total-value">{money(totals.net)}</div>
            </div>
            <div className="rp-total-card rp-total-cost">
              <div className="rp-total-label">TOTAL SHOP COST</div>
              <div className="rp-total-value">{money(totals.shopCost)}</div>
              <div className="rp-total-hint">gross + tips + employer taxes</div>
            </div>
          </div>

          <div className="rp-card">
            <h2 className="rp-card-title">Step 3 — Review Paychecks</h2>
            <p className="rp-review-hint">
              Edit any dollar amount to adjust. Net pay recalculates automatically.
              1099 contractors show $0 tax because they handle their own.
            </p>

            {shopSettings && !shopSettings.tax_estimates_enabled && (
              <div className="rp-note">
                ℹ️ Tax estimates are currently <strong>OFF</strong> in Tax Settings —
                only gross pay + tips are shown. Turn estimates on to see withholdings.
              </div>
            )}

            <div className="rp-table-wrap">
              <table className="rp-paycheck-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Type</th>
                    <th>Hours</th>
                    <th>Gross</th>
                    <th>Tips</th>
                    <th>Fed</th>
                    <th>State</th>
                    <th>SS</th>
                    <th>Medicare</th>
                    <th>Pre-Tax Ded</th>
                    <th>Post-Tax Ded</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {paycheckResults.map(function (r) {
                    var pc = getFinalPaycheck(r.staffId)
                    var is1099 = (r.staff.worker_type || 'w2') !== 'w2'
                    return (
                      <tr key={r.staffId}>
                        <td>
                          <div className="rp-staff-name">{r.staff.first_name} {r.staff.last_name}</div>
                          <div className="rp-staff-role-sm">{r.staff.role}</div>
                        </td>
                        <td>
                          <span className={'rp-tag rp-tag-' + (r.staff.worker_type || 'w2')}>
                            {(r.staff.worker_type || 'w2').toUpperCase()}
                          </span>
                        </td>
                        <td className="rp-hours-cell">{(r.activity.hoursWorked || 0).toFixed(2)}</td>
                        <td>
                          <input type="number" step="0.01" className="rp-cell"
                            value={pc.gross_pay}
                            onChange={function (e) { updatePaycheckField(r.staffId, 'gross_pay', e.target.value) }}
                          />
                        </td>
                        <td>
                          <input type="number" step="0.01" className="rp-cell"
                            value={pc.tips}
                            onChange={function (e) { updatePaycheckField(r.staffId, 'tips', e.target.value) }}
                          />
                        </td>
                        <td>
                          <input type="number" step="0.01"
                            className={'rp-cell' + (is1099 ? ' rp-cell-disabled' : '')}
                            value={pc.federal_tax} disabled={is1099}
                            onChange={function (e) { updatePaycheckField(r.staffId, 'federal_tax', e.target.value) }}
                          />
                        </td>
                        <td>
                          <input type="number" step="0.01"
                            className={'rp-cell' + (is1099 ? ' rp-cell-disabled' : '')}
                            value={pc.state_tax} disabled={is1099}
                            onChange={function (e) { updatePaycheckField(r.staffId, 'state_tax', e.target.value) }}
                          />
                        </td>
                        <td>
                          <input type="number" step="0.01"
                            className={'rp-cell' + (is1099 ? ' rp-cell-disabled' : '')}
                            value={pc.social_security_tax} disabled={is1099}
                            onChange={function (e) { updatePaycheckField(r.staffId, 'social_security_tax', e.target.value) }}
                          />
                        </td>
                        <td>
                          <input type="number" step="0.01"
                            className={'rp-cell' + (is1099 ? ' rp-cell-disabled' : '')}
                            value={pc.medicare_tax} disabled={is1099}
                            onChange={function (e) { updatePaycheckField(r.staffId, 'medicare_tax', e.target.value) }}
                          />
                        </td>
                        <td className="rp-ded-cell">{money(pc.pre_tax_deductions_total)}</td>
                        <td className="rp-ded-cell">{money(pc.post_tax_deductions_total)}</td>
                        <td className="rp-net-cell">{money(pc.net_pay)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {error && <div className="rp-error">{error}</div>}

            <div className="rp-actions">
              <button className="rp-btn rp-btn-secondary" onClick={function () { setStep(1) }}>
                ← Back
              </button>
              <button className="rp-btn rp-btn-primary" disabled={saving} onClick={finalizePayroll}>
                {saving ? 'Saving…' : '✓ Finalize Pay Period'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ---------- STEP 4: Done ---------- */}
      {step === 4 && finalizedPeriod && (
        <div className="rp-card rp-done-card">
          <div className="rp-done-icon">✅</div>
          <h2>Pay Period Closed</h2>
          <p className="rp-done-summary">
            {paycheckResults.length} paycheck{paycheckResults.length !== 1 ? 's' : ''} saved.
            &nbsp;Total net pay: <strong>{money(totals.net)}</strong>
          </p>
          <p className="rp-done-hint">
            Remember: PetPro doesn't process payments. Pay your staff however you normally do
            (check, direct deposit, Venmo, Zelle, cash). These records are for your bookkeeping
            and tax-season estimates only.
          </p>
          <div className="rp-actions">
            <button className="rp-btn rp-btn-secondary" onClick={function () { navigate('/payroll/pay-periods') }}>
              View All Pay Periods
            </button>
            <button className="rp-btn rp-btn-primary" onClick={function () { navigate('/payroll') }}>
              ← Back to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
