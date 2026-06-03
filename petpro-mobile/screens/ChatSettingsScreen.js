import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Switch, Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

const TONES = [
  { label: 'Professional', value: 'professional' },
  { label: 'Friendly', value: 'friendly' },
  { label: 'Super Casual', value: 'casual' },
];
const EMOJI = [
  { label: 'Never', value: 'never' },
  { label: 'Sometimes', value: 'sometimes' },
  { label: 'Often', value: 'often' },
];
const ADDRESS = [
  { label: 'First name — "Hey Sarah!"', value: 'first_name' },
  { label: 'Mr./Mrs. + Last — "Hi Mrs. Thompson"', value: 'mr_mrs_last' },
  { label: 'Full name — "Hi Sarah Thompson"', value: 'full_name' },
];
const WINDOWS = [
  { label: '5 min', value: 5 }, { label: '15 min', value: 15 }, { label: '30 min', value: 30 },
  { label: '1 hr', value: 60 }, { label: '2 hr', value: 120 }, { label: '4 hr', value: 240 },
];
// key → { label, desc, placeholders, default }
const TEMPLATES = [
  { key: 'pickup_ready', label: 'Pickup Ready', desc: 'Sent when the pet is done and ready.', ph: '{owner_name}, {pet_name}', def: 'Hey {owner_name}! {pet_name} is all done and looking amazing 🐾 Ready whenever you are!' },
  { key: 'reminder', label: 'Appointment Reminder (Grooming)', desc: 'Sent the day before a grooming appointment.', ph: '{owner_name}, {pet_name}, {service}, {time}', def: 'Hey {owner_name}! Just a reminder — {pet_name} has a {service} tomorrow at {time}. Reply Y to confirm. See you soon! 🐾' },
  { key: 'boarding_reminder', label: 'Boarding Reminder', desc: 'Sent the day before a boarding check-in.', ph: '{owner_name}, {pet_names}, {start_date}', def: 'Hey {owner_name}! Just a reminder — {pet_names} check in for boarding tomorrow ({start_date}). Reply Y to confirm. See you soon! 🐾' },
  { key: 'running_late', label: 'Running Late', desc: "Sent when you're behind schedule.", ph: '{owner_name}, {pet_name}, {minutes}', def: "Hi {owner_name}, we're running about {minutes} minutes behind on {pet_name}. So sorry for the wait!" },
  { key: 'arrived_safely', label: 'Dog Arrived Safely', desc: 'Peace-of-mind message after drop-off.', ph: '{owner_name}, {pet_name}', def: 'Hi {owner_name}! {pet_name} just got here safe and sound 🐕' },
  { key: 'follow_up', label: 'Follow-Up After Service', desc: 'Sent a few days later to encourage rebook.', ph: '{owner_name}, {pet_name}', def: 'Hi {owner_name}! Hope {pet_name} is doing great. Book your next appointment anytime!' },
  { key: 'no_show', label: 'No-Show', desc: 'Sent when an appointment was missed.', ph: '{owner_name}, {pet_name}, {time}', def: 'Hi {owner_name}, we missed you at {time} today. Want to reschedule {pet_name}?' },
];

function timeToDate(hhmmss) {
  const [h, m] = String(hhmmss || '09:00').split(':').map((n) => parseInt(n, 10));
  const d = new Date(); d.setHours(h || 9, m || 0, 0, 0); return d;
}

