import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function startOfWeek(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
function money(v) { const n = parseFloat(v); return `$${(isNaN(n) ? 0 : n).toFixed(0)}`; }
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

const RANGES = [{ k: 'today', l: 'Today' }, { k: 'week', l: 'Week' }, { k: 'month', l: 'Month' }, { k: 'year', l: 'Year' }];

function rangeDates(k) {
  const now = new Date();
  if (k === 'today') return [iso(now), iso(now)];
  if (k === 'week') { const s = startOfWeek(now); const e = new Date(s); e.setDate(e.getDate() + 6); return [iso(s), iso(e)]; }
  if (k === 'year') return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
  const s = new Date(now.getFullYear(), now.getMonth(), 1);
  const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [iso(s), iso(e)];
}

export default function AnalyticsScreen({ session, navigation }) {
  const [range, setRange] = useState('month');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, [range]);

  async function load() {
    setLoading(true); setErr('');
    try {
      const gid = session.user.id;
      const [start, end] = rangeDates(range);
      const [{ data: appts }, { data: clients }, { data: pays }] = await Promise.all([
        supabase.from('appointments').select('id, client_id, appointment_date, status, quoted_price, final_price, recurring_series_id, checked_out_at, services(service_name)')
          .eq('groomer_id', gid).gte('appointment_date', start).lte('appointment_date', end),
        supabase.from('clients').select('id, first_name, last_name, created_at').eq('groomer_id', gid),
        supabase.from('payments').select('amount, tip_amount, refunded_amount, created_at, client_id')
          .eq('groomer_id', gid).gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`),
      ]);

      const A = appts || [], C = clients || [], P = pays || [];
      // Revenue (incl tips) from payments
      let revenue = 0, tips = 0;
      P.forEach((p) => { revenue += num(p.amount) - num(p.refunded_amount) + num(p.tip_amount); tips += num(p.tip_amount); });
      // Appointments
      const booked = A.filter((a) => a.status !== 'cancelled');
      const noShow = A.filter((a) => a.status === 'no_show').length;
      const completed = A.filter((a) => a.checked_out_at != null || a.status === 'completed').length;
      const avgTicket = completed > 0 ? revenue / completed : 0;
      // New / returning / recurring
      const firstSeen = {}; C.forEach((c) => { firstSeen[c.id] = c.created_at ? c.created_at.slice(0, 10) : '0000-01-01'; });
      const clientsInRange = {};
      A.forEach((a) => { if (a.client_id) clientsInRange[a.client_id] = clientsInRange[a.client_id] || { recurring: false }; if (a.recurring_series_id) clientsInRange[a.client_id].recurring = true; });
      let newC = 0, returningC = 0, recurringC = 0;
      Object.keys(clientsInRange).forEach((cid) => {
        if (clientsInRange[cid].recurring) recurringC++;
        else if (firstSeen[cid] >= start && firstSeen[cid] <= end) newC++;
        else returningC++;
      });
      const newClientsCount = C.filter((c) => firstSeen[c.id] >= start && firstSeen[c.id] <= end).length;
      // Service breakdown
      const byService = {};
      A.forEach((a) => { const n = (a.services && a.services.service_name) || 'Other'; byService[n] = (byService[n] || 0) + num(a.final_price != null ? a.final_price : a.quoted_price); });
      const services = Object.entries(byService).map(([name, rev]) => ({ name, rev })).filter((s) => s.rev > 0).sort((a, b) => b.rev - a.rev).slice(0, 8);
      const svcTotal = services.reduce((s, x) => s + x.rev, 0) || 1;
      // Revenue trend by day
      const byDay = {};
      P.forEach((p) => { const d = (p.created_at || '').slice(0, 10); byDay[d] = (byDay[d] || 0) + num(p.amount) - num(p.refunded_amount) + num(p.tip_amount); });
      const trend = Object.entries(byDay).map(([d, v]) => ({ d, v })).sort((a, b) => a.d < b.d ? -1 : 1);
      const trendMax = Math.max(...trend.map((t) => t.v), 1);
      // Top clients
      const cs = {};
      A.forEach((a) => { if (!a.client_id) return; cs[a.client_id] = cs[a.client_id] || { visits: 0, rev: 0, last: '' }; cs[a.client_id].visits++; cs[a.client_id].rev += num(a.final_price != null ? a.final_price : a.quoted_price); if (a.appointment_date > cs[a.client_id].last) cs[a.client_id].last = a.appointment_date; });
      const nameOf = (id) => { const c = C.find((x) => x.id === id); return c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : 'Client'; };
      const topClients = Object.entries(cs).map(([id, s]) => ({ id, name: nameOf(id), ...s })).sort((a, b) => b.rev - a.rev).slice(0, 6);

      setData({ revenue, tips, booked: booked.length, noShow, completed, avgTicket, newClientsCount, mix: { newC, returningC, recurringC }, services, svcTotal, trend, trendMax, topClients });
    } catch (e) { setErr(e.message || 'Could not load analytics.'); } finally { setLoading(false); }
  }

  const mixTotal = data ? (data.mix.newC + data.mix.returningC + data.mix.recurringC) || 1 : 1;

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleWrap}><Ionicons name="bar-chart" size={20} color="#fff" /><Text style={styles.title}>Analytics</Text></View>
        <View style={styles.rangeRow}>
          {RANGES.map((r) => (
            <Pressable key={r.k} style={[styles.rangeBtn, range === r.k && styles.rangeBtnSel]} onPress={() => setRange(r.k)}>
              <Text style={range === r.k ? styles.rangeTextSel : styles.rangeText}>{r.l}</Text>
            </Pressable>
          ))}
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : data ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* KPI cards */}
          <View style={styles.kpis}>
            <View style={styles.kpi}><Text style={styles.kpiNum}>{money(data.revenue)}</Text><Text style={styles.kpiLabel}>Revenue</Text><Text style={styles.kpiSub}>incl {money(data.tips)} tips</Text></View>
            <View style={styles.kpi}><Text style={styles.kpiNum}>{data.completed}</Text><Text style={styles.kpiLabel}>Completed</Text><Text style={styles.kpiSub}>{data.booked} booked · {data.noShow} no-show</Text></View>
            <View style={styles.kpi}><Text style={styles.kpiNum}>{data.newClientsCount}</Text><Text style={styles.kpiLabel}>New clients</Text></View>
            <View style={styles.kpi}><Text style={styles.kpiNum}>{money(data.avgTicket)}</Text><Text style={styles.kpiLabel}>Avg ticket</Text></View>
          </View>

          {/* Client mix */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Client Mix</Text>
            <View style={styles.mixBar}>
              <View style={{ flex: data.mix.newC || 0.001, backgroundColor: '#3b82f6' }} />
              <View style={{ flex: data.mix.returningC || 0.001, backgroundColor: colors.green }} />
              <View style={{ flex: data.mix.recurringC || 0.001, backgroundColor: colors.primary }} />
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: '#3b82f6' }]} /><Text style={styles.legendTxt}>{data.mix.newC} New</Text></View>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.green }]} /><Text style={styles.legendTxt}>{data.mix.returningC} Returning</Text></View>
              <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.primary }]} /><Text style={styles.legendTxt}>{data.mix.recurringC} Recurring</Text></View>
            </View>
          </View>

          {/* Revenue trend */}
          {data.trend.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Revenue Trend</Text>
              <View style={styles.trend}>
                {data.trend.map((t) => (
                  <View key={t.d} style={styles.trendCol}>
                    <View style={[styles.trendBar, { height: Math.max(4, (t.v / data.trendMax) * 90) }]} />
                  </View>
                ))}
              </View>
              <Text style={styles.trendNote}>{data.trend[0].d.slice(5)} → {data.trend[data.trend.length - 1].d.slice(5)}</Text>
            </View>
          ) : null}

          {/* Service breakdown */}
          {data.services.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Service Breakdown</Text>
              {data.services.map((s) => (
                <View key={s.name} style={styles.svcRow}>
                  <Text style={styles.svcName} numberOfLines={1}>{s.name}</Text>
                  <View style={styles.svcBarBg}><View style={[styles.svcBarFill, { width: `${(s.rev / data.svcTotal) * 100}%` }]} /></View>
                  <Text style={styles.svcRev}>{money(s.rev)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Top clients */}
          {data.topClients.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Top Clients</Text>
              {data.topClients.map((c) => (
                <View key={c.id} style={styles.topRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topName}>{c.name}</Text>
                    <Text style={styles.topMeta}>{c.visits} visit{c.visits === 1 ? '' : 's'}</Text>
                  </View>
                  <Text style={styles.topRev}>{money(c.rev)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 14, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  rangeRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  rangeBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  rangeBtnSel: { backgroundColor: '#fff' },
  rangeText: { color: '#ede9fe', fontWeight: '700', fontSize: 13 },
  rangeTextSel: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  kpi: { width: '47.5%', backgroundColor: colors.card, borderRadius: 14, padding: 14, ...shadow },
  kpiNum: { fontSize: 22, fontWeight: '800', color: colors.text },
  kpiLabel: { fontSize: 12, fontWeight: '800', color: colors.textMute, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  kpiSub: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 12, ...shadow },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 12 },
  mixBar: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { fontSize: 13, color: colors.textMute, fontWeight: '600' },
  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 96 },
  trendCol: { flex: 1, justifyContent: 'flex-end' },
  trendBar: { backgroundColor: colors.primary, borderRadius: 3, minHeight: 4 },
  trendNote: { fontSize: 11, color: colors.textFaint, marginTop: 8, textAlign: 'center' },
  svcRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  svcName: { fontSize: 13, color: colors.text, fontWeight: '600', width: 110 },
  svcBarBg: { flex: 1, height: 14, borderRadius: 7, backgroundColor: '#f3f4f6', overflow: 'hidden' },
  svcBarFill: { height: 14, borderRadius: 7, backgroundColor: colors.primary },
  svcRev: { fontSize: 13, fontWeight: '800', color: colors.green, width: 54, textAlign: 'right' },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  topName: { fontSize: 15, fontWeight: '700', color: colors.text },
  topMeta: { fontSize: 12, color: colors.textMute, marginTop: 1 },
  topRev: { fontSize: 15, fontWeight: '800', color: colors.green },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
