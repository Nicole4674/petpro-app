import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TextInput, ActivityIndicator, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

function initials(first, last) {
  return `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?';
}

export default function ClientsScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);
  // Refetch when returning to this screen (e.g. after adding a client)
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load(true));
    return unsub;
  }, [navigation]);

  async function load(refresh) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, pets(name)')
        .eq('groomer_id', session.user.id)
        .or('is_active.is.null,is_active.eq.true')
        .order('last_name', { ascending: true });
      if (error) throw error;
      setClients(data || []);
    } catch (e) {
      setErr(e.message || 'Could not load clients.');
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }

  // Filter by name or phone as you type
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [clients, search]);

  function renderItem({ item }) {
    const petNames = (item.pets || []).map((p) => p.name).filter(Boolean).join(', ');
    const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unnamed';
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
        onPress={() => navigation.navigate('ClientDetail', { clientId: item.id, name: fullName })}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item.first_name, item.last_name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{fullName}</Text>
          {petNames ? (
            <View style={styles.metaRow}>
              <Ionicons name="paw" size={13} color={colors.primary} />
              <Text style={styles.pets} numberOfLines={1}>{petNames}</Text>
            </View>
          ) : null}
          {item.phone ? (
            <View style={styles.metaRow}>
              <Ionicons name="call-outline" size={13} color={colors.textMute} />
              <Text style={styles.phone}>{item.phone}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}>
            <Ionicons name="paw" size={22} color="#fff" />
            <Text style={styles.title}>Clients</Text>
          </View>
          <Pressable style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]} onPress={() => navigation.navigate('AddClient')}>
            <Ionicons name="add" size={18} color={colors.primaryDark} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            style={styles.search}
            placeholder="Search name or phone…"
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          ListHeaderComponent={
            <Text style={styles.count}>
              {filtered.length} {filtered.length === 1 ? 'client' : 'clients'}
              {search ? ' found' : ''}
            </Text>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{search ? 'No matches.' : 'No clients yet.'}</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 64, paddingBottom: 16, paddingHorizontal: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  addBtnText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14 },
  search: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  count: { color: colors.textMute, fontSize: 13, marginBottom: 10, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  name: { fontSize: 16, fontWeight: '800', color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  pets: { fontSize: 13, color: colors.primary, fontWeight: '600', flexShrink: 1 },
  phone: { fontSize: 13, color: colors.textMute },
  empty: { textAlign: 'center', color: colors.textMute, fontSize: 15, marginTop: 24 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