export default function ChatSettingsScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const [shopName, setShopName] = useState('');
  const [tone, setTone] = useState('friendly');
  const [emojiLevel, setEmojiLevel] = useState('sometimes');
  const [addressStyle, setAddressStyle] = useState('first_name');

  const [clientClaude, setClientClaude] = useState(true);
  const [autoBook, setAutoBook] = useState(true);
  const [newClientBooking, setNewClientBooking] = useState(false);
  const [canReschedule, setCanReschedule] = useState(true);
  const [canCancel, setCanCancel] = useState(true);

  const [waitlistOn, setWaitlistOn] = useState(false);
  const [waitlistInstructions, setWaitlistInstructions] = useState('');
  const [waitlistWindow, setWaitlistWindow] = useState(30);
  const [waitlistOnYes, setWaitlistOnYes] = useState('notify_groomer');

  const [reminderTime, setReminderTime] = useState(timeToDate('09:00'));
  const [reminderTz, setReminderTz] = useState('America/Chicago');
  const [showTimePicker, setShowTimePicker] = useState(false);

  // templates: { [key]: { enabled, text } }
  const initTemplates = {};
  TEMPLATES.forEach((t) => { initTemplates[t.key] = { enabled: t.key === 'pickup_ready' || t.key === 'reminder' || t.key === 'boarding_reminder', text: t.def }; });
  const [templates, setTemplates] = useState(initTemplates);
  const [customInstructions, setCustomInstructions] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase.from('ai_personalization').select('*').eq('groomer_id', session.user.id).maybeSingle();
      if (error) throw error;
      if (data) {
        if (data.shop_name != null) setShopName(data.shop_name);
        if (data.tone) setTone(data.tone);
        if (data.emoji_level) setEmojiLevel(data.emoji_level);
        if (data.address_style) setAddressStyle(data.address_style);
        if (data.client_claude_enabled != null) setClientClaude(!!data.client_claude_enabled);
        if (data.client_auto_book_enabled != null) setAutoBook(!!data.client_auto_book_enabled);
        setNewClientBooking(data.client_new_client_booking_enabled === true);
        if (data.client_can_reschedule != null) setCanReschedule(!!data.client_can_reschedule);
        if (data.client_can_cancel != null) setCanCancel(!!data.client_can_cancel);
        if (data.waitlist_auto_notify_enabled != null) setWaitlistOn(!!data.waitlist_auto_notify_enabled);
        if (data.waitlist_auto_notify_instructions != null) setWaitlistInstructions(data.waitlist_auto_notify_instructions);
        if (data.waitlist_response_window_minutes != null) setWaitlistWindow(data.waitlist_response_window_minutes);
        if (data.waitlist_on_yes_action) setWaitlistOnYes(data.waitlist_on_yes_action);
        if (data.reminder_send_time) setReminderTime(timeToDate(data.reminder_send_time));
        if (data.reminder_send_timezone) setReminderTz(data.reminder_send_timezone);
        const next = { ...initTemplates };
        TEMPLATES.forEach((t) => {
          next[t.key] = {
            enabled: data[`${t.key}_enabled`] != null ? !!data[`${t.key}_enabled`] : next[t.key].enabled,
            text: data[`${t.key}_template`] || t.def,
          };
        });
        setTemplates(next);
        if (data.custom_instructions != null) setCustomInstructions(data.custom_instructions);
      }
    } catch (e) { setErr(e.message || 'Could not load settings.'); } finally { setLoading(false); }
  }

  async function save() {
    setSaving(true); setSaved(false); setErr('');
    try {
      const hh = String(reminderTime.getHours()).padStart(2, '0');
      const mm = String(reminderTime.getMinutes()).padStart(2, '0');
      const payload = {
        groomer_id: session.user.id,
        shop_name: shopName || null,
        tone, emoji_level: emojiLevel, address_style: addressStyle,
        client_claude_enabled: clientClaude,
        client_auto_book_enabled: autoBook,
        client_new_client_booking_enabled: newClientBooking,
        client_can_reschedule: canReschedule,
        client_can_cancel: canCancel,
        waitlist_auto_notify_enabled: waitlistOn,
        waitlist_auto_notify_instructions: waitlistInstructions || null,
        waitlist_response_window_minutes: waitlistWindow,
        waitlist_on_yes_action: waitlistOnYes,
        reminder_send_time: `${hh}:${mm}:00`,
        reminder_send_timezone: reminderTz,
        custom_instructions: customInstructions || null,
      };
      TEMPLATES.forEach((t) => {
        payload[`${t.key}_enabled`] = templates[t.key].enabled;
        payload[`${t.key}_template`] = templates[t.key].text;
      });
      const { error } = await supabase.from('ai_personalization').upsert(payload, { onConflict: 'groomer_id' });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr(e.message || 'Could not save.'); } finally { setSaving(false); }
  }

  function setTpl(key, patch) {
    setTemplates((m) => ({ ...m, [key]: { ...m[key], ...patch } }));
  }
  function toggleNewClient(v) {
    if (v) {
      Alert.alert('Let new clients book automatically?', 'People who have never been to your shop could book through Suds. Suds still flags first-time bookings for your review.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, allow', onPress: () => setNewClientBooking(true) },
      ]);
    } else { setNewClientBooking(false); }
  }

  function Chips({ options, value, onChange }) {
    return (
      <View style={styles.chips}>
        {options.map((o) => (
          <Pressable key={String(o.value)} style={[styles.chip, value === o.value && styles.chipSel]} onPress={() => onChange(o.value)}>
            <Text style={[styles.chipText, value === o.value && styles.chipTextSel]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  function ToggleRow({ label, desc, value, onValueChange, disabled }) {
    return (
      <View style={[styles.toggleRow, disabled && { opacity: 0.5 }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.toggleLabel}>{label}</Text>
          {desc ? <Text style={styles.toggleDesc}>{desc}</Text> : null}
        </View>
        <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: colors.primary }} thumbColor="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Ionicons name="sparkles" size={20} color="#fff" />
          <Text style={styles.title}>Chat Settings</Text>
        </View>
        <Text style={styles.sub}>How Suds talks to your clients</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {err ? <Text style={styles.err}>{err}</Text> : null}

          {/* Shop Voice */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Shop Voice</Text>
            <Text style={styles.label}>Shop name</Text>
            <TextInput style={styles.input} value={shopName} onChangeText={setShopName} placeholder="e.g. Bella's Pet Spa" placeholderTextColor={colors.textFaint} />
            <Text style={styles.label}>Tone</Text>
            <Chips options={TONES} value={tone} onChange={setTone} />
            <Text style={styles.label}>Emoji usage</Text>
            <Chips options={EMOJI} value={emojiLevel} onChange={setEmojiLevel} />
          </View>

          {/* Addressing */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>How to address owners</Text>
            <Chips options={ADDRESS} value={addressStyle} onChange={setAddressStyle} />
          </View>

          {/* Client Portal AI */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Client Portal AI</Text>
            <ToggleRow label="Enable client AI chat" desc="Master switch for the AI chat bubble in the client portal." value={clientClaude} onValueChange={setClientClaude} />
            <ToggleRow label="Auto-book appointments" desc="AI books directly for returning clients." value={autoBook} onValueChange={setAutoBook} disabled={!clientClaude} />
            <ToggleRow label="Let new clients book through Suds" desc="New clients normally must message first. Flagged for review either way." value={newClientBooking} onValueChange={toggleNewClient} disabled={!clientClaude} />
            <ToggleRow label="Allow reschedules" desc="Clients can reschedule their own appointments." value={canReschedule} onValueChange={setCanReschedule} disabled={!clientClaude} />
            <ToggleRow label="Allow cancellations" desc="Clients can cancel their own appointments." value={canCancel} onValueChange={setCanCancel} disabled={!clientClaude} />
          </View>

          {/* Waitlist Auto-Notify */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Waitlist Auto-Notify</Text>
            <ToggleRow label="Enable waitlist auto-notify" desc="On a cancellation, Suds offers the slot to the first eligible person on your waitlist." value={waitlistOn} onValueChange={setWaitlistOn} />
            {waitlistOn ? (
              <>
                <Text style={styles.label}>Filter rules (plain English)</Text>
                <TextInput style={[styles.input, styles.multiline]} value={waitlistInstructions} onChangeText={setWaitlistInstructions} placeholder="e.g. Don't offer to dogs over 50 lbs" placeholderTextColor={colors.textFaint} multiline />
                <Text style={styles.label}>Response window</Text>
                <Chips options={WINDOWS} value={waitlistWindow} onChange={setWaitlistWindow} />
                <Text style={styles.label}>When a client says YES</Text>
                <Chips options={[{ label: 'Ping me to book', value: 'notify_groomer' }, { label: 'Auto-book instantly', value: 'auto_book' }]} value={waitlistOnYes} onChange={setWaitlistOnYes} />
              </>
            ) : null}
          </View>

          {/* Reminder time */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Reminder schedule</Text>
            <Text style={styles.label}>Daily send time ({reminderTz.replace('America/', '')})</Text>
            <Pressable style={styles.timeBtn} onPress={() => setShowTimePicker(true)}>
              <Ionicons name="time-outline" size={16} color={colors.primaryDark} />
              <Text style={styles.timeText}>{reminderTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
            </Pressable>
            {showTimePicker ? <DateTimePicker value={reminderTime} mode="time" onChange={(_e, s) => { setShowTimePicker(false); if (s) setReminderTime(s); }} /> : null}
            <Text style={styles.hint}>Each day at this time, Suds sends day-before reminders for tomorrow's grooming and boarding.</Text>
          </View>

          {/* Templates */}
          <Text style={styles.sectionHeading}>Message Templates</Text>
          {TEMPLATES.map((t) => (
            <View key={t.key} style={styles.card}>
              <View style={styles.tplHead}>
                <Text style={styles.tplLabel}>{t.label}</Text>
                <Switch value={templates[t.key].enabled} onValueChange={(v) => setTpl(t.key, { enabled: v })} trackColor={{ true: colors.primary }} thumbColor="#fff" />
              </View>
              <Text style={styles.tplDesc}>{t.desc}</Text>
              <TextInput
                style={[styles.input, styles.multiline, !templates[t.key].enabled && styles.inputDisabled]}
                value={templates[t.key].text}
                onChangeText={(v) => setTpl(t.key, { text: v })}
                editable={templates[t.key].enabled}
                multiline
              />
              <Text style={styles.ph}>Placeholders: {t.ph}</Text>
            </View>
          ))}

          {/* Custom instructions */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Custom instructions</Text>
            <Text style={styles.hint}>Anything else about how to run your shop. Grooming-business only.</Text>
            <TextInput style={[styles.input, styles.multiline, { minHeight: 110 }]} value={customInstructions} onChangeText={setCustomInstructions} placeholder={'e.g.\n- Always confirm weight before booking\n- Remind clients to withhold food 2 hrs before drop-off'} placeholderTextColor={colors.textFaint} multiline />
          </View>

          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{saved ? '✓ Saved' : 'Save Settings'}</Text>}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 18, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  sub: { color: '#ddd6fe', fontSize: 13, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '800', color: colors.textMute, marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#f9fafb', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  inputDisabled: { backgroundColor: '#f3f4f6', color: colors.textFaint },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: colors.textMute, marginTop: 8, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#374151', fontWeight: '700', fontSize: 13 },
  chipTextSel: { color: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  toggleDesc: { fontSize: 12, color: colors.textMute, marginTop: 2, lineHeight: 16 },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  timeText: { color: colors.primaryDark, fontWeight: '800', fontSize: 16 },
  sectionHeading: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10, marginTop: 4 },
  tplHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tplLabel: { fontSize: 15, fontWeight: '800', color: colors.text, flex: 1 },
  tplDesc: { fontSize: 12, color: colors.textMute, marginTop: 2, marginBottom: 8 },
  ph: { fontSize: 11, color: colors.textFaint, marginTop: 6 },
  saveBtn: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
});
