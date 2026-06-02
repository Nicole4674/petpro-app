import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { supabase } from '../lib/supabase';

const STATUS = {
  active: { label: 'Active', color: '#166534', bg: '#dcfce7' },
  inactive: { label: 'Inactive', color: '#6b7280', bg: '#f3f4f6' },
  invited: { label: 'Invited', color: '#92400e', bg: '#fef3c7' },
};

function initials(f, l) {
  return `${(f || '').charAt(0)}${(l || '').charAt(0)}`.toUpperCase() || '?';
}

export default function StaffScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load(refresh) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('id, first_name, last_name, role, status')
        .eq('groomer_id', session.user.id)
        .order('status', { ascending: true })
        .order('first_name', { ascending: true });
      if (error) throw error;
      setStaff(data || []);
    } catch (e) {
      setErr(e.message || 'Could not load staff.');
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ More</Text>
        </Pressable>
        <Text style={styles.title}>👥 Staff</Text>
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
          <Text style={styles.count}>{staff.length} {staff.length === 1 ? 'member' : 'members'}</Text>
          {staff.length === 0 ? (
            <Text style={styles.empty}>No staff yet. Add team members on the website.</Text>
          ) : (
            staff.map((m) => {
              const s = STATUS[m.status] || STATUS.inactive;
              return (
                <View key={m.id} style={styles.row}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{initials(m.first_name, m.last_name)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{`${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Staff'}</Text>
                    {m.role ? <Text style={styles.role}>{m.role}</Text> : null}
                  </View>
                  <View style={[styles.badge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text>
                  </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#7c3aed', fontWeight: '800', fontSize: 15 },
  name: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  role: { fontSize: 13, color: '#6b7280', marginTop: 2, textTransform: 'capitalize' },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 15, marginTop: 12 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
