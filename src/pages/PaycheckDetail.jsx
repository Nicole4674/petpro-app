import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ==========================================
// PaycheckDetail Page
// ==========================================
// Shows the full breakdown for a single paycheck:
//   - Staff info (name, role, worker type)
//   - Pay period dates
//   - Gross / Tips / Taxes / Net summary cards
//   - Hours worked + service revenue
//   - Line-by-line tax breakdown (federal, state, FICA, FUTA, SUTA)
//   - Actions: back, edit (stub), print/PDF (stub)
//
// Route: /payroll/paycheck/:id
// ==========================================

export default function PaycheckDetail() {
  var { id } = useParams()
  var navigate = useNavigate()

  var [loading, setLoading] = useState(true)
  var [error, setError] = useState(null)
  var [paycheck, setPaycheck] = useState(null)
  var [staff, setStaff] = useState(null)
  var [period, setPeriod] = useState(null)
  var [deductions, setDeductions] = useState([])

  useEffect(function () {
    loadPaycheck()
  }, [id])

  async function loadPaycheck() {
    try {
      setLoading(true)
      setError(null)

      // 1. Load the paycheck row
      var { data: pc, error: pcErr } = await supabase
        .from('paychecks')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (pcErr) throw pcErr
      if (!pc) {
        setError('Paycheck not found.')
        setLoading(false)
        return
      }

      setPaycheck(pc)

      // 2. Load the staff member
      if (pc.staff_id) {
        var { data: staffData } = await supabase
          .from('staff_members')
          .select('*')
          .eq('id', pc.staff_id)
          .maybeSingle()
        if (staffData) setStaff(staffData)
      }

      // 3. Load the pay period
      if (pc.pay_period_id) {
        var { data: periodData } = await supabase
          .from('pay_periods')
          .select('*')
          .eq('id', pc.pay_period_id)
          .maybeSingle()
        if (periodData) setPeriod(periodData)
      }

      // 4. Load any deductions that were applied to this paycheck
      //    (pre-tax health/retirement, post-tax garnishments, etc.)
      var { data: dedData, error: dedErr } = await supabase
        .from('paycheck_deductions')
        .select('*')
        .eq('paycheck_id', id)
        .order('tax_treatment', { ascending: true })

      if (dedErr) {
        console.warn('Could not load deductions:', dedErr.message)
        setDeductions([])
      } else {
        setDeductions(dedData || [])
      }

      setLoading(false)
    } catch (err) {
      console.error('loadPaycheck error:', err)
      setError(err.message || 'Failed to load paycheck.')
      setLoading(false)
    }
  }

  function fmtMoney(n) {
    var num = Number(n || 0)
    return '$' + num.toFixed(2)
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—'
    try {
      var d = new Date(dateStr)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch (e) {
      return dateStr
    }
  }

  function fmtHours(n) {
    var num = Number(n || 0)
    return num.toFixed(2) + ' hrs'
  }

  function getStaffName() {
    if (!staff) return 'Unknown Staff'
    var first = staff.first_name || ''
    var last = staff.last_name || ''
    return (first + ' ' + last).trim() || 'Unknown Staff'
  }

  function getWorkerTag() {
    if (!staff) return null
    var wt = staff.worker_type || 'w2'
    return (
      <span className={'pd-worker-tag ' + (wt === '1099' ? 'pd-worker-1099' : 'pd-worker-w2')}>
        {wt === '1099' ? '1099' : 'W-2'}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="pd-page">
        <div className="pd-loading">
          <div className="pd-spinner"></div>
          <div>Loading paycheck…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pd-page">
        <div className="pd-error-card">
          <div className="pd-error-icon">⚠️</div>
          <div className="pd-error-text">{error}</div>
          <button className="pd-btn-secondary" onClick={function () { navigate('/payroll/pay-periods') }}>
            ← Back to Pay Periods
          </button>
        </div>
      </div>
    )
  }

  if (!paycheck) return null

  // Totals for the taxes summary
  var taxTotal =
    Number(paycheck.federal_tax || 0) +
    Number(paycheck.state_tax || 0) +
    Number(paycheck.social_security_tax || 0) +
    Number(paycheck.medicare_tax || 0)

  var isW2 = !staff || (staff.worker_type || 'w2') === 'w2'

  // Split deductions by tax treatment and compute subtotals
  var preTaxDeductions = deductions.filter(function (d) {
    return (d.tax_treatment || '').toLowerCase() === 'pre_tax'
  })
  var postTaxDeductions = deductions.filter(function (d) {
    return (d.tax_treatment || '').toLowerCase() === 'post_tax'
  })
  var preTaxTotal = preTaxDeductions.reduce(function (sum, d) {
    return sum + Number(d.amount_deducted || 0)
  }, 0)
  var postTaxTotal = postTaxDeductions.reduce(function (sum, d) {
    return sum + Number(d.amount_deducted || 0)
  }, 0)
  var deductionTotal = preTaxTotal + postTaxTotal

  return (
    <div className="pd-page">
      {/* Header */}
      <div className="pd-header">
        <button className="pd-back-btn" onClick={function () { navigate('/payroll/pay-periods') }}>
          ← Back
        </button>
        <div className="pd-header-main">
          <h1 className="pd-title">
            💵 Paycheck Detail
          </h1>
          <div className="pd-subtitle">
            {getStaffName()} {getWorkerTag()}
            {staff && staff.role && (
              <span className="pd-role-chip">{staff.role.replace('_', ' ')}</span>
            )}
          </div>
        </div>
        <div className="pd-header-actions">
          <button className="pd-btn-secondary" disabled title="Coming soon — edit paycheck">
            ✏️ Edit
          </button>
          <button className="pd-btn-primary" disabled title="Coming soon — download PDF pay stub">
            🖨️ Print Stub
          </button>
        </div>
      </div>

      {/* Pay Period Card */}
      <div className="pd-period-card">
        <div className="pd-period-item">
          <div className="pd-period-label">Pay Period Start</div>
          <div className="pd-period-value">{fmtDate(period && period.start_date)}</div>
        </div>
        <div className="pd-period-divider"></div>
        <div className="pd-period-item">
          <div className="pd-period-label">Pay Period End</div>
          <div className="pd-period-value">{fmtDate(period && period.end_date)}</div>
        </div>
        <div className="pd-period-divider"></div>
        <div className="pd-period-item">
          <div className="pd-period-label">Pay Date</div>
          <div className="pd-period-value pd-period-value-highlight">
            {fmtDate(period && period.pay_date)}
          </div>
        </div>
        <div className="pd-period-divider"></div>
        <div className="pd-period-item">
          <div className="pd-period-label">Status</div>
          <div className="pd-period-value">
            <span className={'pd-status-pill pd-status-' + (paycheck.status || 'draft')}>
              {(paycheck.status || 'draft').toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* 4-up Summary */}
      <div className="pd-summary-row">
        <div className="pd-summary-card pd-summary-gross">
          <div className="pd-summary-label">Gross Pay</div>
          <div className="pd-summary-value">{fmtMoney(paycheck.gross_pay)}</div>
        </div>
        <div className="pd-summary-card pd-summary-tips">
          <div className="pd-summary-label">Tips</div>
          <div className="pd-summary-value">{fmtMoney(paycheck.tips)}</div>
        </div>
        <div className="pd-summary-card pd-summary-taxes">
          <div className="pd-summary-label">Total Taxes</div>
          <div className="pd-summary-value">{fmtMoney(taxTotal)}</div>
        </div>
        <div className="pd-summary-card pd-summary-net">
          <div className="pd-summary-label">Net Pay</div>
          <div className="pd-summary-value">{fmtMoney(paycheck.net_pay)}</div>
        </div>
      </div>

      {/* Work Details Card */}
      <div className="pd-section-card">
        <div className="pd-section-header">
          <span className="pd-section-icon">⏱️</span>
          <h2 className="pd-section-title">Work & Revenue</h2>
        </div>
        <div className="pd-detail-grid">
          <div className="pd-detail-row">
            <div className="pd-detail-label">Hours Worked</div>
            <div className="pd-detail-value">{fmtHours(paycheck.hours_worked)}</div>
          </div>
          <div className="pd-detail-row">
            <div className="pd-detail-label">Service Revenue</div>
            <div className="pd-detail-value">{fmtMoney(paycheck.service_revenue)}</div>
          </div>
          <div className="pd-detail-row">
            <div className="pd-detail-label">Gross Pay (wages + commission)</div>
            <div className="pd-detail-value pd-detail-strong">{fmtMoney(paycheck.gross_pay)}</div>
          </div>
          <div className="pd-detail-row">
            <div className="pd-detail-label">Tips</div>
            <div className="pd-detail-value">{fmtMoney(paycheck.tips)}</div>
          </div>
        </div>
      </div>

      {/* Tax Breakdown Card */}
      <div className="pd-section-card">
        <div className="pd-section-header">
          <span className="pd-section-icon">🧾</span>
          <h2 className="pd-section-title">Tax Breakdown</h2>
          {!isW2 && (
            <span className="pd-section-note">(1099 contractors — no employer withholding)</span>
          )}
        </div>

        {isW2 ? (
          <div className="pd-detail-grid">
            <div className="pd-tax-group-label">Employee Withholding</div>

            <div className="pd-detail-row">
              <div className="pd-detail-label">Federal Income Tax</div>
              <div className="pd-detail-value">{fmtMoney(paycheck.federal_tax)}</div>
            </div>
            <div className="pd-detail-row">
              <div className="pd-detail-label">State Income Tax</div>
              <div className="pd-detail-value">{fmtMoney(paycheck.state_tax)}</div>
            </div>
            <div className="pd-detail-row">
              <div className="pd-detail-label">Social Security (6.2%)</div>
              <div className="pd-detail-value">{fmtMoney(paycheck.social_security_tax)}</div>
            </div>
            <div className="pd-detail-row">
              <div className="pd-detail-label">Medicare (1.45%)</div>
              <div className="pd-detail-value">{fmtMoney(paycheck.medicare_tax)}</div>
            </div>
            <div className="pd-detail-row pd-detail-subtotal">
              <div className="pd-detail-label">Total Employee Withheld</div>
              <div className="pd-detail-value pd-detail-strong">{fmtMoney(taxTotal)}</div>
            </div>

            <div className="pd-tax-group-label pd-tax-group-second">Employer Taxes (paid by shop)</div>

            <div className="pd-detail-row">
              <div className="pd-detail-label">FUTA (federal unemployment)</div>
              <div className="pd-detail-value">{fmtMoney(paycheck.employer_futa)}</div>
            </div>
            <div className="pd-detail-row">
              <div className="pd-detail-label">SUTA (state unemployment)</div>
              <div className="pd-detail-value">{fmtMoney(paycheck.employer_suta)}</div>
            </div>
          </div>
        ) : (
          <div className="pd-1099-note">
            This staff member is a 1099 contractor. No taxes are withheld from their paycheck —
            they are responsible for their own self-employment taxes. Year-end 1099-NEC
            forms will be generated from these records.
          </div>
        )}
      </div>

      {/* Deductions Card */}
      <div className="pd-section-card">
        <div className="pd-section-header">
          <span className="pd-section-icon">💰</span>
          <h2 className="pd-section-title">Deductions & Benefits</h2>
          {deductions.length === 0 && (
            <span className="pd-section-note">(none applied to this paycheck)</span>
          )}
        </div>

        {deductions.length === 0 ? (
          <div className="pd-1099-note">
            No deductions were applied to this paycheck. Deductions (like health
            insurance, 401(k), or garnishments) are configured per-staff in
            Staff → Deductions and automatically applied when payroll runs.
          </div>
        ) : (
          <div className="pd-detail-grid">
            {/* Pre-tax group */}
            {preTaxDeductions.length > 0 && (
              <>
                <div className="pd-tax-group-label">Pre-Tax Deductions (reduces taxable pay)</div>
                {preTaxDeductions.map(function (d) {
                  return (
                    <div className="pd-detail-row" key={d.id}>
                      <div className="pd-detail-label">
                        {d.name || 'Deduction'}
                        <span className="pd-ded-tag pd-ded-pre">PRE-TAX</span>
                      </div>
                      <div className="pd-detail-value">−{fmtMoney(d.amount_deducted)}</div>
                    </div>
                  )
                })}
                <div className="pd-detail-row pd-detail-subtotal">
                  <div className="pd-detail-label">Pre-Tax Subtotal</div>
                  <div className="pd-detail-value pd-detail-strong">−{fmtMoney(preTaxTotal)}</div>
                </div>
              </>
            )}

            {/* Post-tax group */}
            {postTaxDeductions.length > 0 && (
              <>
                <div className={'pd-tax-group-label' + (preTaxDeductions.length > 0 ? ' pd-tax-group-second' : '')}>
                  Post-Tax Deductions (after taxes withheld)
                </div>
                {postTaxDeductions.map(function (d) {
                  return (
                    <div className="pd-detail-row" key={d.id}>
                      <div className="pd-detail-label">
                        {d.name || 'Deduction'}
                        <span className="pd-ded-tag pd-ded-post">POST-TAX</span>
                      </div>
                      <div className="pd-detail-value">−{fmtMoney(d.amount_deducted)}</div>
                    </div>
                  )
                })}
                <div className="pd-detail-row pd-detail-subtotal">
                  <div className="pd-detail-label">Post-Tax Subtotal</div>
                  <div className="pd-detail-value pd-detail-strong">−{fmtMoney(postTaxTotal)}</div>
                </div>
              </>
            )}

            {/* Grand total */}
            <div className="pd-detail-row pd-detail-subtotal">
              <div className="pd-detail-label">Total Deductions</div>
              <div className="pd-detail-value pd-detail-strong">−{fmtMoney(deductionTotal)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Net Pay Big Card */}
      <div className="pd-net-card">
        <div className="pd-net-label">Take-Home Pay</div>
        <div className="pd-net-value">{fmtMoney(paycheck.net_pay)}</div>
        <div className="pd-net-sub">
          Gross {fmtMoney(paycheck.gross_pay)} + Tips {fmtMoney(paycheck.tips)}
          {preTaxTotal > 0 && <> − Pre-Tax Ded {fmtMoney(preTaxTotal)}</>}
          {isW2 && <> − Taxes {fmtMoney(taxTotal)}</>}
          {postTaxTotal > 0 && <> − Post-Tax Ded {fmtMoney(postTaxTotal)}</>}
          {' '}= <strong>Net {fmtMoney(paycheck.net_pay)}</strong>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="pd-disclaimer">
        ⚠️ Tax estimates are based on the rates in your PetPro Tax Settings. They are
        <strong> estimates only</strong> — not a substitute for professional payroll service
        or a tax professional. Always verify with your accountant before filing.
      </div>
    </div>
  )
}
