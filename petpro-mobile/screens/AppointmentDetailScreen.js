import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { formatPetAge } from '../lib/petAge';

function callNumber(p) { if (p) Linking.openURL(`tel:${p.replace(/[^0-9+]/g, '')}`); }
function textNumber(p) { if (p) Linking.openURL(`sms:${p.replace(/[^0-9+]/g, '')}`); }

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  // iso = "YYYY-MM-DD"; build a local date so it doesn't shift a day
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function price(a) {
  const p = a.final_price != null ? a.final_price
    : a.quoted_price != null ? a.quoted_price
    : (a.services && a.services.price != null ? a.services.price : null);
  if (p == null) return null;
  const n = parseFloat(p);
  return isNaN(n) ? null : n;
}

const STATUS_COLORS = {
  unconfirmed: '#f59e0b', confirmed: '#2563eb', scheduled: '#7c3aed', checked_in: '#16a34a',
  in_progress: '#f59e0b', completed: '#22c55e', no_show: '#6b7280', pending: '#f59e0b',
};

export default function AppointmentDetailScreen({ route, navigation }) {
  const { apptId } = route.params;
  const [loading, setLoading] = useState(true);
  const [a, setA] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, start_time, end_time, status, checked_in_at, quoted_price, final_price, service_notes, pets:pet_id(name, breed, weight, age), clients:client_id(first_name, last_name, phone), services:service_id(service_name, price)')
        .eq('id', apptId)
        .maybeSingle();
      if (error) throw error;
      setA(data);
    } catch (e) {
      setErr(e.message || 'Could not load this appointment.');
    } finally {
      setLoading(false);
    }
  }

  async function confirmAppt() {
    setSaving(true);
    setErr('');
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', apptId);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e.message || 'Could not confirm.');
    } finally {
      setSaving(false);
    }
  }

  async function checkIn() {
    setSaving(true);
    setErr('');
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ checked_in_at: new Date().toISOString(), status: 'checked_in' })
        .eq('id', apptId);
      if (error) throw error;
      await load(); // refetch so the screen reflects the new status
    } catch (e) {
      setErr(e.message || 'Could not check in.');
    } finally {
      setSaving(false);
    }
  }

  const pet = a && a.pets;
  const client = a && a.clients;
  const p = a ? price(a) : null;
  const status = a && a.status;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Appointment</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : !a ? (
        <Text style={styles.err}>Appointment not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Pet + client */}
          <View style={styles.card}>
            <Text style={styles.pet}>🐶 {(pet && pet.name) || 'Pet'}</Text>
            {client ? (
              <Text style={styles.client}>{`${client.first_name || ''} ${client.last_name || ''}`.trim()}</Text>
            ) : null}
            {client && client.phone ? <Text style={styles.line}>📞 {client.phone}</Text> : null}
            {pet ? (
              <Text style={styles.line}>
                {[pet.breed, pet.weight ? `${pet.weight} lbs` : null, formatPetAge(pet.age)].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {client && client.phone ? (
              <View style={styles.actions}>
                <Pressable style={styles.actionBtn} onPress={() => callNumber(client.phone)}>
                  <Text style={styles.actionText}>Call</Text>
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => textNumber(client.phone)}>
                  <Text style={styles.actionText}>Text</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* When + what */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Details</Text>
            <Text style={styles.line}>📅 {fmtDate(a.appointment_date)}</Text>
            <Text style={styles.line}>🕒 {fmtTime(a.start_time)}{a.end_time ? ` – ${fmtTime(a.end_time)}` : ''}</Text>
            {a.services && a.services.service_name ? (
              <Text style={styles.line}>✂️ {a.services.service_name}</Text>
            ) : null}
            {p != null ? <Text style={styles.line}>💲 ${p.toFixed(2)}</Text> : null}
            {status ? (
              <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[status] || '#6b7280') + '22' }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLORS[status] || '#6b7280' }]}>
                  {String(status).replace(/_/g, ' ')}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Confirm action — only while unconfirmed */}
          {a.status === 'unconfirmed' ? (
            <Pressable
              style={[styles.confirmBtn, saving && { opacity: 0.6 }]}
              onPress={confirmAppt}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>✓ Confirm appointment</Text>}
            </Pressable>
          ) : null}

          {/* Check In action */}
          {a.checked_in_at ? (
            <View style={styles.checkedIn}>
              <Text style={styles.checkedInText}>✓ Checked in at {fmtTime(new Date(a.checked_in_at).toTimeString().slice(0, 8))}</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.checkInBtn, saving && { opacity: 0.6 }]}
              onPress={checkIn}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.checkInText}>✓ Check In</Text>}
            </Pressable>
          )}

          {/* Notes */}
          {a.service_notes ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notes</Text>
              <Text style={styles.notes}>{a.service_notes}</Text>
            </View>
          ) : null}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  pet: { fontSize: 20, fontWeight: '800', color: '#1f2937' },
  client: { fontSize: 16, color: '#374151', marginTop: 2 },
  line: { fontSize: 15, color: '#1f2937', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { backgroundColor: '#ede9fe', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  actionText: { color: '#6d28d9', fontWeight: '800', fontSize: 14 },
  notes: { fontSize: 15, color: '#374151', lineHeight: 21 },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 12 },
  badgeText: { fontSize: 13, fontWeight: '800', textTransform: 'capitalize' },
  confirmBtn: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 12 },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  checkInBtn: { backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 16 },
  checkInText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  checkedIn: { backgroundColor: '#dcfce7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#86efac' },
  checkedInText: { color: '#166534', fontSize: 15, fontWeight: '800' },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
