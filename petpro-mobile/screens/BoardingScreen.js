import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { supabase } from '../lib/supabase';

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
        .gte('end_date', today) // active + upcoming only
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
          <Text style={styles.backText}>‹ More</Text>
        </Pressable>
        <Text style={styles.title}>🛏️ Boarding</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#7c3aed" colors={['#7c3aed']} />}
        >
          <Text style={styles.count}>{rows.length} {rows.length === 1 ? 'stay' : 'stays'} (active + upcoming)</Text>

          {rows.length === 0 ? (
            <Text style={styles.empty}>No boarding stays coming up. 🐾</Text>
          ) : (
            rows.map((r) => {
              const pets = (r.boarding_reservation_pets || [])
                .map((bp) => bp.pets && bp.pets.name).filter(Boolean).join(', ');
              const client = r.clients ? `${r.clients.first_name || ''} ${r.clients.last_name || ''}`.trim() : '';
              const here = r.start_date <= todayStr && r.end_date >= todayStr;
              return (
                <View key={r.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pet}>🐶 {pets || 'Pet'}{client ? ` · ${client}` : ''}</Text>
                    <Text style={styles.dates}>{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</Text>
                  </View>
                  {here ? (
                    <View style={styles.hereTag}><Text style={styles.hereText}>Here now</Text></View>
                  ) : null}
                </View>
              );
            })
          )}
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
  count: { color: '#6b7280', fontSize: 13, marginBottom: 12, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10 },
  pet: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  dates: { fontSize: 13, color: '#6b7280', marginTop: 3 },
  hereTag: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  hereText: { color: '#166534', fontSize: 12, fontWeight: '800' },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 15, marginTop: 12 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
