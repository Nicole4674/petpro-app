import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TextInput, ActivityIndicator, FlatList, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

function initials(first, last) {
  return `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?';
}
function isoStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const NEW_DAYS = 30, LAPSED_DAYS = 60;
const CLOSED = ['cancelled', 'no_show', 'rescheduled', 'completed', 'checked_out'];
const DEAD = ['cancelled', 'no_show', 'rescheduled'];
const FILTER_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'balance', label: 'Owes' },
  { key: 'no_upcoming', label: 'No upcoming' },
  { key: 'has_upcoming', label: 'Upcoming' },
  { key: 'lapsed', label: 'Lapsed' },
  { key: 'new', label: 'New' },
  { key: 'vax', label: 'Vax due' },
  { key: 'inactive', label: 'Inactive' },
];

export default function ClientsScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [meta, setMeta] = useState({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
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
      const { data, error } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, email, is_active, created_at, pets(name)')
        .eq('groomer_id', session.user.id)
        .order('last_name', { ascending: true });
      if (error) throw error;
      setClients(data || []);
      fetchMeta();
    } catch (e) {
      setErr(e.message || 'Could not load clients.');
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }

  // Per-client meta: overdue / hasUpcoming / lastVisit / balance / vaxAlert
  async function fetchMeta() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = isoStr(today);
    const gid = session.user.id;
    const [{ data: appts }, { data: pays }, { data: petRows }] = await Promise.all([
      supabase.from('appointments').select('id, client_id, appointment_date, status, checked_out_at, quoted_price, final_price, discount_amount').eq('groomer_id', gid),
      supabase.from('payments').select('appointment_id, amount').eq('groomer_id', gid),
      supabase.from('pets').select('client_id, vaccination_expiry, is_archived').eq('groomer_id', gid),
    ]);
    const paidByAppt = {};
    (pays || []).forEach((p) => { paidByAppt[p.appointment_id] = (paidByAppt[p.appointment_id] || 0) + parseFloat(p.amount || 0); });
    const m = {};
    const ensure = (cid) => { if (!m[cid]) m[cid] = { overdue: false, hasUpcoming: false, lastVisit: null, balance: 0, vaxAlert: false }; return m[cid]; };
    (appts || []).forEach((a) => {
      if (!a.client_id || !a.appointment_date) return;
      const e = ensure(a.client_id);
      const d = a.appointment_date;
      const isOpen = a.checked_out_at == null && CLOSED.indexOf(a.status) === -1;
      if (isOpen && d < todayStr) e.overdue = true;
      if (isOpen && d >= todayStr) e.hasUpcoming = true;
      const served = DEAD.indexOf(a.status) === -1 && (a.checked_out_at != null || a.status === 'completed' || d < todayStr);
      if (served) {
        if (!e.lastVisit || d > e.lastVisit) e.lastVisit = d;
        const price = parseFloat(a.final_price != null ? a.final_price : (a.quoted_price || 0));
        const bal = price - parseFloat(a.discount_amount || 0) - (paidByAppt[a.id] || 0);
        if (bal > 0.01) e.balance += bal;
      }
    });
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    (petRows || []).forEach((p) => {
      if (!p.client_id || p.is_archived === true || !p.vaccination_expiry) return;
      if (new Date(p.vaccination_expiry) <= in30) ensure(p.client_id).vaxAlert = true;
    });
    setMeta(m);
  }

  function isNew(c) { return c.created_at && (Date.now() - new Date(c.created_at).getTime()) / 86400000 <= NEW_DAYS; }
  function isLapsed(c) {
    if (c.is_active === false) return false;
    const mm = meta[c.id];
    if (!mm || !mm.lastVisit) return false;
    return (Date.now() - new Date(mm.lastVisit + 'T00:00:00').getTime()) / 86400000 > LAPSED_DAYS;
  }
  function passes(c) {
    const mm = meta[c.id] || {};
    switch (filter) {
      case 'overdue': return !!mm.overdue;
      case 'balance': return (mm.balance || 0) > 0.01;
      case 'no_upcoming': return c.is_active !== false && !mm.hasUpcoming;
      case 'has_upcoming': return !!mm.hasUpcoming;
      case 'inactive': return c.is_active === false;
      case 'new': return isNew(c);
      case 'lapsed': return isLapsed(c);
      case 'vax': return !!mm.vaxAlert;
      default: return true;
    }
  }

  const counts = useMemo(() => ({
    overdue: clients.filter((c) => meta[c.id]?.overdue).length,
    balance: clients.filter((c) => (meta[c.id]?.balance || 0) > 0.01).length,
    no_upcoming: clients.filter((c) => c.is_active !== false && !meta[c.id]?.hasUpcoming).length,
    has_upcoming: clients.filter((c) => meta[c.id]?.hasUpcoming).length,
    inactive: clients.filter((c) => c.is_active === false).length,
    new: clients.filter(isNew).length,
    lapsed: clients.filter(isLapsed).length,
    vax: clients.filter((c) => meta[c.id]?.vaxAlert).length,
  }), [clients, meta]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/[^0-9]/g, '');
    return clients.filter((c) => {
      // Hide inactive unless the Inactive chip is selected
      if (c.is_active === false && filter !== 'inactive') return false;
      if (!passes(c)) return false;
      if (!q) return true;
      const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
      const phone = (c.phone || '');
      const email = (c.email || '').toLowerCase();
      const petNames = (c.pets || []).map((p) => (p.name || '').toLowerCase()).join(' ');
      const phoneMatch = qDigits.length >= 3 && phone.replace(/[^0-9]/g, '').includes(qDigits);
      return name.includes(q) || phoneMatch || phone.includes(q) || email.includes(q) || petNames.includes(q);
    });
  }, [clients, meta, search, filter]);

  function renderItem({ item }) {
    const petNames = (item.pets || []).map((p) => p.name).filter(Boolean).join(', ');
    const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unnamed';
    const mm = meta[item.id] || {};
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
        onPress={() => navigation.navigate('ClientDetail', { clientId: item.id, name: fullName })}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(item.first_name, item.last_name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{fullName}{item.is_active === false ? <Text style={styles.inactiveTag}>  · inactive</Text> : null}</Text>
          {petNames ? (
            <View style={styles.metaRow}><Ionicons name="paw" size={13} color={colors.primary} /><Text style={styles.pets} numberOfLines={1}>{petNames}</Text></View>
          ) : null}
          {item.phone ? (
            <View style={styles.metaRow}><Ionicons name="call-outline" size={13} color={colors.textMute} /><Text style={styles.phone}>{item.phone}</Text></View>
          ) : null}
          {/* status flags */}
          <View style={styles.flagRow}>
            {mm.overdue ? <View style={[styles.flag, { backgroundColor: '#fef3c7' }]}><Text style={[styles.flagText, { color: '#92400e' }]}>Overdue</Text></View> : null}
            {(mm.balance || 0) > 0.01 ? <View style={[styles.flag, { backgroundColor: '#fee2e2' }]}><Text style={[styles.flagText, { color: '#b91c1c' }]}>Owes ${mm.balance.toFixed(0)}</Text></View> : null}
            {mm.vaxAlert ? <View style={[styles.flag, { backgroundColor: '#ede9fe' }]}><Text style={[styles.flagText, { color: colors.primaryDark }]}>Vax due</Text></View> : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}>
            <Ionicons name="paw" size={22} color="#fff" />
            <Text style={styles.title}>Clients</Text>
          </View>
          <View style={styles.headBtns}>
            <Pressable style={({ pressed }) => [styles.massBtn, pressed && { opacity: 0.8 }]} onPress={() => navigation.navigate('MassText')}>
              <Ionicons name="megaphone-outline" size={16} color="#fff" /><Text style={styles.massBtnText}>Mass</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.8 }]} onPress={() => navigation.navigate('AddClient')}>
              <Ionicons name="add" size={18} color={colors.primaryDark} /><Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput style={styles.search} placeholder="Search name, phone, pet…" placeholderTextColor={colors.textFaint} value={search} onChangeText={setSearch} autoCapitalize="none" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTER_CHIPS.map((f) => {
            const n = counts[f.key];
            return (
              <Pressable key={f.key} style={[styles.filterChip, filter === f.key && styles.filterChipSel]} onPress={() => setFilter(f.key)}>
                <Text style={[styles.filterText, filter === f.key && styles.filterTextSel]}>{f.label}{n ? ` ${n}` : ''}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </GradientHeader>

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
          ListHeaderComponent={<Text style={styles.count}>{filtered.length} {filtered.length === 1 ? 'client' : 'clients'}</Text>}
          ListEmptyComponent={<Text style={styles.empty}>No clients match this filter.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 64, paddingBottom: 14, paddingHorizontal: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  headBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  massBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
  massBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  addBtnText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14 },
  search: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
  filterRow: { gap: 8, paddingTop: 12, paddingRight: 20 },
  filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)' },
  filterChipSel: { backgroundColor: '#fff' },
  filterText: { color: '#ede9fe', fontWeight: '700', fontSize: 13 },
  filterTextSel: { color: colors.primaryDark, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  count: { color: colors.textMute, fontSize: 13, marginBottom: 10, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 16, padding: 15, marginBottom: 10, ...shadow },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  name: { fontSize: 16, fontWeight: '800', color: colors.text },
  inactiveTag: { fontSize: 13, fontWeight: '600', color: colors.textFaint },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  pets: { fontSize: 13, color: colors.primary, fontWeight: '600', flexShrink: 1 },
  phone: { fontSize: 13, color: colors.textMute },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  flag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  flagText: { fontSize: 11, fontWeight: '800' },
  empty: { textAlign: 'center', color: colors.textMute, fontSize: 15, marginTop: 24 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
