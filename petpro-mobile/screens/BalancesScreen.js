import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, RefreshControl, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

function money(v) { return `$${(parseFloat(v) || 0).toFixed(2)}`; }
function fmtDate(s) { if (!s) return '—'; return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtLastPaid(ts) { if (!ts) return 'Never paid'; return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function daysSince(s) { if (!s) return 0; const d = new Date(s + 'T00:00:00'); const now = new Date(); now.setHours(0, 0, 0, 0); return Math.floor((now - d) / 86400000); }

export default function BalancesScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balances, setBalances] = useState([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [clientCount, setClientCount] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);
  useEffect(() => { const unsub = navigation.addListener('focus', () => load(true)); return unsub; }, [navigation]);

  async function load(refresh) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErr('');
    try {
      const { data: appts, error } = await supabase.from('appointments')
        .select('id, status, appointment_date, start_time, quoted_price, final_price, discount_amount, checked_out_at, clients:client_id(id, first_name, last_name, phone), pets:pet_id(id, name, breed, is_archived), services:service_id(service_name)')
        .eq('groomer_id', session.user.id)
        .not('status', 'in', '(cancelled,no_show,rescheduled)')
        .order('appointment_date', { ascending: false })
        .limit(600);
      if (error) throw error;

      const ids = (appts || []).map((a) => a.id);
      const paid = {}, lastPaid = {};
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { data: pays } = await supabase.from('payments').select('appointment_id, amount, created_at').in('appointment_id', chunk);
        (pays || []).forEach((p) => {
          paid[p.appointment_id] = (paid[p.appointment_id] || 0) + (parseFloat(p.amount) || 0);
          const ts = new Date(p.created_at).getTime();
          if (!lastPaid[p.appointment_id] || ts > lastPaid[p.appointment_id]) lastPaid[p.appointment_id] = ts;
        });
      }

      const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
      const unpaid = [];
      (appts || []).forEach((a) => {
        if (!a.clients) return;
        if (!a.pets || a.pets.is_archived === true) return;
        const apptDay = new Date(a.appointment_date + 'T00:00:00');
        const serviced = a.checked_out_at != null || a.status === 'completed' || apptDay < todayMidnight;
        if (!serviced) return;
        const price = parseFloat(a.final_price != null ? a.final_price : (a.quoted_price || 0));
        const totalDue = price - (parseFloat(a.discount_amount) || 0);
        const totalPaid = paid[a.id] || 0;
        const balance = totalDue - totalPaid;
        if (balance > 0.01) {
          unpaid.push({
            apptId: a.id, appointmentDate: a.appointment_date,
            clientId: a.clients.id, clientName: `${a.clients.first_name || ''} ${a.clients.last_name || ''}`.trim(),
            clientPhone: a.clients.phone, petName: a.pets.name, petBreed: a.pets.breed,
            serviceName: a.services ? a.services.service_name : '—',
            totalDue, totalPaid, balance, lastPaidAt: lastPaid[a.id] || null,
          });
        }
      });
      unpaid.sort((a, b) => {
        if (a.lastPaidAt == null && b.lastPaidAt != null) return -1;
        if (a.lastPaidAt != null && b.lastPaidAt == null) return 1;
        if (a.lastPaidAt == null && b.lastPaidAt == null) return a.appointmentDate.localeCompare(b.appointmentDate);
        return a.lastPaidAt - b.lastPaidAt;
      });

      let sum = 0; const clients = {};
      unpaid.forEach((u) => { sum += u.balance; if (u.clientId) clients[u.clientId] = true; });
      setBalances(unpaid); setTotalOwed(sum); setClientCount(Object.keys(clients).length);
    } catch (e) { setErr(e.message || 'Could not load balances.'); } finally { if (refresh) setRefreshing(false); else setLoading(false); }
  }

  function remind(b) {
    const phone = String(b.clientPhone || '').replace(/[^0-9+]/g, '');
    if (!phone) { setErr('No phone number on file for this client.'); return; }
    const msg = `Hi ${b.clientName.split(' ')[0]}, just a friendly reminder you have a balance of ${money(b.balance)} for ${b.petName}'s ${b.serviceName} on ${fmtDate(b.appointmentDate)}. Thank you!`;
    Linking.openURL(`sms:${phone}?body=${encodeURIComponent(msg)}`);
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleWrap}><Ionicons name="cash" size={20} color="#fff" /><Text style={styles.title}>Outstanding Balances</Text></View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} colors={[colors.primary]} />}>
          {err ? <Text style={styles.err}>{err}</Text> : null}

          <View style={styles.cards}>
            <View style={[styles.summaryCard, { borderTopColor: '#dc2626' }]}>
              <Text style={styles.sumLabel}>Total Owed</Text>
              <Text style={[styles.sumVal, { color: '#dc2626' }]}>{money(totalOwed)}</Text>
            </View>
            <View style={[styles.summaryCard, { borderTopColor: colors.primary }]}>
              <Text style={styles.sumLabel}>Clients</Text>
              <Text style={[styles.sumVal, { color: colors.text }]}>{clientCount}</Text>
            </View>
            <View style={[styles.summaryCard, { borderTopColor: colors.primary }]}>
              <Text style={styles.sumLabel}>Appts</Text>
              <Text style={[styles.sumVal, { color: colors.text }]}>{balances.length}</Text>
            </View>
          </View>

          {balances.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySub}>No clients owe you money from completed appointments.</Text>
            </View>
          ) : balances.map((b) => {
            const daysOld = daysSince(b.appointmentDate);
            return (
              <View key={b.apptId} style={styles.card}>
                <Pressable onPress={() => navigation.navigate('Schedule', { screen: 'AppointmentDetail', params: { apptId: b.apptId } })}>
                  <View style={styles.rowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.clientName}>{b.clientName}{daysOld > 30 ? <Text style={styles.overdue}>  {daysOld}d overdue</Text> : null}</Text>
                      <Text style={styles.detail}>🐾 {b.petName}{b.petBreed ? ` · ${b.petBreed}` : ''}</Text>
                      <Text style={styles.detail}>✂️ {b.serviceName} · {fmtDate(b.appointmentDate)}</Text>
                      <Text style={styles.lastPaid}>Last payment: {fmtLastPaid(b.lastPaidAt)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.balance}>{money(b.balance)}</Text>
                      <Text style={styles.ofDue}>of {money(b.totalDue)}{b.totalPaid > 0 ? ` · ${money(b.totalPaid)} paid` : ''}</Text>
                    </View>
                  </View>
                </Pressable>
                <View style={styles.actions}>
                  <Pressable style={styles.remindBtn} onPress={() => remind(b)}><Ionicons name="chatbubble-outline" size={15} color={colors.primaryDark} /><Text style={styles.remindText}>Remind</Text></Pressable>
                  <Pressable style={styles.payBtn} onPress={() => navigation.navigate('Schedule', { screen: 'AppointmentDetail', params: { apptId: b.apptId } })}><Ionicons name="cash-outline" size={15} color="#fff" /><Text style={styles.payText}>Record Payment</Text></Pressable>
                </View>
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
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 50 },
  err: { color: '#b91c1c', fontSize: 13, marginBottom: 8, textAlign: 'center' },
  cards: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderTopWidth: 4, padding: 14, ...shadow },
  sumLabel: { fontSize: 11, color: colors.textMute, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  sumVal: { fontSize: 20, fontWeight: '800', marginTop: 4 },
  emptyWrap: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 8 },
  emptySub: { fontSize: 14, color: colors.textMute, textAlign: 'center', marginTop: 4, lineHeight: 20 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 12, ...shadow },
  rowTop: { flexDirection: 'row', gap: 10 },
  clientName: { fontSize: 16, fontWeight: '800', color: colors.text },
  overdue: { fontSize: 12, fontWeight: '800', color: '#dc2626' },
  detail: { fontSize: 13, color: colors.textMute, marginTop: 2 },
  lastPaid: { fontSize: 12, color: colors.textFaint, marginTop: 3 },
  balance: { fontSize: 20, fontWeight: '800', color: '#dc2626' },
  ofDue: { fontSize: 11, color: colors.textFaint, marginTop: 2, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  remindBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 11, backgroundColor: colors.primaryLight },
  remindText: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
  payBtn: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.green, borderRadius: 10, paddingVertical: 11 },
  payText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
