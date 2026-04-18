// =======================================================
// StaffDeductions component
// =======================================================
// Renders the Deductions section on Staff Detail -> Pay tab.
// Handles list + add + edit + pause/resume + delete, and shows
// a cap progress bar when a total cap is set (for loan repayments).
//
// Props:
//   staffId    - UUID of the staff_members row
//   groomerId  - UUID of the owner (auth.uid())  [used for RLS + insert]
//
// Tables touched:
//   staff_deductions  (rules)
//   paycheck_deductions is read-only from here — it's written by RunPayroll.
// =======================================================

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// 10 deduction types. `defaultTax` is a smart default that auto-fills
// when the user picks a type — they can override it on the form.
var DEDUCTION_TYPES = [
  { value: 'health_insurance',      label: 'Health Insurance',           defaultTax: 'pre_tax',  icon: '🏥' },
  { value: 'dental_insurance',      label: 'Dental Insurance',           defaultTax: 'pre_tax',  icon: '🦷' },
  { value: 'vision_insurance',      label: 'Vision Insurance',           defaultTax: 'pre_tax',  icon: '👓' },
  { value: 'retirement_401k',       label: '401(k) Retirement',          defaultTax: 'pre_tax',  icon: '🏦' },
  { value: 'retirement_roth_401k',  label: 'Roth 401(k)',                defaultTax: 'post_tax', icon: '🏦' },
  { value: 'hsa_fsa',               label: 'HSA / FSA',                  defaultTax: 'pre_tax',  icon: '💊' },
  { value: 'garnishment',           label: 'Child Support / Garnishment',defaultTax: 'post_tax', icon: '⚖️' },
  { value: 'uniform_tool',          label: 'Uniform / Tool',             defaultTax: 'post_tax', icon: '👕' },
  { value: 'loan_advance',          label: 'Loan / Advance',             defaultTax: 'post_tax', icon: '💵' },
  { value: 'other',                 label: 'Other',                      defaultTax: 'post_tax', icon: '📋' },
]

function getEmptyForm() {
  return {
    name: '',
    deduction_type: 'health_insurance',
    tax_treatment: 'pre_tax',
    amount_type: 'flat',
    amount: '',
    cap_amount: '',
    notes: '',
  }
}

