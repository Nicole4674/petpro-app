import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';
import { openWeb } from '../lib/webLink';

function money(v) { const n = parseFloat(v); return `$${(isNaN(n) ? 0 : n).toFixed(2)}`; }
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
function fmtTime(iso) { if (!iso) return ''; return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
function fmtDate(s) { if (!s) return ''; const [y, m, d] = String(s).split('T')[0].split('-').map((n) => parseInt(n, 10)); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

export default function PayrollScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [ytd, setYtd] = useState({ gross: 0, tips: 0, net: 0, taxes: 0, deductions: 0 });
  const [liveClocked, setLiveClocked] = useState([]);
  const [weekHours, setWeekHours] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);
  useEffect(() => { const unsub = navigation.addListener('focus', () => load()); return unsub; }, [navigation]);

  async function load() {
    setLoading(true); setErr('');
    try {
      const gid = session.user.id;
      const yearStart = `${new Date().getFullYear()}-01-01`;
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

      const [{ data: pc }, { data: staff }, { data: live }, { data: week }, { data: pp }] = await Promise.all([
        supabase.from('paychecks').select('gross_pay, tips, net_pay, federal_tax, state_tax, social_security_tax, medicare_tax, pre_tax_deductions_total, post_tax_deductions_total').eq('groomer_id', gid).gte('created_at', yearStart),
        supabase.from('staff_members').select('id, first_name, last_name, role').eq('groomer_id', gid).eq('status', 'active'),
        supabase.from('time_clock').select('id, staff_id, clock_in').eq('groomer_id', gid).is('clock_out', null).order('clock_in', { ascending: false }),
        supabase.from('time_clock').select('staff_id, total_minutes').eq('groomer_id', gid).gte('clock_in', weekAgo.toISOString()),
        supabase.from('pay_periods').select('*').eq('groomer_id', gid).order('start_date', { ascending: false }).limit(6),
      ]);

      const y = { gross: 0, tips: 0, net: 0, taxes: 0, deductions: 0 };
      (pc || []).forEach((p) => {
        y.gross += num(p.gross_pay); y.tips += num(p.tips); y.net += num(p.net_pay);
        y.taxes += num(p.federal_tax) + num(p.state_tax) + num(p.social_security_tax) + num(p.medicare_tax);
        y.deductions += num(p.pre_tax_deductions_total) + num(p.post_tax_deductions_total);
      });
      setYtd(y);

      const byId = {}; (staff || []).forEach((s) => { byId[s.id] = s; });
      setLiveClocked((live || []).filter((t) => byId[t.staff_id]).map((t) => ({ id: t.id, name: `${byId[t.staff_id].first_name || ''} ${byId[t.staff_id].last_name || ''}`.trim(), since: t.clock_in })));

      const mins = {}; (week || []).forEach((t) => { if (t.staff_id) mins[t.staff_id] = (mins[t.staff_id] || 0) + num(t.total_minutes); });
      setWeekHours(Object.keys(mins).filter((sid) => byId[sid]).map((sid) => ({ id: sid, name: `${byId[sid].first_name || ''} ${byId[sid].last_name || ''}`.trim(), hours: mins[sid] / 60 })).sort((a, b) => b.hours - a.hours));

      setPeriods(pp || []);
    } catch (e) { setErr(e.message || 'Could not load payroll.'); } finally { setLoading(false); }
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleWrap}><Ionicons name="cash" size={20} color="#fff" /><Text style={styles.title}>Payroll</Text></View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* YTD */}
          <Text style={styles.section}>This Year</Text>
          <View style={styles.kpis}>
            <View style={styles.kpi}><Text style={styles.kpiNum}>{money(ytd.gross)}</Text><Text style={styles.kpiLabel}>Gross wages</Text></View>
            <View style={styles.kpi}><Text style={[styles.kpiNum, { color: colors.green }]}>{money(ytd.tips)}</Text><Text style={styles.kpiLabel}>Tips</Text></View>
            <View style={styles.kpi}><Text style={styles.kpiNum}>{money(ytd.net)}</Text><Text style={styles.kpiLabel}>Net paid</Text></View>
            <View style={styles.kpi}><Text style={styles.kpiNum}>{money(ytd.taxes)}</Text><Text style={styles.kpiLabel}>Taxes</Text></View>
          </View>

          {/* Clocked in now */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Clocked in now</Text>
            {liveClocked.length === 0 ? <Text style={styles.muted}>No one is clocked in.</Text> : liveClocked.map((c) => (
              <View key={c.id} style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={styles.liveName}>{c.name}</Text>
                <Text style={styles.liveSince}>since {fmtTime(c.since)}</Text>
              </View>
            ))}
          </View>

          {/* This week hours */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hours this week</Text>
            {weekHours.length === 0 ? <Text style={styles.muted}>No completed hours yet this week.</Text> : weekHours.map((w) => (
              <View key={w.id} style={styles.hrRow}>
                <Text style={styles.hrName}>{w.name}</Text>
                <Text style={styles.hrVal}>{w.hours.toFixed(1)} hrs</Text>
              </View>
            ))}
          </View>

          {/* Pay periods */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent Pay Periods</Text>
            {periods.length === 0 ? <Text style={styles.muted}>No pay periods yet.</Text> : periods.map((p) => (
              <View key={p.id} style={styles.ppRow}>
                <Text style={styles.ppDates}>{fmtDate(p.start_date)} – {fmtDate(p.end_date)}</Text>
                {p.status ? <View style={[styles.ppBadge, p.status === 'paid' ? styles.ppPaid : styles.ppOpen]}><Text style={[styles.ppBadgeText, { color: p.status === 'paid' ? '#166534' : '#b45309' }]}>{p.status}</Text></View> : null}
              </View>
            ))}
          </View>

          <Pressable style={styles.webBtn} onPress={() => openWeb('/payroll')}>
            <Ionicons name="open-outline" size={16} color={colors.primaryDark} />
            <Text style={styles.webText}>Run payroll & tax settings on web</Text>
          </Pressable>
          <Text style={styles.note}>Running payroll, paychecks, tax settings and year-end forms live on the website.</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  section: { fontSize: 13, fontWeight: '800', color: colors.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginLeft: 4 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  kpi: { width: '47.5%', backgroundColor: colors.card, borderRadius: 14, padding: 14, ...shadow },
  kpiNum: { fontSize: 20, fontWeight: '800', color: colors.text },
  kpiLabel: { fontSize: 12, fontWeight: '700', color: colors.textMute, marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginTop: 12, ...shadow },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 10 },
  muted: { color: colors.textFaint, fontSize: 14 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green },
  liveName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  liveSince: { fontSize: 13, color: colors.textMute },
  hrRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  hrName: { fontSize: 15, color: colors.text, fontWeight: '600' },
  hrVal: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  ppRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  ppDates: { fontSize: 15, color: colors.text, fontWeight: '600' },
  ppBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  ppPaid: { backgroundColor: '#dcfce7' },
  ppOpen: { backgroundColor: '#fef3c7' },
  ppBadgeText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  webBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primaryLight, borderRadius: 12, paddingVertical: 14, marginTop: 14 },
  webText: { color: colors.primaryDark, fontWeight: '800', fontSize: 15 },
  note: { textAlign: 'center', color: colors.textFaint, fontSize: 12, marginTop: 10, lineHeight: 17 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
