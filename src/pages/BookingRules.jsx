// =======================================================
// PetPro — AI Booking Rules Page
// Configure hard-enforcement rules for AI + client-portal bookings.
// Rules are stored in shop_settings.booking_rules (JSONB).
// Rules currently supported:
//   1) Weight limit        (approval only)
//   2) Breed blocks        (approval OR block)
//   3) First-time client   (approval only)
//   4) Vaccinations        (approval only)
//   6) Aggression flag     (approval OR block)
//   7) Same-day cutoff     (approval OR block)
//   9) Daily pet cap       (block only — shop-wide and/or per-groomer)
// =======================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function BookingRules() {
  var navigate = useNavigate()

  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [saved, setSaved] = useState(false)
  var [error, setError] = useState('')

  // ---- Rule 1: Weight limit ----
  var [weightEnabled, setWeightEnabled] = useState(false)
  var [weightMaxLbs, setWeightMaxLbs] = useState(100)
  var [weightMsg, setWeightMsg] = useState('')

  // ---- Rule 2: Breed blocks ----
  var [breedEnabled, setBreedEnabled] = useState(false)
  var [breedList, setBreedList] = useState('') // newline-separated
  var [breedMode, setBreedMode] = useState('approval') // 'approval' | 'block'
  var [breedMsg, setBreedMsg] = useState('')

  // ---- Rule 3: First-time client approval ----
  var [firstTimeEnabled, setFirstTimeEnabled] = useState(false)
  var [firstTimeMsg, setFirstTimeMsg] = useState('')

  // ---- Rule 4: Vaccinations required (approval only) ----
  var [vaxEnabled, setVaxEnabled] = useState(false)
  var [vaxMsg, setVaxMsg] = useState('')

  // ---- Rule 6: Aggression flag (approval OR block) ----
  var [aggEnabled, setAggEnabled] = useState(false)
  var [aggMode, setAggMode] = useState('approval') // 'approval' | 'block'
  var [aggMsg, setAggMsg] = useState('')

  // ---- Rule 7: Same-day cutoff ----
  var [cutoffEnabled, setCutoffEnabled] = useState(false)
  var [cutoffMode, setCutoffMode] = useState('approval') // 'approval' | 'block'
  var [cutoffHour, setCutoffHour] = useState(12) // 0-23; 12 = noon
  var [cutoffLeadHours, setCutoffLeadHours] = useState(2) // hours ahead
  var [cutoffMsg, setCutoffMsg] = useState('')

  // ---- Rule 9: Daily pet cap ----
  var [capEnabled, setCapEnabled] = useState(false)
  var [capShopWide, setCapShopWide] = useState('') // number or blank
  var [capStaffMap, setCapStaffMap] = useState({}) // { staff_id: number }
  var [capMsg, setCapMsg] = useState('')
  var [staffList, setStaffList] = useState([]) // loaded from staff table

  // ---------- Load ----------
  useEffect(function () {
    async function load() {
      try {
        var { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/login'); return }

        var { data, error: e } = await supabase
          .from('shop_settings')
          .select('booking_rules')
          .eq('groomer_id', user.id)
          .maybeSingle()

        if (e) throw e

        var rules = (data && data.booking_rules) || {}

        if (rules.weight_limit) {
          setWeightEnabled(!!rules.weight_limit.enabled)
          setWeightMaxLbs(rules.weight_limit.max_lbs || 100)
          setWeightMsg(rules.weight_limit.decline_message || '')
        }
        if (rules.breed_blocks) {
          setBreedEnabled(!!rules.breed_blocks.enabled)
          setBreedList((rules.breed_blocks.breeds || []).join('\n'))
          setBreedMode(rules.breed_blocks.mode || 'approval')
          setBreedMsg(rules.breed_blocks.decline_message || '')
        }
        if (rules.first_time_approval) {
          setFirstTimeEnabled(!!rules.first_time_approval.enabled)
          setFirstTimeMsg(rules.first_time_approval.decline_message || '')
        }
        if (rules.vaccinations_required) {
          setVaxEnabled(!!rules.vaccinations_required.enabled)
          setVaxMsg(rules.vaccinations_required.decline_message || '')
        }
        if (rules.aggression_flag) {
          setAggEnabled(!!rules.aggression_flag.enabled)
          setAggMode(rules.aggression_flag.mode || 'approval')
          setAggMsg(rules.aggression_flag.decline_message || '')
        }
        if (rules.same_day_cutoff) {
          setCutoffEnabled(!!rules.same_day_cutoff.enabled)
          setCutoffMode(rules.same_day_cutoff.mode || 'approval')
          setCutoffHour(typeof rules.same_day_cutoff.cutoff_hour === 'number' ? rules.same_day_cutoff.cutoff_hour : 12)
          setCutoffLeadHours(typeof rules.same_day_cutoff.lead_hours === 'number' ? rules.same_day_cutoff.lead_hours : 2)
          setCutoffMsg(rules.same_day_cutoff.decline_message || '')
        }
        if (rules.daily_cap) {
          setCapEnabled(!!rules.daily_cap.enabled)
          setCapShopWide(rules.daily_cap.shop_wide_max != null ? String(rules.daily_cap.shop_wide_max) : '')
          setCapStaffMap(rules.daily_cap.staff_caps || {})
          setCapMsg(rules.daily_cap.decline_message || '')
        }

        // Load staff list for Rule 9 per-staff caps
        var { data: staffRows } = await supabase
          .from('staff_members')
          .select('id, first_name, last_name, status')
          .eq('groomer_id', user.id)
          .eq('status', 'active')
          .order('first_name', { ascending: true })
        setStaffList(staffRows || [])
      } catch (e) {
        setError('Could not load rules: ' + (e.message || e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ---------- Save ----------
  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      var { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      var breedsArr = breedList
        .split('\n')
        .map(function (s) { return s.trim() })
        .filter(function (s) { return s.length > 0 })

      var newRules = {
        weight_limit: {
          enabled: !!weightEnabled,
          max_lbs: parseInt(weightMaxLbs, 10) || 100,
          decline_message: weightMsg || '',
        },
        breed_blocks: {
          enabled: !!breedEnabled,
          breeds: breedsArr,
          mode: breedMode,
          decline_message: breedMsg || '',
        },
        first_time_approval: {
          enabled: !!firstTimeEnabled,
          decline_message: firstTimeMsg || '',
        },
        vaccinations_required: {
          enabled: !!vaxEnabled,
          decline_message: vaxMsg || '',
        },
        aggression_flag: {
          enabled: !!aggEnabled,
          mode: aggMode,
          decline_message: aggMsg || '',
        },
        same_day_cutoff: {
          enabled: !!cutoffEnabled,
          mode: cutoffMode,
          cutoff_hour: parseInt(cutoffHour, 10),
          lead_hours: parseInt(cutoffLeadHours, 10) || 0,
          decline_message: cutoffMsg || '',
        },
        daily_cap: {
          enabled: !!capEnabled,
          shop_wide_max: capShopWide && capShopWide.trim().length
            ? (parseInt(capShopWide, 10) || null)
            : null,
          staff_caps: (function () {
            // Strip out 0/empty values so we only save real caps
            var cleaned = {}
            for (var sid in capStaffMap) {
              var n = parseInt(capStaffMap[sid], 10)
              if (n && n > 0) cleaned[sid] = n
            }
            return cleaned
          })(),
          decline_message: capMsg || '',
        },
      }

      // Check if row exists, then update or insert
      var { data: existing } = await supabase
        .from('shop_settings')
        .select('id')
        .eq('groomer_id', user.id)
        .maybeSingle()

      if (existing) {
        var { error: updErr } = await supabase
          .from('shop_settings')
          .update({ booking_rules: newRules })
          .eq('groomer_id', user.id)
        if (updErr) throw updErr
      } else {
        var { error: insErr } = await supabase
          .from('shop_settings')
          .insert({ groomer_id: user.id, booking_rules: newRules })
        if (insErr) throw insErr
      }

      setSaved(true)
      setTimeout(function () { setSaved(false) }, 3000)
    } catch (e) {
      setError('Could not save: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  // ---------- Styles ----------
  var pageStyle = {
    maxWidth: '800px',
    margin: '20px auto',
    padding: '0 20px',
  }

  var cardStyle = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
  }

  var cardHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
  }

  var titleStyle = {
    fontSize: '16px',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  }

  var subtitleStyle = {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '4px',
  }

  var toggleStyle = function (on) {
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      background: on ? '#10b981' : '#e5e7eb',
      color: on ? '#fff' : '#6b7280',
      borderRadius: '6px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 600,
      letterSpacing: '0.4px',
    }
  }

  var inputStyle = {
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
  }

  var labelStyle = {
    display: 'block',
    fontSize: '13px',
    color: '#374151',
    fontWeight: 500,
    marginBottom: '6px',
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading rules...</div>
  }

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: '8px' }}>
        <span
          style={{ color: '#6b7280', fontSize: '14px', cursor: 'pointer' }}
          onClick={function () { navigate('/') }}
        >
          ← Dashboard
        </span>
      </div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '6px' }}>
        🛡️ AI Booking Rules
      </h1>
      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
        These rules apply to <strong>AI chat bookings</strong> and <strong>client-portal self-bookings</strong> only.
        Bookings YOU make manually from the calendar are never blocked.
      </p>

      {/* INFO BANNER */}
      <div style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '8px',
        padding: '12px 14px',
        marginBottom: '20px',
        fontSize: '13px',
        color: '#1e40af',
      }}>
        <strong>How this works:</strong> When a rule is broken, the booking is still created on your calendar but tagged
        as "Needs Review" in <em>Flagged Bookings</em>. You approve or decline — on decline, the booking is removed and
        you can message the client directly.
      </div>

      {/* ========= RULE 1: WEIGHT LIMIT ========= */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🐕</span>
              <h3 style={titleStyle}>Weight Limit</h3>
            </div>
            <div style={subtitleStyle}>
              Flag for approval when a dog over a certain weight is booked.
            </div>
          </div>
          <button
            style={toggleStyle(weightEnabled)}
            onClick={function () { setWeightEnabled(!weightEnabled) }}
          >
            {weightEnabled ? '☑ ON' : '☐ OFF'}
          </button>
        </div>
        {weightEnabled && (
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Max weight without approval (lbs)</label>
            <input
              type="number"
              min="1"
              max="500"
              value={weightMaxLbs}
              onChange={function (e) { setWeightMaxLbs(e.target.value) }}
              style={{ ...inputStyle, width: '120px' }}
            />
            <div style={{ ...subtitleStyle, marginTop: '6px' }}>
              Dogs over <strong>{weightMaxLbs} lbs</strong> will need your approval before the booking is confirmed.
            </div>
            <div style={{ marginTop: '14px' }}>
              <label style={labelStyle}>Message client sees when this trips</label>
              <textarea
                value={weightMsg}
                onChange={function (e) { setWeightMsg(e.target.value) }}
                placeholder="Thanks for reaching out! I'll need to run this by the groomer first — she'll text you within 24 hours to confirm."
                style={{ ...inputStyle, width: '100%', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ ...subtitleStyle, marginTop: '4px' }}>
                Leave blank to use the default. Keep it friendly — client reads this in chat.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========= RULE 2: BREED BLOCKS ========= */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🐩</span>
              <h3 style={titleStyle}>Breed Blocks</h3>
            </div>
            <div style={subtitleStyle}>
              Breeds you don't work with — or only take with your approval.
            </div>
          </div>
          <button
            style={toggleStyle(breedEnabled)}
            onClick={function () { setBreedEnabled(!breedEnabled) }}
          >
            {breedEnabled ? '☑ ON' : '☐ OFF'}
          </button>
        </div>
        {breedEnabled && (
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Breed list (one per line)</label>
            <textarea
              value={breedList}
              onChange={function (e) { setBreedList(e.target.value) }}
              placeholder={'Chow\nPit Bull\nDoodle'}
              style={{ ...inputStyle, width: '100%', minHeight: '90px', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ marginTop: '10px' }}>
              <label style={labelStyle}>When one of these breeds tries to book:</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input
                    type="radio"
                    name="breedMode"
                    checked={breedMode === 'approval'}
                    onChange={function () { setBreedMode('approval') }}
                  />
                  Needs my approval (I can still accept)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input
                    type="radio"
                    name="breedMode"
                    checked={breedMode === 'block'}
                    onChange={function () { setBreedMode('block') }}
                  />
                  Fully blocked (AI refuses on the spot)
                </label>
              </div>
            </div>
            <div style={{ marginTop: '14px' }}>
              <label style={labelStyle}>
                Message client sees {breedMode === 'block' ? 'when this breed is refused' : 'when this breed needs approval'}
              </label>
              <textarea
                value={breedMsg}
                onChange={function (e) { setBreedMsg(e.target.value) }}
                placeholder={breedMode === 'block'
                  ? "Unfortunately we don't currently service this breed. Please call the shop if you have any questions."
                  : "Thanks for booking! I'll run this by the groomer and she'll text you within 24 hours to confirm."}
                style={{ ...inputStyle, width: '100%', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ ...subtitleStyle, marginTop: '4px' }}>
                Leave blank to use the default.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========= RULE 3: FIRST-TIME CLIENT APPROVAL ========= */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🕐</span>
              <h3 style={titleStyle}>First-Time Client Approval</h3>
            </div>
            <div style={subtitleStyle}>
              Every new client's first booking goes to Flagged Bookings for your approval before it's confirmed.
            </div>
          </div>
          <button
            style={toggleStyle(firstTimeEnabled)}
            onClick={function () { setFirstTimeEnabled(!firstTimeEnabled) }}
          >
            {firstTimeEnabled ? '☑ ON' : '☐ OFF'}
          </button>
        </div>
        {firstTimeEnabled && (
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Message new client sees when they first book</label>
            <textarea
              value={firstTimeMsg}
              onChange={function (e) { setFirstTimeMsg(e.target.value) }}
              placeholder="Welcome! Since you're new to us, the groomer will review your booking and text you within 24 hours to confirm your appointment."
              style={{ ...inputStyle, width: '100%', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ ...subtitleStyle, marginTop: '4px' }}>
              Leave blank to use the default.
            </div>
          </div>
        )}
      </div>

      {/* ========= RULE 4: VACCINATIONS REQUIRED ========= */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>💉</span>
              <h3 style={titleStyle}>Vaccinations Required</h3>
            </div>
            <div style={subtitleStyle}>
              Flag for approval if the pet's vaccinations are missing or expired.
            </div>
          </div>
          <button
            style={toggleStyle(vaxEnabled)}
            onClick={function () { setVaxEnabled(!vaxEnabled) }}
          >
            {vaxEnabled ? '☑ ON' : '☐ OFF'}
          </button>
        </div>
        {vaxEnabled && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ ...subtitleStyle, marginBottom: '8px' }}>
              Checks the pet's <strong>vaccination expiry date</strong> on their profile. If expired or missing, booking routes to you for approval.
            </div>
            <label style={labelStyle}>Message client sees when vax is missing/expired</label>
            <textarea
              value={vaxMsg}
              onChange={function (e) { setVaxMsg(e.target.value) }}
              placeholder="Quick note — I'll need to double-check vaccination records with the groomer before confirming. She'll text you within 24 hours."
              style={{ ...inputStyle, width: '100%', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ ...subtitleStyle, marginTop: '4px' }}>
              Leave blank to use the default.
            </div>
          </div>
        )}
      </div>

      {/* ========= RULE 6: AGGRESSION FLAG ========= */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <h3 style={titleStyle}>Aggression Flag</h3>
            </div>
            <div style={subtitleStyle}>
              Handle bookings for pets marked as dog-aggressive on their profile.
            </div>
          </div>
          <button
            style={toggleStyle(aggEnabled)}
            onClick={function () { setAggEnabled(!aggEnabled) }}
          >
            {aggEnabled ? '☑ ON' : '☐ OFF'}
          </button>
        </div>
        {aggEnabled && (
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>When an aggressive pet tries to book:</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="radio"
                  name="aggMode"
                  checked={aggMode === 'approval'}
                  onChange={function () { setAggMode('approval') }}
                />
                Needs my approval (I can still accept)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="radio"
                  name="aggMode"
                  checked={aggMode === 'block'}
                  onChange={function () { setAggMode('block') }}
                />
                Fully blocked (AI refuses on the spot)
              </label>
            </div>
            <label style={labelStyle}>
              Message client sees {aggMode === 'block' ? 'when refused' : 'when approval needed'}
            </label>
            <textarea
              value={aggMsg}
              onChange={function (e) { setAggMsg(e.target.value) }}
              placeholder={aggMode === 'block'
                ? "Unfortunately we're not able to take dogs with aggression concerns. Please call the shop if you'd like to discuss."
                : "Thanks for booking! I'll check with the groomer since there's some handling notes on file — she'll text you shortly."}
              style={{ ...inputStyle, width: '100%', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ ...subtitleStyle, marginTop: '4px' }}>
              Leave blank to use the default.
            </div>
          </div>
        )}
      </div>

      {/* ========= RULE 7: SAME-DAY CUTOFF ========= */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>⏰</span>
              <h3 style={titleStyle}>Same-Day Cutoff</h3>
            </div>
            <div style={subtitleStyle}>
              Stop last-minute bookings. Set a cutoff hour and/or a lead time.
            </div>
          </div>
          <button
            style={toggleStyle(cutoffEnabled)}
            onClick={function () { setCutoffEnabled(!cutoffEnabled) }}
          >
            {cutoffEnabled ? '☑ ON' : '☐ OFF'}
          </button>
        </div>
        {cutoffEnabled && (
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>No same-day bookings after (hour, 24h format)</label>
            <input
              type="number"
              min="0"
              max="23"
              value={cutoffHour}
              onChange={function (e) { setCutoffHour(e.target.value) }}
              style={{ ...inputStyle, width: '120px' }}
            />
            <div style={{ ...subtitleStyle, marginTop: '6px' }}>
              Example: <strong>12</strong> = after noon, no more same-day bookings. <strong>0</strong> = disable this check.
            </div>

            <div style={{ marginTop: '14px' }}>
              <label style={labelStyle}>Minimum lead time (hours)</label>
              <input
                type="number"
                min="0"
                max="48"
                value={cutoffLeadHours}
                onChange={function (e) { setCutoffLeadHours(e.target.value) }}
                style={{ ...inputStyle, width: '120px' }}
              />
              <div style={{ ...subtitleStyle, marginTop: '6px' }}>
                Must book at least <strong>{cutoffLeadHours || 0}</strong> hours ahead. Set <strong>0</strong> to disable.
              </div>
            </div>

            <div style={{ marginTop: '14px' }}>
              <label style={labelStyle}>When a booking is too late:</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input
                    type="radio"
                    name="cutoffMode"
                    checked={cutoffMode === 'approval'}
                    onChange={function () { setCutoffMode('approval') }}
                  />
                  Needs my approval (I can still accept)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input
                    type="radio"
                    name="cutoffMode"
                    checked={cutoffMode === 'block'}
                    onChange={function () { setCutoffMode('block') }}
                  />
                  Fully blocked (AI refuses on the spot)
                </label>
              </div>
            </div>

            <div style={{ marginTop: '14px' }}>
              <label style={labelStyle}>
                Message client sees {cutoffMode === 'block' ? 'when refused' : 'when approval needed'}
              </label>
              <textarea
                value={cutoffMsg}
                onChange={function (e) { setCutoffMsg(e.target.value) }}
                placeholder={cutoffMode === 'block'
                  ? "Sorry — we're not taking any more bookings for today. Please try tomorrow or later in the week!"
                  : "Got it! Since this is short notice, I'll run it by the groomer and she'll text you shortly to confirm."}
                style={{ ...inputStyle, width: '100%', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ ...subtitleStyle, marginTop: '4px' }}>
                Leave blank to use the default.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========= RULE 9: DAILY PET CAP ========= */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>📊</span>
              <h3 style={titleStyle}>Daily Pet Cap</h3>
            </div>
            <div style={subtitleStyle}>
              Stop the AI from booking more than X pets in a day. Set a shop-wide number, per-groomer numbers, or both.
            </div>
          </div>
          <button
            style={toggleStyle(capEnabled)}
            onClick={function () { setCapEnabled(!capEnabled) }}
          >
            {capEnabled ? '☑ ON' : '☐ OFF'}
          </button>
        </div>
        {capEnabled && (
          <div style={{ marginTop: '12px' }}>
            <label style={labelStyle}>Shop-wide max pets per day (optional)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={capShopWide}
              onChange={function (e) { setCapShopWide(e.target.value) }}
              placeholder="e.g. 10"
              style={{ ...inputStyle, width: '120px' }}
            />
            <div style={{ ...subtitleStyle, marginTop: '6px' }}>
              Total pets across the whole shop for one day. Leave blank to only use per-groomer caps below.
            </div>

            <div style={{ marginTop: '18px' }}>
              <label style={labelStyle}>Per-groomer daily caps</label>
              {staffList.length === 0 ? (
                <div style={{ ...subtitleStyle, padding: '8px 10px', background: '#f9fafb', borderRadius: '6px' }}>
                  No active staff members yet. Add staff on the Staff page and they'll show here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {staffList.map(function (st) {
                    var curVal = capStaffMap[st.id] != null ? String(capStaffMap[st.id]) : ''
                    return (
                      <div
                        key={st.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          padding: '8px 10px',
                          background: '#f9fafb',
                          borderRadius: '6px',
                        }}
                      >
                        <span style={{ fontSize: '14px', color: '#111827' }}>
                          {st.first_name} {st.last_name}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={curVal}
                            onChange={function (e) {
                              var nm = {}
                              for (var k in capStaffMap) nm[k] = capStaffMap[k]
                              nm[st.id] = e.target.value
                              setCapStaffMap(nm)
                            }}
                            placeholder="—"
                            style={{ ...inputStyle, width: '80px' }}
                          />
                          <span style={{ fontSize: '13px', color: '#6b7280' }}>pets/day</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ ...subtitleStyle, marginTop: '6px' }}>
                Leave a number blank or 0 to skip capping that groomer.
              </div>
            </div>

            <div style={{ marginTop: '14px' }}>
              <label style={labelStyle}>Message client sees when day is full</label>
              <textarea
                value={capMsg}
                onChange={function (e) { setCapMsg(e.target.value) }}
                placeholder="Sorry — we're fully booked that day! Would another day work?"
                style={{ ...inputStyle, width: '100%', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ ...subtitleStyle, marginTop: '4px' }}>
                Leave blank to use the default. This rule always blocks — no approval option.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========= SAVE BUTTON ========= */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
        {error && (
          <span style={{ color: '#dc2626', fontSize: '13px' }}>{error}</span>
        )}
        {saved && (
          <span style={{ color: '#10b981', fontSize: '13px', fontWeight: 600 }}>✓ Saved</span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saving ? '#9ca3af' : '#7c3aed',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : '💾 Save Rules'}
        </button>
      </div>
    </div>
  )
}