export default function StaffDeductions({ staffId, groomerId }) {
  var [deductions, setDeductions] = useState([])
  var [loading, setLoading] = useState(true)
  var [showForm, setShowForm] = useState(false)
  var [editingId, setEditingId] = useState(null)
  var [formData, setFormData] = useState(getEmptyForm())
  var [saving, setSaving] = useState(false)
  var [error, setError] = useState(null)

  useEffect(function () {
    if (staffId) loadDeductions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId])

  // ---------------------------------------------------
  // Data loading
  // ---------------------------------------------------
  async function loadDeductions() {
    setLoading(true)
    var result = await supabase
      .from('staff_deductions')
      .select('*')
      .eq('staff_id', staffId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true })

    if (result.error) {
      console.error('loadDeductions:', result.error)
      setError(result.error.message)
    } else {
      setDeductions(result.data || [])
      setError(null)
    }
    setLoading(false)
  }

  // ---------------------------------------------------
  // Form open / close
  // ---------------------------------------------------
  function handleAddClick() {
    setFormData(getEmptyForm())
    setEditingId(null)
    setError(null)
    setShowForm(true)
  }

  function handleEditClick(d) {
    setFormData({
      name: d.name || '',
      deduction_type: d.deduction_type || 'health_insurance',
      tax_treatment: d.tax_treatment || 'pre_tax',
      amount_type: d.amount_type || 'flat',
      amount: d.amount != null ? String(d.amount) : '',
      cap_amount: d.cap_amount != null ? String(d.cap_amount) : '',
      notes: d.notes || '',
    })
    setEditingId(d.id)
    setError(null)
    setShowForm(true)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setFormData(getEmptyForm())
    setError(null)
  }

  // When user picks a new deduction type, smart-default the tax treatment.
  function handleTypeChange(newType) {
    var typeInfo = DEDUCTION_TYPES.find(function (t) { return t.value === newType })
    setFormData(Object.assign({}, formData, {
      deduction_type: newType,
      tax_treatment: typeInfo ? typeInfo.defaultTax : formData.tax_treatment,
    }))
  }

  // ---------------------------------------------------
  // Save (insert or update)
  // ---------------------------------------------------
  async function handleSave(e) {
    e.preventDefault()
    setError(null)

    if (!formData.name.trim()) {
      setError('Please enter a name for this deduction.')
      return
    }
    var amt = parseFloat(formData.amount)
    if (isNaN(amt) || amt <= 0) {
      setError('Amount must be a positive number.')
      return
    }
    if (formData.amount_type === 'percent' && amt > 100) {
      setError('Percent cannot be greater than 100.')
      return
    }
    var capNum = null
    if (formData.cap_amount !== '' && formData.cap_amount != null) {
      capNum = parseFloat(formData.cap_amount)
      if (isNaN(capNum) || capNum <= 0) {
        setError('Cap must be a positive number, or leave it blank for no cap.')
        return
      }
    }

    setSaving(true)

    var payload = {
      staff_id: staffId,
      groomer_id: groomerId,
      name: formData.name.trim(),
      deduction_type: formData.deduction_type,
      tax_treatment: formData.tax_treatment,
      amount_type: formData.amount_type,
      amount: amt,
      cap_amount: capNum,
      notes: formData.notes ? formData.notes.trim() : null,
      updated_at: new Date().toISOString(),
    }

    var result
    if (editingId) {
      result = await supabase
        .from('staff_deductions')
        .update(payload)
        .eq('id', editingId)
    } else {
      payload.amount_paid_to_date = 0
      payload.is_active = true
      result = await supabase
        .from('staff_deductions')
        .insert(payload)
    }

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    await loadDeductions()
    handleCancel()
  }

  // ---------------------------------------------------
  // Pause / Resume
  // ---------------------------------------------------
  async function handleToggleActive(d) {
    var result = await supabase
      .from('staff_deductions')
      .update({ is_active: !d.is_active, updated_at: new Date().toISOString() })
      .eq('id', d.id)
    if (result.error) {
      alert('Could not change deduction status: ' + result.error.message)
      return
    }
    loadDeductions()
  }

  // ---------------------------------------------------
  // Delete (past paycheck history kept via ON DELETE SET NULL)
  // ---------------------------------------------------
  async function handleDelete(d) {
    var ok = window.confirm(
      'Delete "' + d.name + '"?\n\n' +
      'Past paycheck history for this deduction will be preserved. ' +
      'This only stops it from being applied on future paychecks.'
    )
    if (!ok) return

    var result = await supabase
      .from('staff_deductions')
      .delete()
      .eq('id', d.id)
    if (result.error) {
      alert('Could not delete: ' + result.error.message)
      return
    }
    loadDeductions()
  }

  // ---------------------------------------------------
  // Helpers
  // ---------------------------------------------------
  function typeLabel(value) {
    var t = DEDUCTION_TYPES.find(function (x) { return x.value === value })
    return t ? (t.icon + ' ' + t.label) : value
  }

  function fmtMoney(n) {
    return '$' + Number(n || 0).toFixed(2)
  }

  function fmtAmount(d) {
    if (d.amount_type === 'percent') return Number(d.amount).toFixed(2) + '% of gross'
    return fmtMoney(d.amount) + ' / check'
  }

  // ---------------------------------------------------
  // Render
  // ---------------------------------------------------
  if (loading) {
    return (
      <div className="sd-profile-section sdd-section">
        <h3 className="sd-section-title">💸 Deductions</h3>
        <div className="sdd-loading">Loading deductions…</div>
      </div>
    )
  }

  return (
    <div className="sd-profile-section sdd-section">
      <div className="sd-section-header">
        <h3 className="sd-section-title">💸 Deductions</h3>
        {!showForm && (
          <button className="sdd-add-btn" onClick={handleAddClick}>
            ➕ Add Deduction
          </button>
        )}
      </div>

      <p className="sdd-helper">
        Recurring deductions from this staff member's paycheck. <strong>Pre-tax</strong>{' '}
        deductions reduce taxable income (health insurance, 401(k)). <strong>Post-tax</strong>{' '}
        deductions come out after taxes (Roth 401(k), loans, garnishments). Set a total cap
        for loans or advances and they auto-stop when paid off.
      </p>

      {/* ---------- FORM ---------- */}
      {showForm && (
        <form className="sdd-form" onSubmit={handleSave}>
          <h4 className="sdd-form-title">
            {editingId ? '✏️ Edit Deduction' : '➕ New Deduction'}
          </h4>

          {error && <div className="sdd-error">⚠️ {error}</div>}

          <div className="sl-form-group">
            <label className="sl-label">Name</label>
            <input
              type="text"
              className="sl-input"
              placeholder="e.g. Blue Cross Health Insurance, Clipper loan repay"
              value={formData.name}
              onChange={function (e) {
                setFormData(Object.assign({}, formData, { name: e.target.value }))
              }}
              required
            />
          </div>

          <div className="sl-form-group">
            <label className="sl-label">Type</label>
            <select
              className="sl-input"
              value={formData.deduction_type}
              onChange={function (e) { handleTypeChange(e.target.value) }}
            >
              {DEDUCTION_TYPES.map(function (t) {
                return (
                  <option key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="sdd-form-row">
            <div className="sl-form-group">
              <label className="sl-label">Tax Treatment</label>
              <select
                className="sl-input"
                value={formData.tax_treatment}
                onChange={function (e) {
                  setFormData(Object.assign({}, formData, { tax_treatment: e.target.value }))
                }}
              >
                <option value="pre_tax">Pre-tax (reduces taxable income)</option>
                <option value="post_tax">Post-tax (after taxes)</option>
              </select>
            </div>

            <div className="sl-form-group">
              <label className="sl-label">Amount Type</label>
              <select
                className="sl-input"
                value={formData.amount_type}
                onChange={function (e) {
                  setFormData(Object.assign({}, formData, { amount_type: e.target.value }))
                }}
              >
                <option value="flat">Flat $ per check</option>
                <option value="percent">% of gross pay</option>
              </select>
            </div>
          </div>

          <div className="sdd-form-row">
            <div className="sl-form-group">
              <label className="sl-label">
                {formData.amount_type === 'percent' ? 'Percent (%)' : 'Amount per check ($)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="sl-input"
                placeholder={formData.amount_type === 'percent' ? '5.00' : '50.00'}
                value={formData.amount}
                onChange={function (e) {
                  setFormData(Object.assign({}, formData, { amount: e.target.value }))
                }}
                required
              />
            </div>

            <div className="sl-form-group">
              <label className="sl-label">
                Total Cap ($) <span className="sdd-optional">— optional, leave blank for no cap</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="sl-input"
                placeholder="e.g. 200 for a $200 loan"
                value={formData.cap_amount}
                onChange={function (e) {
                  setFormData(Object.assign({}, formData, { cap_amount: e.target.value }))
                }}
              />
            </div>
          </div>

          <div className="sl-form-group">
            <label className="sl-label">
              Notes <span className="sdd-optional">— optional</span>
            </label>
            <textarea
              className="sl-input"
              rows="2"
              placeholder="e.g. For new Andis AGC clippers, loaned Apr 17"
              value={formData.notes}
              onChange={function (e) {
                setFormData(Object.assign({}, formData, { notes: e.target.value }))
              }}
            />
          </div>

          <div className="sdd-form-actions">
            <button
              type="button"
              className="sl-cancel-btn"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="sdd-add-btn" disabled={saving}>
              {saving
                ? '🐾 Saving…'
                : (editingId ? '✅ Update Deduction' : '✅ Add Deduction')}
            </button>
          </div>
        </form>
      )}

      {/* ---------- EMPTY STATE ---------- */}
      {deductions.length === 0 && !showForm && (
        <div className="sdd-empty">
          <div className="sdd-empty-icon">💸</div>
          <div className="sdd-empty-title">No deductions set up yet</div>
          <div className="sdd-empty-text">
            Click "➕ Add Deduction" to set up recurring paycheck deductions —
            health insurance, 401(k), garnishments, loan repayments, uniforms, etc.
          </div>
        </div>
      )}

      {/* ---------- LIST ---------- */}
      {deductions.length > 0 && (
        <div className="sdd-list">
          {deductions.map(function (d) {
            var hasCap = d.cap_amount != null && Number(d.cap_amount) > 0
            var paidToDate = Number(d.amount_paid_to_date || 0)
            var capAmount = hasCap ? Number(d.cap_amount) : 0
            var capPercent = hasCap && capAmount > 0
              ? Math.min(100, (paidToDate / capAmount) * 100)
              : 0
            var isCapReached = hasCap && paidToDate >= capAmount

            return (
              <div
                key={d.id}
                className={'sdd-card' + (d.is_active ? '' : ' sdd-card-paused')}
              >
                <div className="sdd-card-header">
                  <div className="sdd-card-title-wrap">
                    <h4 className="sdd-card-name">{d.name}</h4>
                    <p className="sdd-card-type">{typeLabel(d.deduction_type)}</p>
                  </div>
                </div>
                <div className="sdd-tags">
                  <span
                    className={
                      'sdd-tag ' +
                      (d.tax_treatment === 'pre_tax' ? 'sdd-tag-pretax' : 'sdd-tag-posttax')
                    }
                  >
                    {d.tax_treatment === 'pre_tax' ? 'Pre-tax' : 'Post-tax'}
                  </span>
                  <span className="sdd-tag sdd-tag-amount">{fmtAmount(d)}</span>
                  {!d.is_active && <span className="sdd-tag sdd-tag-paused">Paused</span>}
                  {isCapReached && <span className="sdd-tag sdd-tag-cap-reached">Cap reached</span>}
                </div>

                {hasCap && (
                  <div className="sdd-cap-wrap">
                    <div className="sdd-cap-label">
                      <span>
                        Cap: <strong>{fmtMoney(paidToDate)}</strong> of <strong>{fmtMoney(capAmount)}</strong>
                      </span>
                      <strong>{capPercent.toFixed(0)}%</strong>
                    </div>
                    <div className="sdd-cap-bar">
                      <div
                        className={
                          'sdd-cap-fill' +
                          (isCapReached ? ' sdd-cap-fill-done' : '')
                        }
                        style={{ width: capPercent + '%' }}
                      />
                    </div>
                  </div>
                )}

                {d.notes && <p className="sdd-notes">📝 {d.notes}</p>}

                <div className="sdd-card-actions">
                  <button
                    className="sdd-icon-btn"
                    onClick={function () { handleToggleActive(d) }}
                  >
                    {d.is_active ? '⏸️ Pause' : '▶️ Resume'}
                  </button>
                  <button
                    className="sdd-icon-btn"
                    onClick={function () { handleEditClick(d) }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className="sdd-icon-btn sdd-icon-btn-danger"
                    onClick={function () { handleDelete(d) }}
                  >
                    🗑️ Delete
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
