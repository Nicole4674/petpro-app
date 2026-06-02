import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hhmm(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}
function addMinutesToTime(d, minutes) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() + (minutes || 60));
  return x;
}
function prettyTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
function prettyDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function AddAppointmentScreen({ session, route, navigation }) {
  const params = route.params || {};
  // May arrive WITH a client (from a client's page) or WITHOUT one (from the
  // calendar's + Book button) — in which case we show a client picker first.
  const [clientId, setClientId] = useState(params.clientId || null);
  const [clientName, setClientName] = useState(params.clientName || '');

  const [clients, setClients] = useState([]);     // for the picker
  const [clientSearch, setClientSearch] = useState('');
  const [pets, setPets] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPets, setLoadingPets] = useState(false);
  const [err, setErr] = useState('');

  const [petId, setPetId] = useState(null);
  const [serviceId, setServiceId] = useState(null);
  const [staffId, setStaffId] = useState(null);
  const [when, setWhen] = useState(() => {
    // Prefill from the calendar slot if provided, else 9:00 AM today.
    const d = params.prefillDate ? new Date(`${params.prefillDate}T00:00:00`) : new Date();
    d.setHours(params.prefillHour != null ? params.prefillHour : 9, 0, 0, 0);
    return d;
  });
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { init(); }, []);

  // Services + staff load once. Then either load this client's pets, or the
  // client list for the picker.
  async function init() {
    setLoading(true);
    setErr('');
    try {
      const [{ data: s }, { data: st }] = await Promise.all([
        supabase.from('services').select('id, service_name, price, time_block_minutes').eq('groomer_id', session.user.id).order('service_name', { ascending: true }),
        supabase.from('staff_members').select('id, first_name, last_name, role').eq('groomer_id', session.user.id).eq('status', 'active').order('first_name', { ascending: true }),
      ]);
      setServices(s || []);
      setStaff(st || []);
      if (st && st.length === 1) setStaffId(st[0].id); // auto-pick lone groomer

      if (clientId) {
        await loadPets(clientId);
      } else {
        const { data: c } = await supabase.from('clients')
          .select('id, first_name, last_name')
          .eq('groomer_id', session.user.id)
          .or('is_active.is.null,is_active.eq.true')
          .order('first_name', { ascending: true });
        setClients(c || []);
      }
    } catch (e) {
      setErr(e.message || 'Could not load booking options.');
    } finally {
      setLoading(false);
    }
  }

  async function loadPets(cId) {
    setLoadingPets(true);
    try {
      const { data: p } = await supabase.from('pets').select('id, name').eq('client_id', cId)
        .or('is_archived.is.null,is_archived.eq.false')
        .or('is_memorial.is.null,is_memorial.eq.false')
        .order('created_at', { ascending: true });
      setPets(p || []);
      if (p && p.length === 1) setPetId(p[0].id); // auto-pick lone pet
    } catch (e) {
      setErr(e.message || 'Could not load this client’s pets.');
    } finally {
      setLoadingPets(false);
    }
  }

  function chooseClient(c) {
    setClientId(c.id);
    setClientName(`${c.first_name || ''} ${c.last_name || ''}`.trim());
    setPetId(null);
    setPets([]);
    loadPets(c.id);
  }

  function onDateChange(_e, selected) {
    setShowDate(false);
    if (selected) {
      const x = new Date(when);
      x.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setWhen(x);
    }
  }
  function onTimeChange(_e, selected) {
    setShowTime(false);
    if (selected) {
      const x = new Date(when);
      x.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setWhen(x);
    }
  }

  async function save() {
    setErr('');
    if (!clientId) { setErr('Pick a client.'); return; }
    if (!petId) { setErr('Pick a pet.'); return; }
    if (!serviceId) { setErr('Pick a service.'); return; }
    setSaving(true);
    try {
      const svc = services.find((s) => s.id === serviceId);
      const end = addMinutesToTime(when, svc ? svc.time_block_minutes : 60);
      const { error } = await supabase.from('appointments').insert({
        groomer_id: session.user.id,
        client_id: clientId,
        pet_id: petId,
        service_id: serviceId,
        appointment_date: isoDate(when),
        start_time: hhmm(when),
        end_time: hhmm(end),
        // Matches the website: new bookings start UNCONFIRMED so the client's
        // text reply (or a manual change) confirms them. Not auto-confirmed.
        status: 'unconfirmed',
        quoted_price: svc && svc.price != null ? svc.price : null,
        staff_id: staffId || null,
      });
      if (error) throw error;
      navigation.goBack(); // the screen we came from refetches on focus
    } catch (e) {
      setErr(e.message || 'Could not book the appointment.');
    } finally {
      setSaving(false);
    }
  }

  const filteredClients = clients.filter((c) => {
    const n = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
    return n.includes(clientSearch.trim().toLowerCase());
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Book Appointment</Text>
        <Text style={styles.sub}>{clientId ? `for ${clientName}` : 'Pick a client to start'}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
      ) : !clientId ? (
        // STEP 1 — choose a client
        <View style={{ flex: 1 }}>
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.search}
              placeholder="Search clients…"
              placeholderTextColor="#9ca3af"
              value={clientSearch}
              onChangeText={setClientSearch}
              autoCapitalize="words"
            />
          </View>
          <ScrollView contentContainerStyle={styles.scroll}>
            {filteredClients.length === 0 ? (
              <Text style={styles.muted}>No clients found.</Text>
            ) : (
              filteredClients.map((c) => (
                <Pressable key={c.id} style={({ pressed }) => [styles.clientRow, pressed && { opacity: 0.6 }]} onPress={() => chooseClient(c)}>
                  <Text style={styles.clientName}>{`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client'}</Text>
                  <Text style={styles.clientArrow}>›</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      ) : (
        // STEP 2 — booking details
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Chosen client (tap to change) */}
          <Pressable style={styles.chosenClient} onPress={() => { setClientId(null); setPetId(null); }}>
            <Text style={styles.chosenName}>{clientName}</Text>
            <Text style={styles.changeLink}>Change</Text>
          </Pressable>

          {/* Pet */}
          <Text style={styles.label}>Pet</Text>
          {loadingPets ? (
            <ActivityIndicator color="#7c3aed" />
          ) : pets.length === 0 ? (
            <Text style={styles.muted}>This client has no pets yet.</Text>
          ) : (
            <View style={styles.chips}>
              {pets.map((p) => (
                <Pressable key={p.id} style={[styles.chip, petId === p.id && styles.chipSel]} onPress={() => setPetId(p.id)}>
                  <Text style={[styles.chipText, petId === p.id && styles.chipTextSel]}>{p.name || 'Pet'}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Groomer / staff */}
          {staff.length > 0 ? (
            <>
              <Text style={styles.label}>Groomer</Text>
              <View style={styles.chips}>
                {staff.map((m) => {
                  const name = `${m.first_name || ''}${m.last_name ? ' ' + m.last_name.charAt(0) + '.' : ''}`.trim() || 'Staff';
                  return (
                    <Pressable key={m.id} style={[styles.chip, staffId === m.id && styles.chipSel]} onPress={() => setStaffId(m.id)}>
                      <Text style={[styles.chipText, staffId === m.id && styles.chipTextSel]}>{name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* Service */}
          <Text style={styles.label}>Service</Text>
          {services.length === 0 ? (
            <Text style={styles.muted}>No services set up yet (add them on the website).</Text>
          ) : (
            services.map((s) => (
              <Pressable key={s.id} style={[styles.serviceRow, serviceId === s.id && styles.serviceSel]} onPress={() => setServiceId(s.id)}>
                <Text style={[styles.serviceName, serviceId === s.id && { color: '#fff' }]}>{s.service_name}</Text>
                <Text style={[styles.servicePrice, serviceId === s.id && { color: '#ede9fe' }]}>
                  {s.price != null ? `$${parseFloat(s.price).toFixed(2)}` : ''}
                </Text>
              </Pressable>
            ))
          )}

          {/* Date & time */}
          <Text style={styles.label}>When</Text>
          <View style={styles.whenRow}>
            <Pressable style={styles.whenBtn} onPress={() => setShowDate(true)}>
              <Text style={styles.whenText}>{prettyDate(when)}</Text>
            </Pressable>
            <Pressable style={styles.whenBtn} onPress={() => setShowTime(true)}>
              <Text style={styles.whenText}>{prettyTime(when)}</Text>
            </Pressable>
          </View>
          {showDate ? <DateTimePicker value={when} mode="date" onChange={onDateChange} /> : null}
          {showTime ? <DateTimePicker value={when} mode="time" onChange={onTimeChange} /> : null}

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Book it</Text>}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f5f3ff' },
  header: { backgroundColor: '#5b21b6', paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  sub: { color: '#ddd6fe', fontSize: 14, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  muted: { color: '#9ca3af', fontSize: 14 },
  // Client picker
  searchWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  search: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, fontSize: 16, color: '#1f2937', borderWidth: 1, borderColor: '#e5e7eb' },
  clientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  clientName: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  clientArrow: { fontSize: 22, color: '#9ca3af', fontWeight: '700' },
  chosenClient: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ede9fe', borderRadius: 12, padding: 14, marginBottom: 4 },
  chosenName: { fontSize: 17, fontWeight: '800', color: '#5b21b6' },
  changeLink: { fontSize: 14, fontWeight: '700', color: '#7c3aed' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#fff', borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  chipSel: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  chipText: { color: '#374151', fontWeight: '700' },
  chipTextSel: { color: '#fff' },
  serviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  serviceSel: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  serviceName: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  servicePrice: { fontSize: 15, fontWeight: '800', color: '#16a34a' },
  whenRow: { flexDirection: 'row', gap: 10 },
  whenBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  whenText: { fontSize: 15, fontWeight: '800', color: '#5b21b6' },
  err: { color: '#b91c1c', fontSize: 14, marginTop: 16, textAlign: 'center' },
  saveBtn: { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
