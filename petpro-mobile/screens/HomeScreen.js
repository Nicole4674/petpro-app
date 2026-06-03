import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { supabase } from '../lib/supabase';
import { statusStyle, effectiveStatus } from '../lib/apptStatus';
import { shadow } from '../lib/theme';
// note: receives `navigation` so appointment cards can open the detail screen

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HomeScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [shopName, setShopName] = useState('');
  const [appts, setAppts] = useState([]);
  const [boarding, setBoarding] = useState([]);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load(refresh) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErr('');
    try {
      const userId = session.user.id;

      const { data: shop } = await supabase
        .from('shop_settings')
        .select('shop_name')
        .eq('groomer_id', userId)
        .maybeSingle();
      if (shop && shop.shop_name) setShopName(shop.shop_name);

      const { data: rows, error } = await supabase
        .from('appointments')
        .select('id, start_time, status, checked_in_at, checked_out_at, pets:pet_id(name), clients:client_id(first_name, last_name), services:service_id(service_name)')
        .eq('groomer_id', userId)
        .eq('appointment_date', todayIso())
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true });
      if (error) throw error;
      setAppts(rows || []);

      // Boarding happening today: checking in (start_date) or going home (end_date)
      const t = todayIso();
      const { data: b } = await supabase
        .from('boarding_reservations')
        .select('id, start_date, end_date, boarding_reservation_pets(pets:pet_id(name)), clients:client_id(first_name, last_name)')
        .eq('groomer_id', userId)
        .neq('status', 'cancelled')
        .or(`start_date.eq.${t},end_date.eq.${t}`);
      setBoarding(b || []);
    } catch (e) {
      setErr(e.message || 'Could not load your day.');
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.hi}>Welcome back 👋</Text>
        <Text style={styles.shop}>{shopName || 'Your shop'}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#7c3aed" colors={['#7c3aed']} />}
        >
          <View style={styles.countCard}>
            <Text style={styles.countNum}>{appts.length}</Text>
            <Text style={styles.countLabel}>
              {appts.length === 1 ? 'appointment today' : 'appointments today'}
            </Text>
          </View>

          {err ? <Text style={styles.err}>{err}</Text> : null}

          {appts.length === 0 && !err ? (
            <Text style={styles.empty}>Nothing on the books today. 🌤️</Text>
          ) : (
            appts.map((a) => (
              <Pressable
                key={a.id}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                onPress={() => navigation.navigate('AppointmentDetail', { apptId: a.id })}
              >
                <Text style={styles.time}>{fmtTime(a.start_time)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pet}>
                    {(a.pets && a.pets.name) || 'Pet'}
                    {a.clients ? ` · ${a.clients.first_name || ''} ${a.clients.last_name || ''}`.trimEnd() : ''}
                  </Text>
                  {a.services && a.services.service_name ? (
                    <Text style={styles.svc}>{a.services.service_name}</Text>
                  ) : null}
                  {a.status ? (() => { const es = statusStyle(effectiveStatus(a)); return (
                    <View style={[styles.statusPill, { backgroundColor: es.bg }]}>
                      <Text style={[styles.statusText, { color: es.color }]}>{es.label}</Text>
                    </View>
                  ); })() : null}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))
          )}

          {/* Boarding today */}
          {boarding.length > 0 ? (
            <>
              <Text style={styles.boardingHeading}>🛏️ Boarding today</Text>
              {boarding.map((b) => {
                const t = todayIso();
                const pets = (b.boarding_reservation_pets || [])
                  .map((bp) => bp.pets && bp.pets.name).filter(Boolean).join(', ') || 'Pet';
                const client = b.clients ? `${b.clients.first_name || ''} ${b.clients.last_name || ''}`.trim() : '';
                const inToday = b.start_date === t;
                const outToday = b.end_date === t;
                const tag = inToday && outToday ? 'in & out' : inToday ? 'checking in' : 'going home';
                return (
                  <View key={b.id} style={styles.boardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pet}>🐶 {pets}{client ? ` · ${client}` : ''}</Text>
                    </View>
                    <View style={[styles.boardTag, outToday && !inToday && styles.boardOut]}>
                      <Text style={[styles.boardTagText, outToday && !inToday && styles.boardOutText]}>{tag}</Text>
                    </View>
                  </View>
                );
              })}
            </>
          ) : null}

          <Pressable style={styles.refresh} onPress={load}>
            <Text style={styles.refreshText}>↻ Refresh</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f5f3ff' },
  header: { backgroundColor: '#5b21b6', paddingTop: 64, paddingBottom: 24, paddingHorizontal: 24 },
  hi: { color: '#ddd6fe', fontSize: 15 },
  shop: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  countCard: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 24, alignItems: 'center', marginBottom: 20, ...shadow },
  countNum: { fontSize: 48, fontWeight: '800', color: '#7c3aed' },
  countLabel: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, ...shadow },
  time: { fontSize: 14, fontWeight: '800', color: '#7c3aed', width: 78 },
  pet: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  svc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  chevron: { fontSize: 22, color: '#c4b5fd', fontWeight: '700' },
  statusPill: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
  statusText: { fontSize: 11, fontWeight: '800' },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 15, marginTop: 12 },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
  boardingHeading: { fontSize: 14, fontWeight: '800', color: '#5b21b6', marginTop: 12, marginBottom: 10, marginLeft: 4 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, ...shadow },
  boardTag: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  boardTagText: { color: '#166534', fontSize: 12, fontWeight: '800' },
  boardOut: { backgroundColor: '#fef3c7' },
  boardOutText: { color: '#92400e' },
  refresh: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  refreshText: { color: '#7c3aed', fontWeight: '700', fontSize: 14 },
});
