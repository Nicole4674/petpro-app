// =======================================================
// PetPro Payroll Tax Library
// Pure math functions for estimating paycheck taxes
// =======================================================
// DESIGN PHILOSOPHY:
//   - ALL calculations are ESTIMATES, never legal tax amounts.
//   - Every percentage the shop owner sees can be toggled or edited.
//   - 1099 contractors ALWAYS get 0 withholding (they do their own taxes).
//   - When shopSettings.tax_estimates_enabled = FALSE, every estimator
//     returns 0 so paychecks only show gross pay + tips.
//   - FICA rates (SS + Medicare) are set by federal law and NOT editable.
//     If the law ever changes, update the constants at the top of this file.
// =======================================================


// =======================================================
// FEDERAL LAW CONSTANTS (not editable by shop)
// =======================================================
// Social Security: 6.2% on wages up to the annual wage base
// Medicare: 1.45% on all wages (no cap)
// These are employee-side. Employer matches an equal amount.
export var FICA_SS_RATE = 0.062
export var FICA_MEDICARE_RATE = 0.0145
export var FICA_TOTAL_RATE = 0.0765 // 7.65% combined


// =======================================================
// HELPERS
// =======================================================
function round2(n) {
  if (typeof n !== 'number' || isNaN(n)) return 0
  return Math.round(n * 100) / 100
}

function num(v) {
  var n = parseFloat(v)
  return isNaN(n) ? 0 : n
}


// =======================================================
// GROSS PAY CALCULATORS (by pay type)
// =======================================================

// Hourly — includes overtime after 40 hrs if enabled
// NOTE: True OT is per-week, not per-pay-period. For MVP we use
// "hours over 40 in this period" as the trigger. Shops with bi-weekly
// periods should run OT calc per-week if accuracy matters.
export function calculateHourlyGross(hours, hourlyRate, overtimeEnabled, overtimeMultiplier) {
  var h = num(hours)
  var r = num(hourlyRate)
  if (h <= 0 || r <= 0) return 0

  if (!overtimeEnabled || h <= 40) {
    return round2(h * r)
  }
  var multiplier = num(overtimeMultiplier) || 1.5
  var regular = 40 * r
  var ot = (h - 40) * r * multiplier
  return round2(regular + ot)
}

// Commission — % of service revenue produced in this period
export function calculateCommissionGross(serviceRevenue, commissionPercent) {
  var rev = num(serviceRevenue)
  var pct = num(commissionPercent)
  if (rev <= 0 || pct <= 0) return 0
  return round2(rev * (pct / 100))
}

// Salary — annual salary divided by periods-per-year
export function calculateSalaryGross(annualSalary, periodType) {
  var annual = num(annualSalary)
  if (annual <= 0) return 0
  var periodsPerYear = {
    weekly: 52,
    bi_weekly: 26,
    semi_monthly: 24,
    monthly: 12
  }[periodType] || 26
  return round2(annual / periodsPerYear)
}


// =======================================================
// EMPLOYEE WITHHOLDING ESTIMATORS
// =======================================================
// All of these return 0 for 1099 workers.
// All of these return 0 when shopSettings.tax_estimates_enabled is FALSE.
// FICA is the exception — it's still returned when estimates are ON even
// though the rate is fixed, because it's still an estimate of what will
// be withheld.

// Social Security (employee side) — 6.2%
export function calculateSocialSecurity(gross, workerType, shopSettings) {
  if (!shopSettings || !shopSettings.tax_estimates_enabled) return 0
  if (workerType !== 'w2') return 0
  return round2(num(gross) * FICA_SS_RATE)
}

// Medicare (employee side) — 1.45%
export function calculateMedicare(gross, workerType, shopSettings) {
  if (!shopSettings || !shopSettings.tax_estimates_enabled) return 0
  if (workerType !== 'w2') return 0
  return round2(num(gross) * FICA_MEDICARE_RATE)
}

// Combined FICA (employee side)
export function calculateFICA(gross, workerType, shopSettings) {
  return round2(
    calculateSocialSecurity(gross, workerType, shopSettings)
    + calculateMedicare(gross, workerType, shopSettings)
  )
}

// Federal tax estimate — uses shop's editable percentage
export function calculateFederalEstimate(gross, shopSettings, workerType) {
  if (!shopSettings || !shopSettings.tax_estimates_enabled) return 0
  if (workerType !== 'w2') return 0
  var pct = num(shopSettings.federal_tax_estimate_percent)
  return round2(num(gross) * (pct / 100))
}

