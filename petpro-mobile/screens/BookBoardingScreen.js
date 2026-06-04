import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hhmm(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}
function prettyDate(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
function prettyTime(d) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

export default function BookBoardingScreen({ session, navigation }) {
  const [clientId, setClientId] = useState(null);
  const [clientName, setClientName] = useState('');
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [pets, setPets] = useState([]);
  const [kennels, setKennels] = useState([]);
  const [loading, setLoading] = useState(true);

  const [petIds, setPetIds] = useState([]);
  const [kennelId, setKennelId] = useState(null);
  const [start, setStart] = useState(() => { const d = new Date(); d.setHours(8, 0, 0, 0); return d; });
  const [end, setEnd] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(17, 0, 0, 0); return d; });
  const [picker, setPicker] = useState(null); // 'sd' | 'st' | 'ed' | 'et' | null
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [occupied, setOccupied] = useState({}); // kennel_id -> true if booked for chosen dates

  useEffect(() => { init(); }, []);
  // Recompute which kennels are taken whenever the date range changes
  useEffect(() => { checkAvailability(); }, [start, end, clientId]);

  async function checkAvailability() {
    if (!clientId) return;
    const { data } = await supabase.from('boarding_reservations')
      .select('kennel_id, start_date, end_date')
      .eq('groomer_id', session.user.id).neq('status', 'cancelled')
      .lte('start_date', isoDate(end)).gte('end_date', isoDate(start));
    const taken = {};
    (data || []).forEach((r) => { if (r.kennel_id) taken[r.kennel_id] = true; });
    setOccupied(taken);
    // If the kennel we'd selected is now taken for these dates, clear it
    if (kennelId && taken[kennelId]) setKennelId(null);
  }

  async function init() {
    setLoading(true);
    try {
      const [{ data: c }, { data: k }] = await Promise.all([
        supabase.from('clients').select('id, first_name, last_name').eq('groomer_id', session.user.id).or('is_active.is.null,is_active.eq.true').order('first_name'),
        supabase.from('kennels').select('id, name').eq('groomer_id', session.user.id).order('name'),
      ]);
      setClients(c || []);
      setKennels(k || []);
    } catch (e) {
      setErr(e.message || 'Could not load options.');
    } finally {
      setLoading(false);
    }
  }

  async function chooseClient(c) {
    setClientId(c.id);
    setClientName(`${c.first_name || ''} ${c.last_name || ''}`.trim());
    setPetIds([]);
    const { data: p } = await supabase.from('pets').select('id, name').eq('client_id', c.id)
      .or('is_archived.is.null,is_archived.eq.false').or('is_memorial.is.null,is_memorial.eq.false');
    setPets(p || []);
  }
  function togglePet(id) {
    setPetIds((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  }

  function onPick(_e, sel) {
    const which = picker;
    setPicker(null);
    if (!sel) return;
    if (which === 'sd') { const x = new Date(start); x.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate()); setStart(x); }
    if (which === 'st') { const x = new Date(start); x.setHours(sel.getHours(), sel.getMinutes(), 0, 0); setStart(x); }
    if (which === 'ed') { const x = new Date(end); x.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate()); setEnd(x); }
    if (which === 'et') { const x = new Date(end); x.setHours(sel.getHours(), sel.getMinutes(), 0, 0); setEnd(x); }
  }

  async function save() {
    setErr('');
    if (!clientId) { setErr('Pick a client.'); return; }
    if (petIds.length === 0) { setErr('Pick at least one pet.'); return; }
    if (!kennelId) { setErr('Pick a kennel.'); return; }
    if (isoDate(end) < isoDate(start)) { setErr('End date is before start date.'); return; }
    setSaving(true);
    try {
      const { data: res, error } = await supabase.from('boarding_reservations').insert({
        groomer_id: session.user.id,
        client_id: clientId,
        kennel_id: kennelId,
        start_date: isoDate(start),
        start_time: hhmm(start),
        end_date: isoDate(end),
        end_time: hhmm(end),
        status: 'confirmed',
        notes: notes.trim() || null,
        total_price: parseFloat(price) || 0,
        created_by: session.user.id,
      }).select().single();
      if (error) throw error;
      const petRows = petIds.map((pid) => ({ reservation_id: res.id, pet_id: pid }));
      const { error: pErr } = await supabase.from('boarding_reservation_pets').insert(petRows);
      if (pErr) throw pErr;
      navigation.goBack();
    } catch (e) {
      setErr(e.message || 'Could not book the stay.');
    } finally {
      setSaving(false);
    }
  }

  const filteredClients = clients.filter((c) =>
    `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(clientSearch.trim().toLowerCase()));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Boarding</Text>
        </Pressable>
        <Text style={styles.title}>Book Stay</Text>
        <Text style={styles.sub}>{clientId ? `for ${clientName}` : 'Pick a client to start'}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : !clientId ? (
        <View style={{ flex: 1 }}>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput style={styles.search} placeholder="Search clients…" placeholderTextColor={colors.textFaint} value={clientSearch} onChangeText={setClientSearch} autoCapitalize="words" />
          </View>
          <ScrollView contentContainerStyle={styles.scroll}>
            {filteredClients.map((c) => (
              <Pressable key={c.id} style={({ pressed }) => [styles.clientRow, pressed && { opacity: 0.6 }]} onPress={() => chooseClient(c)}>
                <Text style={styles.clientRowName}>{`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client'}</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.chosenClient} onPress={() => { setClientId(null); setPetIds([]); }}>
            <Text style={styles.chosenName}>{clientName}</Text>
            <Text style={styles.changeLink}>Change</Text>
          </Pressable>

          <Text style={styles.label}>Pets</Text>
          <View style={styles.chips}>
            {pets.length === 0 ? <Text style={styles.muted}>This client has no pets.</Text> : null}
            {pets.map((p) => (
              <Pressable key={p.id} style={[styles.chip, petIds.includes(p.id) && styles.chipSel]} onPress={() => togglePet(p.id)}>
                <Text style={[styles.chipText, petIds.includes(p.id) && styles.chipTextSel]}>{p.name || 'Pet'}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Drop-off</Text>
          <View style={styles.whenRow}>
            <Pressable style={styles.whenBtn} onPress={() => setPicker('sd')}><Text style={styles.whenText}>{prettyDate(start)}</Text></Pressable>
            <Pressable style={styles.whenBtn} onPress={() => setPicker('st')}><Text style={styles.whenText}>{prettyTime(start)}</Text></Pressable>
          </View>
          <Text style={styles.label}>Pick-up</Text>
          <View style={styles.whenRow}>
            <Pressable style={styles.whenBtn} onPress={() => setPicker('ed')}><Text style={styles.whenText}>{prettyDate(end)}</Text></Pressable>
            <Pressable style={styles.whenBtn} onPress={() => setPicker('et')}><Text style={styles.whenText}>{prettyTime(end)}</Text></Pressable>
          </View>
          {picker === 'sd' ? <DateTimePicker value={start} mode="date" onChange={onPick} /> : null}
          {picker === 'st' ? <DateTimePicker value={start} mode="time" onChange={onPick} /> : null}
          {picker === 'ed' ? <DateTimePicker value={end} mode="date" onChange={onPick} /> : null}
          {picker === 'et' ? <DateTimePicker value={end} mode="time" onChange={onPick} /> : null}

          {/* Kennel availability for the chosen dates */}
          <Text style={styles.label}>Kennel — open for these dates</Text>
          {kennels.length === 0 ? <Text style={styles.muted}>No kennels set up (add them on the website).</Text> : (
            <View style={styles.kennelGrid}>
              {kennels.map((k) => {
                const busy = !!occupied[k.id];
                const sel = kennelId === k.id;
                return (
                  <Pressable
                    key={k.id}
                    disabled={busy}
                    style={[styles.kennelCard, busy && styles.kennelBusy, sel && styles.kennelSel]}
                    onPress={() => setKennelId(k.id)}
                  >
                    <Text style={[styles.kennelName, busy && { color: colors.textFaint }, sel && { color: '#fff' }]}>{k.name || 'Kennel'}</Text>
                    <View style={[styles.kennelTag, busy ? styles.tagBusy : styles.tagOpen]}>
                      <Text style={[styles.kennelTagText, { color: busy ? '#b91c1c' : '#166534' }]}>{busy ? 'Booked' : 'Open'}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={styles.label}>Total price</Text>
          <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.textFaint} />

          <Text style={styles.label}>Notes</Text>
          <TextInput style={[styles.input, styles.multiline]} value={notes} onChangeText={setNotes} placeholder="Anything to remember for this stay…" placeholderTextColor={colors.textFaint} multiline />

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Book stay</Text>}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  sub: { color: '#ddd6fe', fontSize: 14, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, margin: 16, marginBottom: 4, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text },
  clientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  clientRowName: { fontSize: 16, fontWeight: '700', color: colors.text },
  chosenClient: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: 12, padding: 14, marginBottom: 4 },
  chosenName: { fontSize: 17, fontWeight: '800', color: colors.primaryDark },
  changeLink: { fontSize: 14, fontWeight: '700', color: colors.primary },
  label: { fontSize: 13, fontWeight: '800', color: colors.textMute, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  muted: { color: colors.textFaint, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.card, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border },
  chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#374151', fontWeight: '700' },
  chipTextSel: { color: '#fff' },
  kennelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kennelCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  kennelSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  kennelBusy: { backgroundColor: '#f9fafb', opacity: 0.7 },
  kennelName: { fontSize: 14, fontWeight: '700', color: colors.text },
  kennelTag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagOpen: { backgroundColor: '#dcfce7' },
  tagBusy: { backgroundColor: '#fee2e2' },
  kennelTagText: { fontSize: 11, fontWeight: '800' },
  whenRow: { flexDirection: 'row', gap: 10 },
  whenBtn: { flex: 1, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  whenText: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  input: { backgroundColor: colors.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  err: { color: '#b91c1c', fontSize: 14, marginTop: 16, textAlign: 'center' },
  saveBtn: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
