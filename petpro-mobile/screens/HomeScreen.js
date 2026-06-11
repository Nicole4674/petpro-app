import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { statusStyle, effectiveStatus } from '../lib/apptStatus';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

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
  const [flagged, setFlagged] = useState(0);
  const [waiting, setWaiting] = useState(0);
  const [revenueToday, setRevenueToday] = useState(0);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const gid = session.user.id;

  useEffect(() => { load(); }, []);
  useEffect(() => { const unsub = navigation.addListener('focus', () => load(true)); return unsub; }, [navigation]);

  async function load(refresh) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErr('');
    try {
      const t = todayIso();
      const startIso = new Date(t + 'T00:00:00').toISOString();
      const endIso = new Date(t + 'T23:59:59').toISOString();
      const [{ data: shop }, { data: rows, error }, { data: b }, flagCount, waitCount, { data: pays }] = await Promise.all([
        supabase.from('shop_settings').select('shop_name').eq('groomer_id', gid).maybeSingle(),
        supabase.from('appointments').select('id, start_time, status, checked_in_at, checked_out_at, pets:pet_id(name), clients:client_id(first_name, last_name), services:service_id(service_name)').eq('groomer_id', gid).eq('appointment_date', t).neq('status', 'cancelled').order('start_time', { ascending: true }),
        supabase.from('boarding_reservations').select('id, start_date, end_date, boarding_reservation_pets(pets:pet_id(name)), clients:client_id(first_name, last_name)').eq('groomer_id', gid).neq('status', 'cancelled').or(`start_date.eq.${t},end_date.eq.${t}`),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('groomer_id', gid).eq('has_flags', true).eq('flag_status', 'pending'),
        supabase.from('grooming_waitlist').select('id', { count: 'exact', head: true }).eq('groomer_id', gid).eq('status', 'waiting'),
        supabase.from('payments').select('amount, tip_amount, refunded_amount').eq('groomer_id', gid).gte('created_at', startIso).lte('created_at', endIso),
      ]);
      if (error) throw error;
      if (shop && shop.shop_name) setShopName(shop.shop_name);
      setAppts(rows || []);
      setBoarding(b || []);
      setFlagged(flagCount.count || 0);
      setWaiting(waitCount.count || 0);
      let rev = 0;
      (pays || []).forEach((p) => { rev += (parseFloat(p.amount || 0) + parseFloat(p.tip_amount || 0) - parseFloat(p.refunded_amount || 0)); });
      setRevenueToday(rev);
    } catch (e) { setErr(e.message || 'Could not load your day.'); } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }

  const checkedIn = appts.filter((a) => a.checked_in_at).length;
  const stats = [
    { label: 'Today', value: appts.length, icon: 'calendar', color: colors.primary, onPress: () => navigation.navigate('Schedule') },
    { label: 'Revenue today', value: `$${revenueToday.toFixed(0)}`, icon: 'cash', color: colors.green, onPress: () => navigation.navigate('More', { screen: 'Analytics' }) },
    { label: 'Needs review', value: flagged, icon: 'flag', color: flagged > 0 ? '#dc2626' : colors.primary, onPress: () => navigation.navigate('More', { screen: 'FlaggedBookings' }) },
    { label: 'Checked in', value: checkedIn, icon: 'checkmark-circle', color: '#16a34a', onPress: () => navigation.navigate('Schedule') },
    { label: 'Waitlist', value: waiting, icon: 'list', color: '#f59e0b', onPress: () => navigation.navigate('More', { screen: 'Waitlist' }) },
    { label: 'Boarding', value: boarding.length, icon: 'bed', color: '#0891b2', onPress: () => navigation.navigate('More', { screen: 'Boarding' }) },
  ];

  const actions = [
    { label: 'Book', icon: 'add-circle', onPress: () => navigation.navigate('Schedule', { screen: 'AddAppointment', params: { prefillDate: todayIso() } }) },
    { label: 'Ask Suds', icon: 'sparkles', onPress: () => navigation.navigate('More', { screen: 'Suds' }) },
    { label: 'Clients', icon: 'people', onPress: () => navigation.navigate('Clients') },
    { label: 'Sell', icon: 'pricetags', onPress: () => navigation.navigate('More', { screen: 'Sell' }) },
    { label: 'Balances', icon: 'cash', onPress: () => navigation.navigate('More', { screen: 'Balances' }) },
    { label: 'Messages', icon: 'chatbubbles', onPress: () => navigation.navigate('Messages') },
    { label: 'Boarding', icon: 'bed', onPress: () => navigation.navigate('More', { screen: 'Boarding' }) },
    { label: 'More', icon: 'ellipsis-horizontal', onPress: () => navigation.navigate('More') },
  ];

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Text style={styles.hi}>Welcome back 👋</Text>
        <Text style={styles.shop}>{shopName || 'Your shop'}</Text>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} colors={[colors.primary]} />}>
          {err ? <Text style={styles.err}>{err}</Text> : null}

          {/* Stat tiles */}
          <View style={styles.statGrid}>
            {stats.map((s) => (
              <Pressable key={s.label} style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.7 }]} onPress={s.onPress}>
                <View style={styles.statTop}>
                  <Ionicons name={s.icon} size={18} color={s.color} />
                  <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                </View>
                <Text style={styles.statLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Quick actions */}
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.actionGrid}>
            {actions.map((a) => (
              <Pressable key={a.label} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]} onPress={a.onPress}>
                <View style={styles.actionIcon}><Ionicons name={a.icon} size={22} color={colors.primary} /></View>
                <Text style={styles.actionLabel}>{a.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Today's schedule */}
          <Text style={styles.sectionTitle}>Today's schedule</Text>
          {appts.length === 0 ? (
            <Text style={styles.empty}>Nothing on the books today. 🌤️</Text>
          ) : appts.map((a) => {
            const es = statusStyle(effectiveStatus(a));
            return (
              <Pressable key={a.id} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} onPress={() => navigation.navigate('AppointmentDetail', { apptId: a.id })}>
                <Text style={styles.time}>{fmtTime(a.start_time)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pet}>{(a.pets && a.pets.name) || 'Pet'}{a.clients ? ` · ${a.clients.first_name || ''} ${a.clients.last_name || ''}`.trimEnd() : ''}</Text>
                  {a.services && a.services.service_name ? <Text style={styles.svc}>{a.services.service_name}</Text> : null}
                  <View style={[styles.statusPill, { backgroundColor: es.bg }]}><Text style={[styles.statusText, { color: es.color }]}>{es.label}</Text></View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#c4b5fd" />
              </Pressable>
            );
          })}

          {/* Boarding today */}
          {boarding.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>🛏️ Boarding today</Text>
              {boarding.map((b) => {
                const t = todayIso();
                const pets = (b.boarding_reservation_pets || []).map((bp) => bp.pets && bp.pets.name).filter(Boolean).join(', ') || 'Pet';
                const client = b.clients ? `${b.clients.first_name || ''} ${b.clients.last_name || ''}`.trim() : '';
                const inToday = b.start_date === t, outToday = b.end_date === t;
                const tag = inToday && outToday ? 'in & out' : inToday ? 'checking in' : 'going home';
                return (
                  <Pressable key={b.id} style={({ pressed }) => [styles.boardRow, pressed && { opacity: 0.6 }]} onPress={() => navigation.navigate('More', { screen: 'BoardingDetail', params: { reservationId: b.id } })}>
                    <Text style={styles.pet}>🐶 {pets}{client ? ` · ${client}` : ''}</Text>
                    <View style={[styles.boardTag, outToday && !inToday && styles.boardOut]}>
                      <Text style={[styles.boardTagText, outToday && !inToday && styles.boardOutText]}>{tag}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 64, paddingBottom: 22, paddingHorizontal: 24 },
  hi: { color: '#ddd6fe', fontSize: 15 },
  shop: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCard: { width: '47.5%', backgroundColor: colors.card, borderRadius: 14, padding: 14, ...shadow },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 13, color: colors.textMute, fontWeight: '700', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 10 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { width: '22%', alignItems: 'center' },
  actionIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow },
  actionLabel: { fontSize: 12, color: colors.textMute, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, ...shadow },
  time: { fontSize: 14, fontWeight: '800', color: colors.primary, width: 78 },
  pet: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  svc: { fontSize: 13, color: colors.textMute, marginTop: 2 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
  statusText: { fontSize: 11, fontWeight: '800' },
  empty: { textAlign: 'center', color: colors.textMute, fontSize: 15, marginVertical: 10 },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, ...shadow },
  boardTag: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  boardTagText: { color: '#166534', fontSize: 12, fontWeight: '800' },
  boardOut: { backgroundColor: '#fef3c7' },
  boardOutText: { color: '#92400e' },
});