// State tax estimate — uses shop's flat rate
export function calculateStateEstimate(gross, shopSettings, workerType) {
  if (!shopSettings || !shopSettings.tax_estimates_enabled) return 0
  if (workerType !== 'w2') return 0
  if (shopSettings.has_state_income_tax === false) return 0
  var pct = num(shopSettings.state_tax_rate)
  return round2(num(gross) * (pct / 100))
}


// =======================================================
// EMPLOYER-SIDE TAXES (for accounting, not withheld from paycheck)
// =======================================================
// These show up on employer tax reports (Form 941, 940) but are paid
// BY the shop, not deducted from the worker's paycheck.

export function calculateEmployerSSMatch(gross, workerType, shopSettings) {
  if (!shopSettings || !shopSettings.tax_estimates_enabled) return 0
  if (workerType !== 'w2') return 0
  return round2(num(gross) * FICA_SS_RATE)
}

export function calculateEmployerMedicareMatch(gross, workerType, shopSettings) {
  if (!shopSettings || !shopSettings.tax_estimates_enabled) return 0
  if (workerType !== 'w2') return 0
  return round2(num(gross) * FICA_MEDICARE_RATE)
}

// FUTA (federal unemployment) — only on wages under the federal wage base per year
export function calculateFUTA(gross, shopSettings, workerType, ytdWages) {
  if (!shopSettings || !shopSettings.tax_estimates_enabled) return 0
  if (workerType !== 'w2') return 0
  var rate = num(shopSettings.futa_rate)
  var wageBase = num(shopSettings.futa_wage_base) || 7000
  var ytd = num(ytdWages)
  var remaining = Math.max(0, wageBase - ytd)
  var taxable = Math.min(num(gross), remaining)
  return round2(taxable * rate)
}

// SUTA (state unemployment) — only on wages under the state wage base per year
export function calculateSUTA(gross, shopSettings, workerType, ytdWages) {
  if (!shopSettings || !shopSettings.tax_estimates_enabled) return 0
  if (workerType !== 'w2') return 0
  var rate = num(shopSettings.suta_rate)
  var wageBase = num(shopSettings.suta_wage_base) || 9000
  var ytd = num(ytdWages)
  var remaining = Math.max(0, wageBase - ytd)
  var taxable = Math.min(num(gross), remaining)
  return round2(taxable * rate)
}


// =======================================================
// DEDUCTIONS APPLIER
// =======================================================
// Given an array of staff_deductions rule rows and this check's gross pay,
// figures out how much comes out of this check for each rule, splits into
// pre-tax vs post-tax buckets, and honors caps (clips at remaining, or skips
// entirely if already at cap).
//
// INPUT:
//   deductionRules: array of staff_deductions rows. Expected fields:
//     - is_active (bool)
//     - amount_type ('flat' | 'percent')
//     - amount (numeric — $ per check if flat, % of gross if percent)
//     - cap_amount (numeric or null — total cap; once hit, rule auto-stops)
//     - amount_paid_to_date (numeric — running total applied so far)
//     - tax_treatment ('pre_tax' | 'post_tax')
//   gross: number — gross pay for this check (needed for percent calc)
//
// OUTPUT:
//   {
//     preTaxTotal: number,
//     postTaxTotal: number,
//     appliedDeductions: [{ rule, amount_deducted }, ...]
//   }
//
// Paused rules (is_active=false) are skipped. Rules already at cap are
// skipped. Rules near cap are clipped to the remaining amount.

export function applyDeductions(deductionRules, gross) {
  var result = {
    preTaxTotal: 0,
    postTaxTotal: 0,
    appliedDeductions: []
  }

  if (!deductionRules || deductionRules.length === 0) return result

  var g = num(gross)

  deductionRules.forEach(function (rule) {
    // Skip paused rules
    if (!rule || rule.is_active === false) return

    // Cap check — if already at or past cap, skip entirely
    var paidToDate = num(rule.amount_paid_to_date)
    var hasCap = rule.cap_amount != null && num(rule.cap_amount) > 0
    var capAmount = hasCap ? num(rule.cap_amount) : 0
    if (hasCap && paidToDate >= capAmount) return

    // Calculate this check's amount
    var thisAmount = 0
    if (rule.amount_type === 'flat') {
      thisAmount = num(rule.amount)
    } else if (rule.amount_type === 'percent') {
      thisAmount = round2(g * (num(rule.amount) / 100))
    }
    if (thisAmount <= 0) return

    // Clip to remaining cap if needed
    if (hasCap) {
      var remaining = round2(capAmount - paidToDate)
      if (thisAmount > remaining) thisAmount = remaining
    }
    if (thisAmount <= 0) return

    // Bucket into pre-tax or post-tax, and record the line
    if (rule.tax_treatment === 'pre_tax') {
      result.preTaxTotal = round2(result.preTaxTotal + thisAmount)
    } else {
      result.postTaxTotal = round2(result.postTaxTotal + thisAmount)
    }
    result.appliedDeductions.push({
      rule: rule,
      amount_deducted: thisAmount
    })
  })

  return result
}


