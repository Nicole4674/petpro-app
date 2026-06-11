import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Modal, Switch, Share, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';
import { WEB_BASE } from '../lib/webLink';

const EMPTY_FORM = {
  id: null, name: '', code: '', new_client_reward: '', discount_type: 'none', discount_value: '',
  new_clients_only: true, reward_referrer: false, referrer_reward: '', is_active: true, expires_at: '', max_uses: '',
};
const DISCOUNTS = [
  { key: 'none', label: 'Freebie / no $ change' },
  { key: 'amount', label: '$ off' },
  { key: 'percent', label: '% off' },
];

function suggestCode(name) {
  let base = (name || 'PROMO').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
  if (!base) base = 'PROMO';
  return base + String(new Date().getFullYear()).slice(2);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function PromosScreen({ session, navigation }) {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [err, setErr] = useState('');

  const gid = session.user.id;

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase.from('promos').select('*').eq('groomer_id', gid).order('created_at', { ascending: false });
      if (error) throw error;
      setPromos(data || []);
    } catch (e) { setErr(e.message || 'Could not load promos.'); } finally { setLoading(false); }
  }

  function setF(patch) { setForm((f) => ({ ...f, ...patch })); }
  function openNew() { setForm(EMPTY_FORM); setShowForm(true); }
  function openEdit(p) {
    setForm({
      id: p.id, name: p.name || '', code: p.code || '', new_client_reward: p.new_client_reward || '',
      discount_type: p.discount_type || 'none',
      discount_value: p.discount_value != null && p.discount_value > 0 ? String(p.discount_value) : '',
      new_clients_only: p.new_clients_only !== false, reward_referrer: p.reward_referrer === true,
      referrer_reward: p.referrer_reward || '', is_active: p.is_active !== false,
      expires_at: p.expires_at || '', max_uses: p.max_uses != null ? String(p.max_uses) : '',
    });
    setShowForm(true);
  }

  async function savePromo() {
    if (!form.name.trim()) { setErr('Give the promo a name first (e.g. "Spring referral").'); return; }
    if (!form.new_client_reward.trim()) { setErr('Describe what the new client gets (e.g. "Free nail filing!").'); return; }
    const code = (form.code || suggestCode(form.name)).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) { setErr('The share code needs at least one letter or number.'); return; }
    if (form.reward_referrer && !form.referrer_reward.trim()) { setErr('You enabled "reward the referrer" — describe what they get.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        groomer_id: gid, name: form.name.trim(), code, new_client_reward: form.new_client_reward.trim(),
        discount_type: form.discount_type, discount_value: form.discount_type === 'none' ? 0 : (parseFloat(form.discount_value) || 0),
        new_clients_only: form.new_clients_only, reward_referrer: form.reward_referrer,
        referrer_reward: form.reward_referrer ? form.referrer_reward.trim() : null,
        is_active: form.is_active, expires_at: form.expires_at || null, max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
      };
      const { error } = form.id
        ? await supabase.from('promos').update(payload).eq('id', form.id)
        : await supabase.from('promos').insert([payload]);
      if (error) {
        if (/duplicate|idx_promos_groomer_code/i.test(error.message)) throw new Error(`You already have a promo with code "${code}". Pick a different code.`);
        throw error;
      }
      setShowForm(false); setForm(EMPTY_FORM); load();
    } catch (e) { setErr(e.message || 'Could not save promo.'); } finally { setSaving(false); }
  }

  async function toggleActive(p) {
    try { const { error } = await supabase.from('promos').update({ is_active: !p.is_active }).eq('id', p.id); if (error) throw error; load(); }
    catch (e) { setErr(e.message || 'Could not update.'); }
  }

  function deletePromo(p) {
    Alert.alert('Delete promo?', `Delete "${p.name}"? Clients who already signed up keep their reward; the share link just stops working.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { const { error } = await supabase.from('promos').delete().eq('id', p.id); if (error) throw error; load(); }
        catch (e) { setErr(e.message || 'Could not delete.'); }
      } },
    ]);
  }

  function shareLink(p) {
    const url = `${WEB_BASE}/portal/signup?g=${gid}&promo=${encodeURIComponent(p.code)}`;
    Share.share({ message: `${p.new_client_reward} — sign up here: ${url}` });
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}><Ionicons name="gift" size={20} color="#fff" /><Text style={styles.title}>Promos</Text></View>
          <Pressable style={styles.newBtn} onPress={openNew}><Text style={styles.newBtnText}>+ New</Text></Pressable>
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <Text style={styles.intro}>Create a reward — every client gets a share link in their portal. Friends sign up through it and the reward auto-applies when they book.</Text>

          {promos.length === 0 ? (
            <Text style={styles.empty}>No promos yet. Try "Free nail filing for new clients" — your clients will share it for you.</Text>
          ) : promos.map((p) => {
            const expired = p.expires_at && p.expires_at < todayISO();
            const maxedOut = p.max_uses != null && (p.use_count || 0) >= p.max_uses;
            const dim = !(p.is_active && !expired && !maxedOut);
            return (
              <View key={p.id} style={[styles.card, dim && { opacity: 0.6 }]}>
                <View style={styles.nameRow}>
                  <Text style={styles.cardName}>{p.name}</Text>
                  <View style={styles.codeBadge}><Text style={styles.codeText}>{p.code}</Text></View>
                </View>
                {!p.is_active ? <Text style={styles.flagMuted}>· paused</Text> : null}
                {expired ? <Text style={styles.flagRed}>· expired</Text> : null}
                {maxedOut ? <Text style={styles.flagRed}>· max uses reached</Text> : null}

                <Text style={styles.cardLine}>🎁 New client gets: <Text style={styles.bold}>{p.new_client_reward}</Text>
                  {p.discount_type === 'amount' && p.discount_value > 0 ? <Text style={styles.green}> (auto −${p.discount_value})</Text> : null}
                  {p.discount_type === 'percent' && p.discount_value > 0 ? <Text style={styles.green}> (auto −{p.discount_value}%)</Text> : null}
                </Text>
                {p.reward_referrer ? <Text style={styles.cardLine}>🤝 Referrer gets: <Text style={styles.bold}>{p.referrer_reward}</Text></Text> : null}
                <Text style={styles.cardMeta}>
                  {p.new_clients_only ? 'New clients only' : 'Any client'} · used {p.use_count || 0}{p.max_uses != null ? `/${p.max_uses}` : ''}{p.expires_at ? ` · expires ${p.expires_at}` : ''}
                </Text>

                <View style={styles.cardBtns}>
                  <Pressable style={styles.shareBtn} onPress={() => shareLink(p)}><Ionicons name="share-outline" size={14} color="#fff" /><Text style={styles.shareBtnText}>Share link</Text></Pressable>
                  <Pressable style={styles.smBtn} onPress={() => toggleActive(p)}><Text style={styles.smBtnText}>{p.is_active ? 'Pause' : 'Activate'}</Text></Pressable>
                  <Pressable style={styles.smBtn} onPress={() => openEdit(p)}><Text style={styles.smBtnText}>Edit</Text></Pressable>
                  <Pressable style={styles.smBtn} onPress={() => deletePromo(p)}><Text style={[styles.smBtnText, { color: '#dc2626' }]}>Delete</Text></Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Create / edit modal */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{form.id ? 'Edit Promo' : 'New Promo'}</Text>

              <Text style={styles.label}>Promo name (just for you)</Text>
              <TextInput style={styles.input} value={form.name} onChangeText={(v) => setF({ name: v })} placeholder='e.g. "Spring referral special"' placeholderTextColor={colors.textFaint} />

              <Text style={styles.label}>What does the NEW CLIENT get?</Text>
              <TextInput style={styles.input} value={form.new_client_reward} onChangeText={(v) => setF({ new_client_reward: v })} placeholder='e.g. "Free nail filing with your first groom!"' placeholderTextColor={colors.textFaint} />

              <Text style={styles.label}>Auto-discount at booking</Text>
              <View style={styles.chips}>
                {DISCOUNTS.map((d) => (
                  <Pressable key={d.key} style={[styles.chip, form.discount_type === d.key && styles.chipOn]} onPress={() => setF({ discount_type: d.key })}>
                    <Text style={[styles.chipText, form.discount_type === d.key && styles.chipTextOn]}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>
              {form.discount_type !== 'none' ? (
                <TextInput style={[styles.input, { marginTop: 8 }]} value={form.discount_value} onChangeText={(v) => setF({ discount_value: v })} keyboardType="decimal-pad" placeholder={form.discount_type === 'amount' ? '10' : '15'} placeholderTextColor={colors.textFaint} />
              ) : null}

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>New clients only (off = any client, for "come back!" promos)</Text>
                <Switch value={form.new_clients_only} onValueChange={(v) => setF({ new_clients_only: v })} trackColor={{ true: colors.primary, false: '#d1d5db' }} thumbColor="#fff" />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>🤝 Also reward the client who shared the link</Text>
                <Switch value={form.reward_referrer} onValueChange={(v) => setF({ reward_referrer: v })} trackColor={{ true: colors.primary, false: '#d1d5db' }} thumbColor="#fff" />
              </View>
              {form.reward_referrer ? (
                <TextInput style={styles.input} value={form.referrer_reward} onChangeText={(v) => setF({ referrer_reward: v })} placeholder='What do THEY get? e.g. "$5 off your next groom"' placeholderTextColor={colors.textFaint} />
              ) : null}

              <Text style={styles.label}>Share code (optional — auto-created)</Text>
              <TextInput style={styles.input} value={form.code} onChangeText={(v) => setF({ code: v.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder={suggestCode(form.name)} placeholderTextColor={colors.textFaint} autoCapitalize="characters" />

              <View style={styles.row2}>
                <View style={styles.f1}>
                  <Text style={styles.label}>Expires (optional)</Text>
                  <Pressable style={styles.input} onPress={() => setShowDate(true)}>
                    <Text style={{ color: form.expires_at ? colors.text : colors.textFaint, fontSize: 15 }}>{form.expires_at || 'No expiry'}</Text>
                  </Pressable>
                  {form.expires_at ? <Pressable onPress={() => setF({ expires_at: '' })}><Text style={styles.clearLink}>clear</Text></Pressable> : null}
                </View>
                <View style={styles.f1}>
                  <Text style={styles.label}>Max uses (optional)</Text>
                  <TextInput style={styles.input} value={form.max_uses} onChangeText={(v) => setF({ max_uses: v })} keyboardType="number-pad" placeholder="∞" placeholderTextColor={colors.textFaint} />
                </View>
              </View>
              {showDate ? (
                <DateTimePicker
                  value={form.expires_at ? new Date(form.expires_at + 'T00:00:00') : new Date()}
                  mode="date"
                  onChange={(e, d) => { setShowDate(Platform.OS === 'ios'); if (d) setF({ expires_at: d.toISOString().slice(0, 10) }); }}
                />
              ) : null}

              <Text style={styles.hint}>💡 Nobody types this code — it travels inside the share link automatically. Leave it blank and we'll make one from the name. It's just how the promo shows in your appointment notes so you know which promo brought a client in.</Text>

              {err ? <Text style={styles.err}>{err}</Text> : null}
              <View style={styles.modalBtns}>
                <Pressable style={styles.cancelBtn} onPress={() => { setShowForm(false); setForm(EMPTY_FORM); setErr(''); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={savePromo} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Promo</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  newBtn: { backgroundColor: '#fff', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 16 },
  newBtnText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 50 },
  intro: { fontSize: 13, color: colors.textMute, lineHeight: 19, marginBottom: 14 },
  empty: { textAlign: 'center', color: colors.textFaint, fontSize: 14, lineHeight: 20, marginTop: 20, paddingHorizontal: 12 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 12, ...shadow },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardName: { fontSize: 16, fontWeight: '800', color: colors.text },
  codeBadge: { backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  codeText: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  flagMuted: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  flagRed: { fontSize: 11, color: '#dc2626', marginTop: 2 },
  cardLine: { fontSize: 13, color: colors.textMute, marginTop: 4 },
  bold: { fontWeight: '800', color: colors.text },
  green: { color: colors.green },
  cardMeta: { fontSize: 12, color: colors.textFaint, marginTop: 4 },
  cardBtns: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 13 },
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  smBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  smBtnText: { color: colors.textMute, fontWeight: '700', fontSize: 13 },
  err: { color: '#b91c1c', fontSize: 13, marginVertical: 8, textAlign: 'center' },
  // modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '800', color: colors.textMute, marginBottom: 6, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13, backgroundColor: '#fff' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  chipTextOn: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 },
  switchLabel: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
  row2: { flexDirection: 'row', gap: 10 },
  f1: { flex: 1 },
  clearLink: { color: colors.primary, fontWeight: '700', fontSize: 12, marginTop: 4 },
  hint: { fontSize: 12, color: colors.textMute, lineHeight: 17, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 8, padding: 10, marginTop: 14 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: '#fff' },
  cancelText: { color: colors.textMute, fontWeight: '800', fontSize: 14 },
  saveBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
