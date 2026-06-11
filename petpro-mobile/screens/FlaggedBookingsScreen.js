import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

const FILTERS = [
  { key: 'pending', label: 'Needs Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'disapproved', label: 'Declined' },
  { key: 'all', label: 'All' },
];
const LEVEL = {
  danger: { emoji: '🛑', color: '#dc2626', bg: '#fee2e2' },
  warning: { emoji: '⚠️', color: '#b45309', bg: '#fef3c7' },
  info: { emoji: 'ℹ️', color: '#1d4ed8', bg: '#dbeafe' },
};

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hr} ${ampm}` : `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}
function fmtDate(s) { if (!s) return ''; const [y, m, d] = s.split('-'); return `${parseInt(m)}/${parseInt(d)}/${y}`; }
function parseFlags(fd) { try { return JSON.parse(fd) || []; } catch { return []; } }

export default function FlaggedBookingsScreen({ session, navigation }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true); setErr('');
    try {
      let q = supabase.from('appointments')
        .select('*, clients:client_id(first_name, last_name, phone), pets:pet_id(name, breed, weight), services:service_id(service_name)')
        .eq('groomer_id', session.user.id).eq('has_flags', true)
        .order('appointment_date', { ascending: true }).order('start_time', { ascending: true });
      if (filter !== 'all') q = q.eq('flag_status', filter);
      const { data, error } = await q;
      if (error) throw error;
      setAppointments(data || []);
    } catch (e) { setErr(e.message || 'Could not load flagged bookings.'); } finally { setLoading(false); }
  }

  async function setStatus(id, newStatus) {
    try {
      const patch = { flag_status: newStatus };
      if (newStatus === 'disapproved') patch.status = 'cancelled';
      const { error } = await supabase.from('appointments').update(patch).eq('id', id);
      if (error) throw error;
      load();
    } catch (e) { setErr(e.message || 'Could not update.'); }
  }

  function decline(id) {
    Alert.alert('Decline booking?', 'This cancels the appointment and frees up the slot.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => setStatus(id, 'disapproved') },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleWrap}><Ionicons name="flag" size={20} color="#fff" /><Text style={styles.title}>Flagged Bookings</Text></View>
      </GradientHeader>

      <View style={styles.tabs}>
        {FILTERS.map((f) => (
          <Pressable key={f.key} style={[styles.tab, filter === f.key && styles.tabOn]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.tabText, filter === f.key && styles.tabTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <Text style={styles.count}>{appointments.length} {filter === 'all' ? 'flagged' : FILTERS.find((f) => f.key === filter).label.toLowerCase()} appointment{appointments.length !== 1 ? 's' : ''}</Text>

          {appointments.length === 0 ? (
            <Text style={styles.empty}>{filter === 'pending' ? 'No bookings need review right now! 🎉' : 'No flagged bookings in this category.'}</Text>
          ) : appointments.map((a) => {
            const flags = parseFlags(a.flag_details);
            const counts = { danger: 0, warning: 0, info: 0 };
            flags.forEach((f) => { if (counts[f.level] != null) counts[f.level]++; });
            const topColor = counts.danger ? '#dc2626' : counts.warning ? '#f59e0b' : '#2563eb';
            return (
              <View key={a.id} style={[styles.card, { borderLeftColor: topColor }]}>
                <Pressable onPress={() => navigation.navigate('Schedule', { screen: 'AppointmentDetail', params: { apptId: a.id } })}>
                  <View style={styles.cardHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.petName}>{a.pets && a.pets.name}</Text>
                      <Text style={styles.breed}>{a.pets && a.pets.breed}{a.pets && a.pets.weight ? ` · ${a.pets.weight} lbs` : ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.date}>{fmtDate(a.appointment_date)}</Text>
                      <Text style={styles.time}>{fmtTime(a.start_time)}{a.end_time ? `–${fmtTime(a.end_time)}` : ''}</Text>
                    </View>
                  </View>
                  <Text style={styles.detailRow}>
                    {a.clients ? `${a.clients.first_name || ''} ${a.clients.last_name || ''}`.trim() : ''}
                    {a.services && a.services.service_name ? ` · ${a.services.service_name}` : ''}
                    {a.quoted_price ? ` · $${parseFloat(a.quoted_price).toFixed(2)}` : ''}
                  </Text>

                  <View style={styles.flags}>
                    {flags.map((f, i) => {
                      const lv = LEVEL[f.level] || LEVEL.info;
                      return (
                        <View key={i} style={[styles.flag, { backgroundColor: lv.bg }]}>
                          <Text style={[styles.flagLevel, { color: lv.color }]}>{lv.emoji} {String(f.level).toUpperCase()}</Text>
                          <Text style={styles.flagMsg}>{f.message}</Text>
                        </View>
                      );
                    })}
                  </View>
                </Pressable>

                {a.flag_status === 'pending' ? (
                  <View style={styles.actions}>
                    <Pressable style={styles.approveBtn} onPress={() => setStatus(a.id, 'approved')}><Text style={styles.approveText}>Approve</Text></Pressable>
                    <Pressable style={styles.declineBtn} onPress={() => decline(a.id)}><Text style={styles.declineText}>Decline</Text></Pressable>
                  </View>
                ) : (
                  <View style={styles.actions}>
                    <Text style={[styles.reviewed, { color: a.flag_status === 'approved' ? colors.green : '#dc2626' }]}>
                      {a.flag_status === 'approved' ? '✓ Approved' : '✕ Declined'}
                    </Text>
                    <Pressable style={styles.undoBtn} onPress={() => setStatus(a.id, 'pending')}><Text style={styles.undoText}>Undo</Text></Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap' },
  tab: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: '#fff' },
  tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.textMute },
  tabTextOn: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingTop: 4, paddingBottom: 50 },
  err: { color: '#b91c1c', fontSize: 13, marginVertical: 8, textAlign: 'center' },
  count: { fontSize: 13, fontWeight: '700', color: colors.textMute, marginBottom: 12 },
  empty: { textAlign: 'center', color: colors.textFaint, fontSize: 15, lineHeight: 22, marginTop: 30, paddingHorizontal: 12 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 12, borderLeftWidth: 4, ...shadow },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  petName: { fontSize: 17, fontWeight: '800', color: colors.text },
  breed: { fontSize: 13, color: colors.textMute, marginTop: 1 },
  date: { fontSize: 13, fontWeight: '700', color: colors.text },
  time: { fontSize: 12, color: colors.textMute, marginTop: 1 },
  detailRow: { fontSize: 13, color: colors.textMute, marginTop: 8 },
  flags: { marginTop: 10, gap: 6 },
  flag: { borderRadius: 8, padding: 9 },
  flagLevel: { fontSize: 11, fontWeight: '800', marginBottom: 2 },
  flagMsg: { fontSize: 13, color: colors.text, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  approveBtn: { flex: 1, backgroundColor: colors.green, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  approveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  declineText: { color: '#dc2626', fontWeight: '800', fontSize: 14 },
  reviewed: { flex: 1, fontSize: 14, fontWeight: '800' },
  undoBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18, backgroundColor: '#fff' },
  undoText: { color: colors.textMute, fontWeight: '800', fontSize: 13 },
});