// =======================================================
// COMPOSITE PAYCHECK CALCULATOR
// =======================================================
// Takes a staff member row, period activity data, shop tax settings, and
// the staff member's active deduction rules. Returns a complete paycheck
// object ready to insert into the paychecks table.
//
// staff:          a row from staff_members (with pay_type, hourly_rate, etc.)
// periodData:     { hoursWorked, serviceRevenue, tipsAmount, ytdWages }
// shopSettings:   a row from shop_tax_settings (can be null for shops that haven't set up)
// deductionRules: array of staff_deductions rows for this staff (optional — defaults to none)

export function calculatePaycheck(staff, periodData, shopSettings, deductionRules) {
  if (!staff) return null
  if (!periodData) periodData = {}

  var workerType = staff.worker_type || 'w2'

  // --- 1. Gross pay by pay type ---
  var gross = 0
  if (staff.pay_type === 'hourly') {
    gross = calculateHourlyGross(
      periodData.hoursWorked,
      staff.hourly_rate,
      staff.overtime_enabled !== false,
      staff.overtime_rate_multiplier
    )
  } else if (staff.pay_type === 'commission') {
    gross = calculateCommissionGross(periodData.serviceRevenue, staff.commission_percent)
  } else if (staff.pay_type === 'hourly_commission') {
    var hourlyPart = calculateHourlyGross(
      periodData.hoursWorked,
      staff.hourly_rate,
      staff.overtime_enabled !== false,
      staff.overtime_rate_multiplier
    )
    var commissionPart = calculateCommissionGross(periodData.serviceRevenue, staff.commission_percent)
    gross = round2(hourlyPart + commissionPart)
  } else if (staff.pay_type === 'salary') {
    gross = calculateSalaryGross(staff.salary_amount, staff.pay_period_type)
  }

  // --- 2. Tips (apply split % if applicable) ---
  var tipsRaw = num(periodData.tipsAmount)
  var tipsPct = num(staff.tips_percent)
  var tips = tipsPct > 0 && tipsPct !== 100
    ? round2(tipsRaw * (tipsPct / 100))
    : round2(tipsRaw)

  // --- 3. Apply deductions ---
  // Pre-tax reduces taxable income (health, 401k). Post-tax comes off the net AFTER taxes.
  var deductionResult = applyDeductions(deductionRules, gross)
  var preTaxDeductions = deductionResult.preTaxTotal
  var postTaxDeductions = deductionResult.postTaxTotal

  // --- 4. Taxable income = (gross + tips) minus pre-tax deductions ---
  // (Tips are taxable for W-2. Pre-tax deductions shrink what gets taxed.)
  var taxableIncome = round2(gross + tips - preTaxDeductions)
  if (taxableIncome < 0) taxableIncome = 0

  // --- 5. Employee withholdings (calculated on the reduced taxable income) ---
  var socialSecurity = calculateSocialSecurity(taxableIncome, workerType, shopSettings)
  var medicare = calculateMedicare(taxableIncome, workerType, shopSettings)
  var federalTax = calculateFederalEstimate(taxableIncome, shopSettings, workerType)
  var stateTax = calculateStateEstimate(taxableIncome, shopSettings, workerType)

  var totalWithholdings = round2(socialSecurity + medicare + federalTax + stateTax)

  // --- 6. Net pay = taxable income - taxes - post-tax deductions ---
  var netPay = round2(taxableIncome - totalWithholdings - postTaxDeductions)
  if (netPay < 0) netPay = 0

  // --- 7. Employer-side (for reporting only, not deducted from pay) ---
  var ytdWages = num(periodData.ytdWages)
  var employerSSMatch = calculateEmployerSSMatch(taxableIncome, workerType, shopSettings)
  var employerMedicareMatch = calculateEmployerMedicareMatch(taxableIncome, workerType, shopSettings)
  var employerFUTA = calculateFUTA(taxableIncome, shopSettings, workerType, ytdWages)
  var employerSUTA = calculateSUTA(taxableIncome, shopSettings, workerType, ytdWages)

  // --- 8. Return paycheck object (maps 1:1 to paychecks table columns) ---
  return {
    // Worker snapshot
    worker_type_snapshot: workerType,

    // Pay settings snapshot (frozen on the paycheck so future edits to staff
    // pay settings don't alter this historical record).
    rate_type: staff.pay_type || 'hourly',
    hourly_rate: num(staff.hourly_rate),
    commission_percent: num(staff.commission_percent),
    salary_amount: num(staff.salary_amount),

    // Income
    gross_pay: gross,
    tips: tips,
    taxable_income: taxableIncome,

    // Employee withholdings (what gets taken out)
    social_security_tax: socialSecurity,
    medicare_tax: medicare,
    federal_tax: federalTax,
    state_tax: stateTax,
    additional_medicare_tax: 0,                         // Phase 3B — high-income threshold
    pre_tax_deductions_total: preTaxDeductions,         // 401k / health / HSA
    post_tax_deductions_total: postTaxDeductions,       // Roth / loans / garnishments / uniforms

    // What the worker actually gets paid
    net_pay: netPay,

    // Employer-side (appears on shop's tax reports, not worker's check)
    employer_ss_match: employerSSMatch,
    employer_medicare_match: employerMedicareMatch,
    employer_futa: employerFUTA,
    employer_suta: employerSUTA
  }
}


