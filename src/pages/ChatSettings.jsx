// =======================================================
// PetPro — Chat Settings Page
// Personalize how PetPro AI talks to clients
// Reads / writes the ai_personalization table.
// =======================================================
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sendRemindersForGroomer } from '../lib/sendReminders'

export default function ChatSettings() {
  var navigate = useNavigate()

  var [loading, setLoading] = useState(true)
  var [saving, setSaving] = useState(false)
  var [saved, setSaved] = useState(false)
  var [error, setError] = useState('')

  // ---- Shop Voice ----
  var [shopName, setShopName] = useState('')
  var [tone, setTone] = useState('friendly')
  var [emojiLevel, setEmojiLevel] = useState('sometimes')

  // ---- Addressing ----
  var [addressStyle, setAddressStyle] = useState('first_name')

  // ---- Templates ----
  var [pickupReadyEnabled, setPickupReadyEnabled] = useState(true)
  var [pickupReadyTemplate, setPickupReadyTemplate] = useState(
    'Hey {owner_name}! {pet_name} is all done and looking amazing 🐾 Ready whenever you are!'
  )
  var [reminderEnabled, setReminderEnabled] = useState(true)
  var [reminderTemplate, setReminderTemplate] = useState(
    'Hey {owner_name}! Just a reminder — {pet_name} has a {service} tomorrow at {time}. Reply Y to confirm. See you soon! 🐾'
  )
  var [boardingReminderEnabled, setBoardingReminderEnabled] = useState(true)
  var [boardingReminderTemplate, setBoardingReminderTemplate] = useState(
    'Hey {owner_name}! Just a reminder — {pet_names} check in for boarding tomorrow ({start_date}). Reply Y to confirm. See you soon! 🐾'
  )
  var [reminderSendTime, setReminderSendTime] = useState('09:00')
  var [reminderSendTimezone, setReminderSendTimezone] = useState('America/Chicago')
  var [sendingReminders, setSendingReminders] = useState(false)
  var [remindersResult, setRemindersResult] = useState('')
  var [runningLateEnabled, setRunningLateEnabled] = useState(false)
  var [runningLateTemplate, setRunningLateTemplate] = useState(
    "Hi {owner_name}, we're running about {minutes} minutes behind on {pet_name}. So sorry for the wait!"
  )
  var [arrivedSafelyEnabled, setArrivedSafelyEnabled] = useState(false)
  var [arrivedSafelyTemplate, setArrivedSafelyTemplate] = useState(
    'Hi {owner_name}! {pet_name} just got here safe and sound 🐕'
  )
  var [followUpEnabled, setFollowUpEnabled] = useState(false)
  var [followUpTemplate, setFollowUpTemplate] = useState(
    'Hi {owner_name}! Hope {pet_name} is doing great. Book your next appointment anytime!'
  )
  var [noShowEnabled, setNoShowEnabled] = useState(false)
  var [noShowTemplate, setNoShowTemplate] = useState(
    'Hi {owner_name}, we missed you at {time} today. Want to reschedule {pet_name}?'
  )

  // ---- Client Portal AI Toggles ----
  var [clientClaudeEnabled, setClientClaudeEnabled] = useState(true)
  var [clientAutoBookEnabled, setClientAutoBookEnabled] = useState(true)
  var [clientCanReschedule, setClientCanReschedule] = useState(true)
  var [clientCanCancel, setClientCanCancel] = useState(true)

  // ---- Custom ----
  var [customInstructions, setCustomInstructions] = useState('')

  useEffect(function () {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    setError('')
    try {
      var { data: userData } = await supabase.auth.getUser()
      var user = userData && userData.user
      if (!user) {
        setError('Not signed in.')
        setLoading(false)
        return
      }

      var { data, error: loadErr } = await supabase
        .from('ai_personalization')
        .select('*')
        .eq('groomer_id', user.id)
        .maybeSingle()

      if (loadErr) {
        console.error('Load error:', loadErr)
        setError('Could not load settings: ' + loadErr.message)
      } else if (data) {
        if (data.shop_name != null) setShopName(data.shop_name)
        if (data.tone) setTone(data.tone)
        if (data.emoji_level) setEmojiLevel(data.emoji_level)
        if (data.address_style) setAddressStyle(data.address_style)

        setPickupReadyEnabled(!!data.pickup_ready_enabled)
        if (data.pickup_ready_template) setPickupReadyTemplate(data.pickup_ready_template)

        setReminderEnabled(!!data.reminder_enabled)
        if (data.reminder_template) setReminderTemplate(data.reminder_template)
        if (data.reminder_send_time) {
          // DB stores as 'HH:MM:SS', input type="time" needs 'HH:MM'
          var timeStr = String(data.reminder_send_time).slice(0, 5)
          setReminderSendTime(timeStr)
        }
        if (data.reminder_send_timezone) setReminderSendTimezone(data.reminder_send_timezone)

        if (data.boarding_reminder_enabled != null) setBoardingReminderEnabled(!!data.boarding_reminder_enabled)
        if (data.boarding_reminder_template) setBoardingReminderTemplate(data.boarding_reminder_template)

        setRunningLateEnabled(!!data.running_late_enabled)
        if (data.running_late_template) setRunningLateTemplate(data.running_late_template)

        setArrivedSafelyEnabled(!!data.arrived_safely_enabled)
        if (data.arrived_safely_template) setArrivedSafelyTemplate(data.arrived_safely_template)

        setFollowUpEnabled(!!data.follow_up_enabled)
        if (data.follow_up_template) setFollowUpTemplate(data.follow_up_template)

        setNoShowEnabled(!!data.no_show_enabled)
        if (data.no_show_template) setNoShowTemplate(data.no_show_template)

        if (data.custom_instructions != null) setCustomInstructions(data.custom_instructions)

        if (data.client_claude_enabled != null) setClientClaudeEnabled(!!data.client_claude_enabled)
        if (data.client_auto_book_enabled != null) setClientAutoBookEnabled(!!data.client_auto_book_enabled)
        if (data.client_can_reschedule != null) setClientCanReschedule(!!data.client_can_reschedule)
        if (data.client_can_cancel != null) setClientCanCancel(!!data.client_can_cancel)
      }
    } catch (e) {
      console.error('Load failed:', e)
      setError('Could not load settings.')
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      var { data: userData } = await supabase.auth.getUser()
      var user = userData && userData.user
      if (!user) {
        setError('Not signed in.')
        setSaving(false)
        return
      }

      var payload = {
        groomer_id: user.id,
        shop_name: shopName || null,
        tone: tone,
        emoji_level: emojiLevel,
        address_style: addressStyle,
        pickup_ready_enabled: pickupReadyEnabled,
        pickup_ready_template: pickupReadyTemplate,
        reminder_enabled: reminderEnabled,
        reminder_template: reminderTemplate,
        reminder_send_time: reminderSendTime + ':00',
        reminder_send_timezone: reminderSendTimezone,
        boarding_reminder_enabled: boardingReminderEnabled,
        boarding_reminder_template: boardingReminderTemplate,
        running_late_enabled: runningLateEnabled,
        running_late_template: runningLateTemplate,
        arrived_safely_enabled: arrivedSafelyEnabled,
        arrived_safely_template: arrivedSafelyTemplate,
        follow_up_enabled: followUpEnabled,
        follow_up_template: followUpTemplate,
        no_show_enabled: noShowEnabled,
        no_show_template: noShowTemplate,
        custom_instructions: customInstructions || null,
        client_claude_enabled: clientClaudeEnabled,
        client_auto_book_enabled: clientAutoBookEnabled,
        client_can_reschedule: clientCanReschedule,
        client_can_cancel: clientCanCancel,
      }

      var { error: saveErr } = await supabase
        .from('ai_personalization')
        .upsert(payload, { onConflict: 'groomer_id' })

      if (saveErr) {
        console.error('Save error:', saveErr)
        setError('Could not save: ' + saveErr.message)
      } else {
        setSaved(true)
        setTimeout(function () { setSaved(false) }, 2500)
      }
    } catch (e) {
      console.error('Save failed:', e)
      setError('Could not save settings.')
    }
    setSaving(false)
  }

  // -------------------------------------------------------
  // Manual "Send today's reminders now" — for testing
  // without waiting for the daily cron job.
  // Real sender function is wired up in Step 3.
  // -------------------------------------------------------
  async function handleSendRemindersNow() {
    if (!reminderEnabled && !boardingReminderEnabled) {
      setRemindersResult('⚠️ Both reminders are OFF. Toggle at least one ON first.')
      return
    }
    setSendingReminders(true)
    setRemindersResult('⏳ Sending reminders...')
    try {
      var { data: userData } = await supabase.auth.getUser()
      var user = userData && userData.user
      if (!user) {
        setRemindersResult('❌ Not signed in.')
        setSendingReminders(false)
        return
      }

      var result = await sendRemindersForGroomer(user.id)
      var total = result.groomingSent + result.boardingSent
      var parts = []
      if (result.groomingSent > 0) {
        parts.push('✂️ ' + result.groomingSent + ' grooming')
      }
      if (result.boardingSent > 0) {
        parts.push('🏠 ' + result.boardingSent + ' boarding')
      }

      var summary
      if (total === 0) {
        summary = '✅ Ran successfully — nothing to send right now. (No unsent appointments or boarding check-ins scheduled for tomorrow, or reminders already went out.)'
      } else {
        summary = '✅ Sent ' + total + ' reminder' + (total === 1 ? '' : 's') + ' — ' + parts.join(', ')
      }

      if (result.errors && result.errors.length > 0) {
        summary += '\n\n⚠️ Some issues:\n• ' + result.errors.join('\n• ')
      }

      setRemindersResult(summary)
    } catch (e) {
      console.error('handleSendRemindersNow failed:', e)
      setRemindersResult('❌ Error: ' + (e.message || 'Unknown error'))
    }
    setSendingReminders(false)
  }

  // -------------------------------------------------------
  // Helper that returns JSX for one template card (NOT a
  // React component — so the textarea inside keeps focus
  // while typing).
  // -------------------------------------------------------
  function renderTemplate(key, label, description, placeholders, enabled, setEnabled, value, setValue) {
    return (
      <div key={key} style={cardStyle}>
        <div style={templateHeaderStyle}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{label}</div>
          <label style={toggleLabelStyle}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={function (e) { setEnabled(e.target.checked) }}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span style={{
              color: enabled ? '#16a34a' : '#9ca3af',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.03em',
            }}>
              {enabled ? 'ON' : 'OFF'}
            </span>
          </label>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{description}</div>
        <textarea
          value={value}
          onChange={function (e) { setValue(e.target.value) }}
          disabled={!enabled}
          rows={3}
          style={{
            width: '100%',
            padding: 10,
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontFamily: 'inherit',
            fontSize: 14,
            background: enabled ? '#fff' : '#f3f4f6',
            color: enabled ? '#111827' : '#6b7280',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
          <strong>Placeholders:</strong> {placeholders}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: 40, maxWidth: 900, margin: '0 auto', color: '#6b7280' }}>
        Loading your settings…
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* ===== Header ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>💬 Chat Settings</h1>
          <div style={{ color: '#6b7280', marginTop: 4 }}>
            Personalize how PetPro AI talks to your clients.
          </div>
        </div>
        <button onClick={function () { navigate('/') }} style={buttonSecondaryStyle}>
          ← Back
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fee2e2',
          color: '#991b1b',
          padding: 12,
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      {/* ===== Shop Voice ===== */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>🏪 Shop Voice</h3>

        <label style={labelStyle}>Shop Name</label>
        <input
          type="text"
          value={shopName}
          onChange={function (e) { setShopName(e.target.value) }}
          placeholder="e.g. Bella's Pet Spa"
          style={inputStyle}
        />
        <div style={hintStyle}>
          Used in messages: "Hi, this is <em>{shopName || '[your shop]'}</em>..."
        </div>

        <label style={labelStyle}>Tone</label>
        <select value={tone} onChange={function (e) { setTone(e.target.value) }} style={inputStyle}>
          <option value="professional">Professional — "Good afternoon, Mrs. Thompson..."</option>
          <option value="friendly">Friendly — "Hey Sarah! Bella is all set 🐾"</option>
          <option value="casual">Super Casual — "yo sarah! bella's done 🐾"</option>
        </select>

        <label style={labelStyle}>Emoji Usage</label>
        <select value={emojiLevel} onChange={function (e) { setEmojiLevel(e.target.value) }} style={inputStyle}>
          <option value="never">Never — plain text only</option>
          <option value="sometimes">Sometimes — one or two when they fit</option>
          <option value="often">Often — sprinkle liberally 🐾 ✂️ 🛁</option>
        </select>
      </div>

      {/* ===== Addressing ===== */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>👋 How to Address Owners</h3>

        <label style={radioLabelStyle}>
          <input
            type="radio"
            name="addr"
            value="first_name"
            checked={addressStyle === 'first_name'}
            onChange={function (e) { setAddressStyle(e.target.value) }}
          />
          <span><strong>First name</strong> — "Hey Sarah!"</span>
        </label>
        <label style={radioLabelStyle}>
          <input
            type="radio"
            name="addr"
            value="mr_mrs_last"
            checked={addressStyle === 'mr_mrs_last'}
            onChange={function (e) { setAddressStyle(e.target.value) }}
          />
          <span><strong>Mr./Mrs. + Last name</strong> — "Hi Mrs. Thompson"</span>
        </label>
        <label style={radioLabelStyle}>
          <input
            type="radio"
            name="addr"
            value="full_name"
            checked={addressStyle === 'full_name'}
            onChange={function (e) { setAddressStyle(e.target.value) }}
          />
          <span><strong>Full name</strong> — "Hi Sarah Thompson"</span>
        </label>
      </div>

      {/* ===== Client Portal AI ===== */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>🤖 Client Portal AI</h3>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Control what your clients can do with AI in their portal. Clients can always
          reach you through messaging — these toggles only affect the AI chat bubble.
        </div>

        {/* Master toggle */}
        <div style={{
          background: clientClaudeEnabled ? '#f0fdf4' : '#fef2f2',
          border: clientClaudeEnabled ? '1px solid #bbf7d0' : '1px solid #fecaca',
          borderRadius: 10,
          padding: 14,
          marginBottom: 14,
        }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                Enable Client AI Chat {clientClaudeEnabled ? '' : '(OFF — clients use messaging only)'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Master switch. When off, clients will not see the AI chat bubble in their portal at all.
              </div>
            </div>
            <input
              type="checkbox"
              checked={clientClaudeEnabled}
              onChange={function (e) { setClientClaudeEnabled(e.target.checked) }}
              style={{ width: 22, height: 22, cursor: 'pointer', flexShrink: 0, marginLeft: 16 }}
            />
          </label>
        </div>

        {/* Auto-Book */}
        <div style={subToggleCardStyle(clientClaudeEnabled)}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: clientClaudeEnabled ? 'pointer' : 'not-allowed' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                Auto-Book Appointments
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                AI books directly for returning clients (1+ past appointments).
                <strong> Spam safety:</strong> if a client books more than 1 non-recurring
                appointment in 30 days, the booking is flagged as <em>pending</em> for your
                review instead of auto-booked.
              </div>
            </div>
            <input
              type="checkbox"
              checked={clientAutoBookEnabled}
              disabled={!clientClaudeEnabled}
              onChange={function (e) { setClientAutoBookEnabled(e.target.checked) }}
              style={{ width: 20, height: 20, cursor: clientClaudeEnabled ? 'pointer' : 'not-allowed', flexShrink: 0, marginLeft: 16 }}
            />
          </label>
        </div>

        {/* Reschedule */}
        <div style={subToggleCardStyle(clientClaudeEnabled)}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: clientClaudeEnabled ? 'pointer' : 'not-allowed' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                Allow Reschedules
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Clients can reschedule their own upcoming appointments via AI.
              </div>
            </div>
            <input
              type="checkbox"
              checked={clientCanReschedule}
              disabled={!clientClaudeEnabled}
              onChange={function (e) { setClientCanReschedule(e.target.checked) }}
              style={{ width: 20, height: 20, cursor: clientClaudeEnabled ? 'pointer' : 'not-allowed', flexShrink: 0, marginLeft: 16 }}
            />
          </label>
        </div>

        {/* Cancel */}
        <div style={subToggleCardStyle(clientClaudeEnabled)}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: clientClaudeEnabled ? 'pointer' : 'not-allowed' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                Allow Cancellations
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Clients can cancel their own upcoming appointments via AI.
              </div>
            </div>
            <input
              type="checkbox"
              checked={clientCanCancel}
              disabled={!clientClaudeEnabled}
              onChange={function (e) { setClientCanCancel(e.target.checked) }}
              style={{ width: 20, height: 20, cursor: clientClaudeEnabled ? 'pointer' : 'not-allowed', flexShrink: 0, marginLeft: 16 }}
            />
          </label>
        </div>

        <div style={{
          fontSize: 12,
          color: '#6b7280',
          background: '#fef3c7',
          border: '1px solid #fde68a',
          borderRadius: 8,
          padding: 10,
          marginTop: 12,
        }}>
          <strong>⚠️ Note:</strong> New clients (zero past appointments) always route through
          messaging — they can never auto-book, no matter what these settings say.
        </div>
      </div>

      {/* ===== Reminder Schedule ===== */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>⏰ Appointment Reminder Schedule</h3>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
          When should PetPro send the day-before appointment reminder to your clients?
          Goes into their in-app message inbox — free and unlimited (no SMS fees).
          Clients reply <strong>Y</strong> to confirm.
        </div>

        <label style={labelStyle}>Daily send time</label>
        <input
          type="time"
          value={reminderSendTime}
          onChange={function (e) { setReminderSendTime(e.target.value) }}
          style={{ ...inputStyle, maxWidth: 200 }}
        />
        <div style={hintStyle}>
          Every day at this time, PetPro scans tomorrow's grooming appointments
          and boarding check-ins and sends a reminder to each client. (Timezone:
          {' '}{reminderSendTimezone.replace('America/', '')})
        </div>

        <div style={{
          marginTop: 18,
          padding: 14,
          background: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 8 }}>
            🧪 Test It Now
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
            Don't want to wait until {reminderSendTime} tomorrow? Click below to
            send reminders for tomorrow's appointments right now.
          </div>
          <button
            onClick={handleSendRemindersNow}
            disabled={sendingReminders}
            style={{
              ...buttonSecondaryStyle,
              opacity: sendingReminders ? 0.6 : 1,
              cursor: sendingReminders ? 'not-allowed' : 'pointer',
            }}
          >
            {sendingReminders ? 'Sending…' : "📬 Send today's reminders now"}
          </button>
          {remindersResult && (
            <div style={{
              fontSize: 13,
              marginTop: 10,
              color: '#374151',
              whiteSpace: 'pre-wrap',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: 10,
            }}>
              {remindersResult}
            </div>
          )}
        </div>
      </div>

      {/* ===== Templates ===== */}
      <div style={{ margin: '28px 0 8px 0', fontWeight: 700, fontSize: 18 }}>💬 Message Templates</div>
      <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
        Toggle each template ON or OFF. PetPro AI will only use the ones that are ON when texting
        (or later, calling) your clients.
      </div>

      {renderTemplate('pickup_ready', 'Pickup Ready',
        'Sent when the pet is all done and ready to be picked up.',
        '{owner_name}, {pet_name}',
        pickupReadyEnabled, setPickupReadyEnabled,
        pickupReadyTemplate, setPickupReadyTemplate
      )}

      {renderTemplate('reminder', 'Appointment Reminder (Grooming)',
        'Sent the day before a grooming appointment.',
        '{owner_name}, {pet_name}, {service}, {time}',
        reminderEnabled, setReminderEnabled,
        reminderTemplate, setReminderTemplate
      )}

      {renderTemplate('boarding_reminder', 'Boarding Reminder',
        'Sent the day before a boarding check-in. (No check-out reminders — clients shouldn\'t feel rushed to pick up.)',
        '{owner_name}, {pet_names}, {start_date}, {end_date}',
        boardingReminderEnabled, setBoardingReminderEnabled,
        boardingReminderTemplate, setBoardingReminderTemplate
      )}

      {renderTemplate('running_late', 'Running Late',
        "Sent when you're behind schedule.",
        '{owner_name}, {pet_name}, {minutes}',
        runningLateEnabled, setRunningLateEnabled,
        runningLateTemplate, setRunningLateTemplate
      )}

      {renderTemplate('arrived_safely', 'Dog Arrived Safely',
        'Peace-of-mind message sent after drop-off.',
        '{owner_name}, {pet_name}',
        arrivedSafelyEnabled, setArrivedSafelyEnabled,
        arrivedSafelyTemplate, setArrivedSafelyTemplate
      )}

      {renderTemplate('follow_up', 'Follow-Up After Service',
        'Sent a few days after the appointment to encourage rebook.',
        '{owner_name}, {pet_name}',
        followUpEnabled, setFollowUpEnabled,
        followUpTemplate, setFollowUpTemplate
      )}

      {renderTemplate('no_show', 'No-Show',
        'Sent when an appointment was missed.',
        '{owner_name}, {pet_name}, {time}',
        noShowEnabled, setNoShowEnabled,
        noShowTemplate, setNoShowTemplate
      )}

      {/* ===== Custom Instructions ===== */}
      <div style={cardStyle}>
        <h3 style={sectionTitleStyle}>✏️ Custom Instructions</h3>
        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>
          Tell PetPro AI anything else about how to run your shop.
          <strong> Grooming-business only</strong> — off-topic stuff (weather, trivia, personal advice)
          gets ignored automatically.
        </div>
        <textarea
          value={customInstructions}
          onChange={function (e) { setCustomInstructions(e.target.value) }}
          rows={6}
          placeholder="Example:&#10;- Always confirm the dog's weight before booking&#10;- Never book two Great Pyrenees back-to-back&#10;- Remind clients to withhold food 2 hours before drop-off"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 140 }}
        />
      </div>

      {/* ===== Save ===== */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center', marginTop: 16, marginBottom: 40 }}>
        {saved && (
          <div style={{ color: '#16a34a', fontWeight: 700, fontSize: 14 }}>✓ Saved!</div>
        )}
        <button onClick={handleSave} disabled={saving} style={{
          ...buttonPrimaryStyle,
          opacity: saving ? 0.6 : 1,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}>
          {saving ? 'Saving…' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  )
}

// =========================================================
// Inline styles — kept in this file for simplicity.
// =========================================================
var cardStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
}

var sectionTitleStyle = {
  margin: 0,
  marginBottom: 14,
  fontSize: 17,
}

var labelStyle = {
  display: 'block',
  fontWeight: 600,
  fontSize: 13,
  marginTop: 14,
  marginBottom: 4,
  color: '#374151',
}

var inputStyle = {
  width: '100%',
  padding: 10,
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontFamily: 'inherit',
  fontSize: 14,
  boxSizing: 'border-box',
}

var hintStyle = {
  fontSize: 12,
  color: '#6b7280',
  marginTop: 4,
}

var radioLabelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  marginBottom: 8,
  cursor: 'pointer',
  fontSize: 14,
}

var templateHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 6,
}

var toggleLabelStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
}

var buttonPrimaryStyle = {
  background: '#7c3aed',
  color: '#fff',
  border: 'none',
  padding: '12px 22px',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
}

var buttonSecondaryStyle = {
  background: '#fff',
  color: '#374151',
  border: '1px solid #d1d5db',
  padding: '8px 14px',
  borderRadius: 8,
  fontWeight: 500,
  fontSize: 14,
  cursor: 'pointer',
}

function subToggleCardStyle(enabled) {
  return {
    background: enabled ? '#fff' : '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    opacity: enabled ? 1 : 0.55,
  }
}
