import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function BoardingScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load(true));
    return unsub;
  }, [navigation]);

  async function load(refresh) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErr('');
    try {
      const today = iso(new Date());
      const { data, error } = await supabase
        .from('boarding_reservations')
        .select('id, start_date, end_date, status, boarding_reservation_pets(pets:pet_id(name)), clients:client_id(first_name, last_name)')
        .eq('groomer_id', session.user.id)
        .neq('status', 'cancelled')
        .gte('end_date', today)
        .order('start_date', { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(e.message || 'Could not load boarding.');
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }

  const todayStr = iso(new Date());

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}>
            <Ionicons name="bed" size={22} color="#fff" />
            <Text style={styles.title}>Boarding</Text>
          </View>
          <View style={styles.headBtns}>
            <Pressable style={({ pressed }) => [styles.calBtn, pressed && { opacity: 0.8 }]} onPress={() => navigation.navigate('BoardingCalendar')}>
              <Ionicons name="grid-outline" size={18} color="#fff" />
            </Pressable>
            <Pressable style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.8 }]} onPress={() => navigation.navigate('BookBoarding')}>
              <Ionicons name="add" size={16} color={colors.primaryDark} />
              <Text style={styles.bookBtnText}>Book</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          <Text style={styles.count}>{rows.length} {rows.length === 1 ? 'stay' : 'stays'} (active + upcoming)</Text>

          {rows.length === 0 ? (
            <Text style={styles.empty}>No boarding stays coming up.</Text>
          ) : (
            rows.map((r) => {
              const pets = (r.boarding_reservation_pets || [])
                .map((bp) => bp.pets && bp.pets.name).filter(Boolean).join(', ');
              const client = r.clients ? `${r.clients.first_name || ''} ${r.clients.last_name || ''}`.trim() : '';
              const here = r.start_date <= todayStr && r.end_date >= todayStr;
              return (
                <Pressable
                  key={r.id}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                  onPress={() => navigation.navigate('BoardingDetail', { reservationId: r.id })}
                >
                  <View style={styles.iconWrap}><Ionicons name="paw" size={18} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pet}>{pets || 'Pet'}{client ? ` · ${client}` : ''}</Text>
                    <Text style={styles.dates}>{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</Text>
                  </View>
                  {here ? (
                    <View style={styles.hereTag}><Text style={styles.hereText}>Here now</Text></View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
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
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  headBtns: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  bookBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  bookBtnText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  calBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  count: { color: colors.textMute, fontSize: 13, marginBottom: 12, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  iconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  pet: { fontSize: 15, fontWeight: '700', color: colors.text },
  dates: { fontSize: 13, color: colors.textMute, marginTop: 3 },
  hereTag: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  hereText: { color: '#166534', fontSize: 12, fontWeight: '800' },
  empty: { textAlign: 'center', color: colors.textMute, fontSize: 15, marginTop: 12 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