// =======================================================
// BATCH CALCULATOR — calculate paychecks for multiple staff at once
// =======================================================
// staffList:           array of staff_members rows
// periodActivity:      object keyed by staff_id → { hoursWorked, serviceRevenue, tipsAmount, ytdWages }
// shopSettings:        shop_tax_settings row
// deductionsByStaffId: object keyed by staff_id → array of active staff_deductions rules (optional)
//
// Returns: array of { staffId, staff, paycheck, appliedDeductions } objects
//   appliedDeductions = [{ rule, amount_deducted }, ...]  — what actually got taken out this check

export function calculatePaychecksForPeriod(staffList, periodActivity, shopSettings, deductionsByStaffId) {
  if (!staffList || staffList.length === 0) return []
  var results = []
  staffList.forEach(function(s) {
    var activity = (periodActivity && periodActivity[s.id]) || {
      hoursWorked: 0,
      serviceRevenue: 0,
      tipsAmount: 0,
      ytdWages: 0
    }
    var deductionRules = (deductionsByStaffId && deductionsByStaffId[s.id]) || []
    var paycheck = calculatePaycheck(s, activity, shopSettings, deductionRules)
    if (paycheck) {
      // applyDeductions is pure and idempotent — re-run to get the detailed
      // line items for the Review screen and the paycheck_deductions snapshots.
      var deductionDetail = applyDeductions(deductionRules, paycheck.gross_pay)
      results.push({
        staffId: s.id,
        staff: s,
        paycheck: paycheck,
        appliedDeductions: deductionDetail.appliedDeductions
      })
    }
  })
  return results
}


// =======================================================
// BONUS: TAX SAVINGS ESTIMATOR (for 1099 solo groomers)
// =======================================================
// Even though 1099 workers don't have taxes withheld, they still owe
// taxes at year-end. This helper shows "what you should be saving"
// based on the shop's federal % — useful for solo groomers planning
// for tax season. Does NOT actually deduct from the paycheck.

export function estimateTaxSavingsFor1099(gross, tips, shopSettings) {
  if (!shopSettings || !shopSettings.tax_estimates_enabled) return 0
  var totalIncome = round2(num(gross) + num(tips))
  var federalPct = num(shopSettings.federal_tax_estimate_percent)
  var statePct = shopSettings.has_state_income_tax === false ? 0 : num(shopSettings.state_tax_rate)
  // Self-employment tax is roughly 15.3% (both halves of FICA combined)
  var seTaxEstimate = round2(totalIncome * 0.153)
  var federalEstimate = round2(totalIncome * (federalPct / 100))
  var stateEstimate = round2(totalIncome * (statePct / 100))
  return round2(seTaxEstimate + federalEstimate + stateEstimate)
}
