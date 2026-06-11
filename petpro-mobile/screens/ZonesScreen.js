import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';
import { openWeb } from '../lib/webLink';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COLORS = ['#7c3aed', '#2563eb', '#16a34a', '#dc2626', '#f59e0b', '#ec4899', '#0891b2', '#65a30d'];
const EMPTY_FORM = { id: null, name: '', color: '#7c3aed', days_of_week: [], zipsText: '' };

function parseZips(text) { return (text || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean); }

export default function ZonesScreen({ session, navigation }) {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const gid = session.user.id;

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase.from('zones').select('*').eq('groomer_id', gid).order('name', { ascending: true });
      if (error) throw error;
      setZones(data || []);
    } catch (e) { setErr(e.message || 'Could not load zones.'); } finally { setLoading(false); }
  }

  function setF(patch) { setForm((f) => ({ ...f, ...patch })); }
  function openNew() { setForm(EMPTY_FORM); setShowForm(true); }
  function openEdit(z) {
    setForm({ id: z.id, name: z.name || '', color: z.color || '#7c3aed', days_of_week: Array.isArray(z.days_of_week) ? z.days_of_week : [], zipsText: (z.zips || []).join(', ') });
    setShowForm(true);
  }
  function toggleDay(d) {
    setForm((f) => {
      const has = f.days_of_week.includes(d);
      const next = has ? f.days_of_week.filter((x) => x !== d) : f.days_of_week.concat(d).sort((a, b) => a - b);
      return { ...f, days_of_week: next };
    });
  }

  async function saveZone() {
    if (!form.name.trim()) { setErr('Give the zone a name first.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { groomer_id: gid, name: form.name.trim(), color: form.color, days_of_week: form.days_of_week, zips: parseZips(form.zipsText) };
      const { error } = form.id
        ? await supabase.from('zones').update(payload).eq('id', form.id)
        : await supabase.from('zones').insert([payload]);
      if (error) throw error;
      setShowForm(false); setForm(EMPTY_FORM); load();
    } catch (e) { setErr(e.message || 'Could not save zone.'); } finally { setSaving(false); }
  }

  function deleteZone(z) {
    Alert.alert('Delete zone?', `Delete "${z.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { const { error } = await supabase.from('zones').delete().eq('id', z.id); if (error) throw error; load(); }
        catch (e) { setErr(e.message || 'Could not delete.'); }
      } },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}><Ionicons name="map" size={20} color="#fff" /><Text style={styles.title}>Service Zones</Text></View>
          <Pressable style={styles.newBtn} onPress={openNew}><Text style={styles.newBtnText}>+ Add</Text></Pressable>
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <Text style={styles.intro}>Group your service area by ZIP and assign each zone its days. Used to batch bookings so your routes stay tight.</Text>

          {zones.length === 0 ? (
            <Text style={styles.empty}>No zones yet. Add your first area (e.g. "North side") and pick the days you run it.</Text>
          ) : zones.map((z) => (
            <View key={z.id} style={styles.card}>
              <View style={[styles.swatch, { backgroundColor: z.color || '#7c3aed' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.zName}>{z.name}</Text>
                <Text style={styles.zMeta}>
                  {z.days_of_week && z.days_of_week.length ? z.days_of_week.map((d) => DAY_LABELS[d]).join(', ') : 'No days set'} · {z.zips && z.zips.length ? `${z.zips.length} ZIP${z.zips.length === 1 ? '' : 's'}` : 'No ZIPs'}
                </Text>
                {z.zips && z.zips.length ? <Text style={styles.zZips} numberOfLines={1}>{z.zips.join(', ')}</Text> : null}
              </View>
              <Pressable onPress={() => openEdit(z)} hitSlop={6}><Ionicons name="create-outline" size={20} color={colors.primary} /></Pressable>
              <Pressable onPress={() => deleteZone(z)} hitSlop={6}><Ionicons name="trash-outline" size={19} color="#dc2626" /></Pressable>
            </View>
          ))}

          {zones.length > 0 ? (
            <Pressable style={styles.webBtn} onPress={() => openWeb('/zones')}>
              <Ionicons name="map-outline" size={16} color={colors.primaryDark} />
              <Text style={styles.webText}>See your coverage map on the web</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      {/* Create / edit modal */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{form.id ? 'Edit Zone' : 'New Zone'}</Text>

              <Text style={styles.label}>Zone name</Text>
              <TextInput style={styles.input} value={form.name} onChangeText={(v) => setF({ name: v })} placeholder="e.g. North side, The Valley, Downtown" placeholderTextColor={colors.textFaint} />

              <Text style={styles.label}>Color</Text>
              <View style={styles.swatchRow}>
                {COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setF({ color: c })} style={[styles.colorSwatch, { backgroundColor: c }, form.color === c && styles.colorSwatchOn]} />
                ))}
              </View>

              <Text style={styles.label}>Days served</Text>
              <View style={styles.chips}>
                {DAY_LABELS.map((lbl, d) => (
                  <Pressable key={d} style={[styles.chip, form.days_of_week.includes(d) && styles.chipOn]} onPress={() => toggleDay(d)}>
                    <Text style={[styles.chipText, form.days_of_week.includes(d) && styles.chipTextOn]}>{lbl}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>ZIP codes in this zone</Text>
              <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} value={form.zipsText} onChangeText={(v) => setF({ zipsText: v })} placeholder="77001, 77002, 77003…  (commas or spaces)" placeholderTextColor={colors.textFaint} multiline keyboardType="numbers-and-punctuation" />

              {err ? <Text style={styles.err}>{err}</Text> : null}
              <View style={styles.modalBtns}>
                <Pressable style={styles.cancelBtn} onPress={() => { setShowForm(false); setForm(EMPTY_FORM); setErr(''); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveZone} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Zone</Text>}
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
  err: { color: '#b91c1c', fontSize: 13, marginVertical: 8, textAlign: 'center' },
  intro: { fontSize: 13, color: colors.textMute, lineHeight: 19, marginBottom: 14 },
  empty: { textAlign: 'center', color: colors.textFaint, fontSize: 14, lineHeight: 20, marginTop: 20, paddingHorizontal: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 10, ...shadow },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  zName: { fontSize: 16, fontWeight: '800', color: colors.text },
  zMeta: { fontSize: 12, color: colors.textMute, marginTop: 2 },
  zZips: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  webBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primaryLight, borderRadius: 12, paddingVertical: 14, marginTop: 6 },
  webText: { color: colors.primaryDark, fontWeight: '800', fontSize: 15 },
  // modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '800', color: colors.textMute, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 30, height: 30, borderRadius: 7, borderWidth: 1, borderColor: '#e5e7eb' },
  colorSwatchOn: { borderWidth: 3, borderColor: '#111827' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  chipTextOn: { color: '#fff' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: '#fff' },
  cancelText: { color: colors.textMute, fontWeight: '800', fontSize: 14 },
  saveBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
