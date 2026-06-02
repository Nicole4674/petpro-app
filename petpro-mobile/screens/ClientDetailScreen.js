import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { formatPetAge } from '../lib/petAge';
import { statusStyle } from '../lib/apptStatus';
import { colors } from '../lib/theme';

// Quick-action helpers — open the phone's native dialer / SMS / maps app
function callNumber(phone) { if (phone) Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`); }
function textNumber(phone) { if (phone) Linking.openURL(`sms:${phone.replace(/[^0-9+]/g, '')}`); }
function openMaps(address) {
  if (address) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`);
}
function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtApptDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtT(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hh = parseInt(h, 10);
  const ap = hh >= 12 ? 'PM' : 'AM';
  return `${hh % 12 || 12}:${m} ${ap}`;
}

export default function ClientDetailScreen({ session, route, navigation }) {
  const { clientId, name } = route.params;
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState(null);
  const [pets, setPets] = useState([]);
  const [appts, setAppts] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);
  // Refetch when returning (e.g. after booking a new appointment)
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load());
    return unsub;
  }, [navigation]);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const { data: c, error: cErr } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, email, address')
        .eq('id', clientId)
        .maybeSingle();
      if (cErr) throw cErr;
      setClient(c);

      const { data: p, error: pErr } = await supabase
        .from('pets')
        .select('id, name, breed, weight, age, sex')
        .eq('client_id', clientId)
        .or('is_archived.is.null,is_archived.eq.false')
        .or('is_memorial.is.null,is_memorial.eq.false')
        .order('created_at', { ascending: true });
      if (pErr) throw pErr;
      setPets(p || []);

      const { data: ap } = await supabase
        .from('appointments')
        .select('id, appointment_date, start_time, status, pets:pet_id(name), services:service_id(service_name)')
        .eq('client_id', clientId)
        .gte('appointment_date', isoToday())
        .neq('status', 'cancelled')
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true });
      setAppts(ap || []);
    } catch (e) {
      setErr(e.message || 'Could not load this client.');
    } finally {
      setLoading(false);
    }
  }

  const fullName = client
    ? `${client.first_name || ''} ${client.last_name || ''}`.trim()
    : name || 'Client';

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Clients</Text>
        </Pressable>
        <Text style={styles.title}>{fullName}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Contact */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Contact</Text>
            {client?.phone ? (
              <View style={styles.line}><Ionicons name="call-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{client.phone}</Text></View>
            ) : null}
            {client?.email ? (
              <View style={styles.line}><Ionicons name="mail-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{client.email}</Text></View>
            ) : null}
            {client?.address ? (
              <View style={styles.line}><Ionicons name="location-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{client.address}</Text></View>
            ) : null}
            {!client?.phone && !client?.email && !client?.address ? (
              <Text style={styles.muted}>No contact info on file.</Text>
            ) : null}

            {/* Quick actions */}
            {(client?.phone || client?.address) ? (
              <View style={styles.actions}>
                {client?.phone ? (
                  <Pressable style={styles.actionBtn} onPress={() => callNumber(client.phone)}>
                    <Ionicons name="call" size={16} color={colors.primaryDark} />
                    <Text style={styles.actionText}>Call</Text>
                  </Pressable>
                ) : null}
                {client?.phone ? (
                  <Pressable style={styles.actionBtn} onPress={() => textNumber(client.phone)}>
                    <Ionicons name="chatbubble" size={16} color={colors.primaryDark} />
                    <Text style={styles.actionText}>Text</Text>
                  </Pressable>
                ) : null}
                {client?.address ? (
                  <Pressable style={styles.actionBtn} onPress={() => openMaps(client.address)}>
                    <Ionicons name="navigate" size={16} color={colors.primaryDark} />
                    <Text style={styles.actionText}>Directions</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Pets */}
          <Text style={styles.section}>Pets ({pets.length})</Text>
          {pets.length === 0 ? (
            <Text style={styles.muted}>No pets added yet.</Text>
          ) : (
            pets.map((pet) => {
              const meta = [
                pet.breed,
                pet.weight ? `${pet.weight} lbs` : null,
                formatPetAge(pet.age),
                pet.sex,
              ].filter(Boolean).join(' · ');
              return (
                <Pressable
                  key={pet.id}
                  style={({ pressed }) => [styles.petCard, pressed && { opacity: 0.6 }]}
                  onPress={() => navigation.navigate('PetDetail', { petId: pet.id, name: pet.name })}
                >
                  <View style={styles.petIcon}><Ionicons name="paw" size={18} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.petName}>{pet.name || 'Unnamed pet'}</Text>
                    {meta ? <Text style={styles.petMeta}>{meta}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
                </Pressable>
              );
            })
          )}

          {/* Book a new appointment */}
          <Pressable
            style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.85 }]}
            onPress={() => navigation.navigate('AddAppointment', { clientId, clientName: fullName })}
          >
            <Ionicons name="add-circle-outline" size={18} color="#fff" />
            <Text style={styles.bookText}>Book Appointment</Text>
          </Pressable>

          {/* Upcoming appointments */}
          <Text style={styles.section}>Upcoming appointments ({appts.length})</Text>
          {appts.length === 0 ? (
            <Text style={styles.muted}>None scheduled.</Text>
          ) : (
            appts.map((a) => {
              const ss = statusStyle(a.status);
              return (
                <Pressable
                  key={a.id}
                  style={({ pressed }) => [styles.apptCard, pressed && { opacity: 0.6 }]}
                  onPress={() => navigation.navigate('AppointmentDetail', { apptId: a.id })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.apptDate}>{fmtApptDate(a.appointment_date)} · {fmtT(a.start_time)}</Text>
                    <Text style={styles.apptInfo}>
                      {(a.pets && a.pets.name) || 'Pet'}
                      {a.services && a.services.service_name ? ` · ${a.services.service_name}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: ss.bg }]}>
                    <Text style={[styles.badgeText, { color: ss.color }]}>{(ss.label || '').toUpperCase()}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lineText: { fontSize: 15, color: colors.text, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  actionText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  section: { fontSize: 13, fontWeight: '800', color: colors.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginLeft: 4 },
  petCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  petIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  petName: { fontSize: 16, fontWeight: '800', color: colors.text },
  petMeta: { fontSize: 13, color: colors.textMute, marginTop: 3 },
  muted: { color: colors.textFaint, fontSize: 14, marginLeft: 4 },
  apptCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  apptDate: { fontSize: 14, fontWeight: '800', color: colors.primary },
  apptInfo: { fontSize: 14, color: colors.text, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  bookBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.green, borderRadius: 12, paddingVertical: 14, marginTop: 4, marginBottom: 8 },
  bookText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
