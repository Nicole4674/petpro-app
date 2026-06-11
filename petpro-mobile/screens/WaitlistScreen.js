import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Modal, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

const STATUS = {
  waiting: { label: '⏳ Waiting', color: '#7c3aed' },
  notified: { label: '📲 Notified', color: '#f59e0b' },
  booked: { label: '✅ Booked', color: '#22c55e' },
  expired: { label: '⏰ Expired', color: '#9ca3af' },
  declined: { label: '❌ Declined', color: '#dc2626' },
  removed: { label: '🗑️ Removed', color: '#6b7280' },
};
const FILTERS = ['waiting', 'notified', 'booked', 'all'];
const DAYS = [
  { value: 'monday', label: 'Mon' }, { value: 'tuesday', label: 'Tue' }, { value: 'wednesday', label: 'Wed' },
  { value: 'thursday', label: 'Thu' }, { value: 'friday', label: 'Fri' }, { value: 'saturday', label: 'Sat' }, { value: 'sunday', label: 'Sun' },
];
const EMPTY = { client_id: '', pet_id: '', service_id: '', preferred_days: [], any_time: false, notes: '' };

function timeSince(s) {
  if (!s) return '';
  const diff = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (diff < 60) return diff + 'm ago';
  const h = Math.floor(diff / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

export default function WaitlistScreen({ session, navigation }) {
  const [waitlist, setWaitlist] = useState([]);
  const [clients, setClients] = useState([]);
  const [pets, setPets] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('waiting');
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [entry, setEntry] = useState(EMPTY);

  const gid = session.user.id;

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const [{ data: wl, error: e1 }, { data: cl }, { data: pt }, { data: sv }] = await Promise.all([
        supabase.from('grooming_waitlist').select('*, clients:client_id(first_name, last_name, phone), pets:pet_id(name, breed), services:service_id(service_name, price)').eq('groomer_id', gid).order('position', { ascending: true }),
        supabase.from('clients').select('id, first_name, last_name, phone').eq('groomer_id', gid).order('last_name'),
        supabase.from('pets').select('id, name, breed, client_id, is_archived').eq('groomer_id', gid).or('is_archived.is.null,is_archived.eq.false'),
        supabase.from('services').select('id, service_name, price').eq('groomer_id', gid).order('service_name'),
      ]);
      if (e1) throw e1;
      setWaitlist(wl || []); setClients(cl || []); setPets(pt || []); setServices(sv || []);
    } catch (e) { setErr(e.message || 'Could not load waitlist.'); } finally { setLoading(false); }
  }

  async function patch(id, fields) {
    try { const { error } = await supabase.from('grooming_waitlist').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id); if (error) throw error; load(); }
    catch (e) { setErr(e.message || 'Could not update.'); }
  }
  function notify(w) { patch(w.id, { status: 'notified', notified_at: new Date().toISOString() }); }
  function book(w) { patch(w.id, { status: 'booked' }); }
  function remove(w) {
    Alert.alert('Remove from waitlist?', `Remove ${w.pets ? w.pets.name : 'this pet'} from the waitlist?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => patch(w.id, { status: 'removed' }) },
    ]);
  }
  async function move(w, dir) {
    const waiting = waitlist.filter((x) => x.status === 'waiting');
    const idx = waiting.findIndex((x) => x.id === w.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= waiting.length) return;
    const other = waiting[swapIdx];
    try {
      await supabase.from('grooming_waitlist').update({ position: w.position }).eq('id', other.id);
      await supabase.from('grooming_waitlist').update({ position: other.position }).eq('id', w.id);
      load();
    } catch (e) { setErr(e.message || 'Could not reorder.'); }
  }

  function setE(p) { setEntry((x) => ({ ...x, ...p })); }
  function toggleDay(d) { setEntry((x) => ({ ...x, preferred_days: x.preferred_days.includes(d) ? x.preferred_days.filter((y) => y !== d) : x.preferred_days.concat(d) })); }
  function openAdd() { setEntry(EMPTY); setSearch(''); setShowAdd(true); }

  async function addEntry() {
    if (!entry.client_id) { setErr('Pick a client.'); return; }
    if (!entry.pet_id) { setErr('Pick a pet.'); return; }
    if (entry.preferred_days.length === 0) { setErr('Pick at least one day the client is available — Suds uses this to offer open slots.'); return; }
    setSaving(true); setErr('');
    try {
      const waitingCount = waitlist.filter((w) => w.status === 'waiting').length;
      const allDays = entry.preferred_days.length === 7;
      const record = {
        groomer_id: gid, client_id: entry.client_id, pet_id: entry.pet_id, position: waitingCount + 1, status: 'waiting',
        preferred_days: entry.preferred_days, flexible_dates: allDays, any_time: entry.any_time,
      };
      if (entry.service_id) record.service_id = entry.service_id;
      if (entry.notes.trim()) record.notes = entry.notes.trim();
      const { error } = await supabase.from('grooming_waitlist').insert([record]);
      if (error) throw error;
      setShowAdd(false); setEntry(EMPTY); setSearch(''); load();
    } catch (e) { setErr(e.message || 'Could not add to waitlist.'); } finally { setSaving(false); }
  }

  const filtered = waitlist.filter((w) => filter === 'all' || w.status === filter);
  const counts = { waiting: 0, notified: 0, booked: 0 };
  waitlist.forEach((w) => { if (counts[w.status] != null) counts[w.status]++; });
  const selClient = clients.find((c) => c.id === entry.client_id);
  const clientPets = pets.filter((p) => p.client_id === entry.client_id);
  const matches = search.trim()
    ? clients.filter((c) => { const q = search.toLowerCase().trim(); const n = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase(); const ph = (c.phone || '').replace(/\D/g, ''); return n.includes(q) || (q.replace(/\D/g, '') && ph.includes(q.replace(/\D/g, ''))); }).slice(0, 30)
    : [];

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}><Ionicons name="list" size={20} color="#fff" /><Text style={styles.title}>Waitlist</Text></View>
          <Pressable style={styles.newBtn} onPress={openAdd}><Text style={styles.newBtnText}>+ Add</Text></Pressable>
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {err ? <Text style={styles.err}>{err}</Text> : null}

          <View style={styles.stats}>
            <View style={styles.stat}><Text style={[styles.statNum, { color: '#7c3aed' }]}>{counts.waiting}</Text><Text style={styles.statLabel}>Waiting</Text></View>
            <View style={styles.stat}><Text style={[styles.statNum, { color: '#f59e0b' }]}>{counts.notified}</Text><Text style={styles.statLabel}>Notified</Text></View>
            <View style={styles.stat}><Text style={[styles.statNum, { color: '#22c55e' }]}>{counts.booked}</Text><Text style={styles.statLabel}>Booked</Text></View>
          </View>

          <View style={styles.tabs}>
            {FILTERS.map((s) => (
              <Pressable key={s} style={[styles.tab, filter === s && styles.tabOn]} onPress={() => setFilter(s)}>
                <Text style={[styles.tabText, filter === s && styles.tabTextOn]}>{s === 'all' ? 'All' : STATUS[s].label}</Text>
              </Pressable>
            ))}
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.empty}>{waitlist.length === 0 ? "Waitlist is empty. Add clients who want an earlier slot — they'll be first in line when a cancellation opens up." : 'No matches for this filter.'}</Text>
          ) : filtered.map((w, idx) => {
            const st = STATUS[w.status] || STATUS.waiting;
            const isWaiting = w.status === 'waiting';
            return (
              <View key={w.id} style={[styles.card, { borderLeftColor: st.color }, !isWaiting && { opacity: 0.85 }]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.petName}>{isWaiting ? <Text style={styles.pos}>#{idx + 1}  </Text> : null}🐾 {w.pets ? w.pets.name : 'Unknown'}</Text>
                    {w.pets && w.pets.breed ? <Text style={styles.breed}>{w.pets.breed}</Text> : null}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: st.color }]}><Text style={styles.statusText}>{st.label}</Text></View>
                </View>
                <Text style={styles.clientLine}>👤 {w.clients ? `${w.clients.first_name || ''} ${w.clients.last_name || ''}`.trim() : 'Unknown'}{w.clients && w.clients.phone ? ` · ${w.clients.phone}` : ''}</Text>
                <View style={styles.prefs}>
                  {w.preferred_days && w.preferred_days.length ? <Text style={styles.prefTag}>📅 {w.preferred_days.length === 7 ? 'Any day' : w.preferred_days.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')}</Text> : null}
                  <Text style={styles.prefTag}>🕐 {w.any_time ? 'Any time' : 'Flexible'}</Text>
                  {w.services ? <Text style={styles.prefTag}>✂️ {w.services.service_name}</Text> : null}
                </View>
                {w.notes ? <Text style={styles.note}>📝 {w.notes}</Text> : null}
                {w.notified_at ? <Text style={styles.notified}>📲 Notified {timeSince(w.notified_at)}</Text> : null}
                <Text style={styles.added}>Added {timeSince(w.created_at)}</Text>

                {isWaiting ? (
                  <View style={styles.actions}>
                    <Pressable style={styles.notifyBtn} onPress={() => notify(w)}><Text style={styles.notifyText}>📲 Notify</Text></Pressable>
                    <Pressable style={styles.bookBtn} onPress={() => book(w)}><Text style={styles.bookText}>✅ Book</Text></Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => move(w, -1)}><Ionicons name="chevron-up" size={18} color={colors.textMute} /></Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => move(w, 1)}><Ionicons name="chevron-down" size={18} color={colors.textMute} /></Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => remove(w)}><Ionicons name="trash-outline" size={17} color="#dc2626" /></Pressable>
                  </View>
                ) : w.status === 'notified' ? (
                  <View style={styles.actions}>
                    <Pressable style={styles.bookBtn} onPress={() => book(w)}><Text style={styles.bookText}>✅ Accepted</Text></Pressable>
                    <Pressable style={styles.declineBtn} onPress={() => remove(w)}><Text style={styles.declineText}>❌ Declined</Text></Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Add modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Add to Waitlist</Text>

              <Text style={styles.label}>Client</Text>
              {selClient ? (
                <View style={styles.selChip}>
                  <Text style={styles.selChipText}>👤 {selClient.first_name} {selClient.last_name}</Text>
                  <Pressable onPress={() => { setE({ client_id: '', pet_id: '' }); setSearch(''); }}><Ionicons name="close" size={18} color={colors.primaryDark} /></Pressable>
                </View>
              ) : (
                <>
                  <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="Search by name or phone…" placeholderTextColor={colors.textFaint} />
                  {matches.map((c) => (
                    <Pressable key={c.id} style={styles.clientRow} onPress={() => { setE({ client_id: c.id, pet_id: '' }); setSearch(''); }}>
                      <Text style={styles.clientName}>{c.first_name} {c.last_name}</Text>
                      {c.phone ? <Text style={styles.clientPhone}>{c.phone}</Text> : null}
                    </Pressable>
                  ))}
                </>
              )}

              {entry.client_id ? (
                <>
                  <Text style={styles.label}>Pet</Text>
                  <View style={styles.chips}>
                    {clientPets.length === 0 ? <Text style={styles.muted}>No active pets on file.</Text> : clientPets.map((p) => (
                      <Pressable key={p.id} style={[styles.chip, entry.pet_id === p.id && styles.chipOn]} onPress={() => setE({ pet_id: p.id })}>
                        <Text style={[styles.chipText, entry.pet_id === p.id && styles.chipTextOn]}>{p.name}{p.breed ? ` (${p.breed})` : ''}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.label}>Service (optional)</Text>
                  <View style={styles.chips}>
                    <Pressable style={[styles.chip, !entry.service_id && styles.chipOn]} onPress={() => setE({ service_id: '' })}>
                      <Text style={[styles.chipText, !entry.service_id && styles.chipTextOn]}>Any service</Text>
                    </Pressable>
                    {services.map((s) => (
                      <Pressable key={s.id} style={[styles.chip, entry.service_id === s.id && styles.chipOn]} onPress={() => setE({ service_id: s.id })}>
                        <Text style={[styles.chipText, entry.service_id === s.id && styles.chipTextOn]}>{s.service_name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <Text style={styles.label}>Preferred days (Suds offers slots on these)</Text>
              <View style={styles.chips}>
                {DAYS.map((d) => (
                  <Pressable key={d.value} style={[styles.chip, entry.preferred_days.includes(d.value) && styles.chipOn]} onPress={() => toggleDay(d.value)}>
                    <Text style={[styles.chipText, entry.preferred_days.includes(d.value) && styles.chipTextOn]}>{d.label}</Text>
                  </Pressable>
                ))}
                <Pressable style={[styles.chip, entry.preferred_days.length === 7 && styles.chipOn]} onPress={() => setE({ preferred_days: entry.preferred_days.length === 7 ? [] : DAYS.map((d) => d.value) })}>
                  <Text style={[styles.chipText, entry.preferred_days.length === 7 && styles.chipTextOn]}>⭐ Any day</Text>
                </Pressable>
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Any time works</Text>
                <Switch value={entry.any_time} onValueChange={(v) => setE({ any_time: v })} trackColor={{ true: colors.primary, false: '#d1d5db' }} thumbColor="#fff" />
              </View>

              <Text style={styles.label}>Notes</Text>
              <TextInput style={[styles.input, { minHeight: 56, textAlignVertical: 'top' }]} value={entry.notes} onChangeText={(v) => setE({ notes: v })} placeholder="Prefers mornings, needs a sanitary trim…" placeholderTextColor={colors.textFaint} multiline />

              {err ? <Text style={styles.err}>{err}</Text> : null}
              <View style={styles.modalBtns}>
                <Pressable style={styles.cancelBtn} onPress={() => { setShowAdd(false); setEntry(EMPTY); setErr(''); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={addEntry} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Add to Waitlist</Text>}
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
  stats: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 12, alignItems: 'center', ...shadow },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, color: colors.textMute, fontWeight: '700', marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  tab: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: '#fff' },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: colors.textMute },
  tabTextOn: { color: '#fff' },
  empty: { textAlign: 'center', color: colors.textFaint, fontSize: 14, lineHeight: 21, marginTop: 24, paddingHorizontal: 12 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 12, borderLeftWidth: 4, ...shadow },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pos: { color: colors.primary, fontWeight: '800' },
  petName: { fontSize: 16, fontWeight: '800', color: colors.text },
  breed: { fontSize: 12, color: colors.textMute, marginTop: 1 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  clientLine: { fontSize: 13, color: colors.textMute, marginTop: 8 },
  prefs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  prefTag: { fontSize: 12, color: colors.text, backgroundColor: '#f3f4f6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  note: { fontSize: 13, color: colors.textMute, marginTop: 8 },
  notified: { fontSize: 12, color: '#b45309', marginTop: 6 },
  added: { fontSize: 11, color: colors.textFaint, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  notifyBtn: { backgroundColor: '#fef3c7', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 14 },
  notifyText: { color: '#b45309', fontWeight: '800', fontSize: 13 },
  bookBtn: { backgroundColor: colors.green, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 14 },
  bookText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  declineBtn: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 14 },
  declineText: { color: '#dc2626', fontWeight: '800', fontSize: 13 },
  iconBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 9, backgroundColor: '#fff' },
  // modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '800', color: colors.textMute, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  selChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14 },
  selChipText: { color: colors.primaryDark, fontWeight: '700', fontSize: 15 },
  clientRow: { paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginTop: 6, backgroundColor: '#fff' },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clientPhone: { fontSize: 12, color: colors.textFaint, marginTop: 1 },
  muted: { color: colors.textFaint, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13, backgroundColor: '#fff' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  chipTextOn: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  switchLabel: { fontSize: 14, color: colors.text, fontWeight: '600' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: '#fff' },
  cancelText: { color: colors.textMute, fontWeight: '800', fontSize: 14 },
  saveBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
