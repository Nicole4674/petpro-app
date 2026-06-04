import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function startOfWeek(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtT(t) { if (!t) return ''; const [h, m] = String(t).split(':'); const hh = parseInt(h, 10); return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`; }
function shiftHours(s) {
  const a = String(s.start_time).split(':'), b = String(s.end_time).split(':');
  const mins = (parseInt(b[0], 10) * 60 + parseInt(b[1], 10)) - (parseInt(a[0], 10) * 60 + parseInt(a[1], 10)) - (s.break_minutes || 0);
  return Math.max(mins, 0) / 60;
}

export default function StaffScheduleScreen({ session, route, navigation }) {
  const { staffId, staffName } = route.params;
  const [anchor, setAnchor] = useState(startOfWeek(new Date()));
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState([]);
  const [err, setErr] = useState('');

  const days = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));

  useEffect(() => { load(); }, [anchor]);

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase.from('staff_schedules')
        .select('id, staff_id, shift_date, start_time, end_time, break_minutes')
        .eq('staff_id', staffId)
        .gte('shift_date', iso(anchor)).lte('shift_date', iso(addDays(anchor, 6)))
        .order('shift_date');
      if (error) throw error;
      setShifts(data || []);
    } catch (e) { setErr(e.message || 'Could not load schedule.'); } finally { setLoading(false); }
  }

  const weekTotal = shifts.reduce((s, sh) => s + shiftHours(sh), 0);
  const weekLabel = `${anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(anchor, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>Staff</Text>
        </Pressable>
        <Text style={styles.title}>{staffName || 'Schedule'}</Text>
        <View style={styles.nav}>
          <Pressable style={styles.navBtn} onPress={() => setAnchor(addDays(anchor, -7))}><Text style={styles.navTxt}>‹</Text></Pressable>
          <Pressable onPress={() => setAnchor(startOfWeek(new Date()))}><Text style={styles.weekLabel}>{weekLabel}</Text></Pressable>
          <Pressable style={styles.navBtn} onPress={() => setAnchor(addDays(anchor, 7))}><Text style={styles.navTxt}>›</Text></Pressable>
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.totalCard}>
            <Text style={styles.totalNum}>{weekTotal.toFixed(1)}</Text>
            <Text style={styles.totalLabel}>scheduled hours this week</Text>
          </View>
          {days.map((dt) => {
            const di = iso(dt);
            const todayDay = di === iso(new Date());
            const dayShifts = shifts.filter((s) => s.shift_date === di);
            return (
              <View key={di} style={[styles.dayRow, todayDay && styles.dayToday]}>
                <View style={styles.dayLeft}>
                  <Text style={[styles.dayName, todayDay && { color: colors.primaryDark }]}>{dt.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                  <Text style={[styles.dayNum, todayDay && { color: colors.primaryDark }]}>{dt.getDate()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  {dayShifts.length === 0 ? (
                    <Text style={styles.off}>Off</Text>
                  ) : dayShifts.map((s) => (
                    <View key={s.id} style={styles.shift}>
                      <Text style={styles.shiftTime}>{fmtT(s.start_time)} – {fmtT(s.end_time)}</Text>
                      <Text style={styles.shiftMeta}>{shiftHours(s).toFixed(1)} hrs{s.break_minutes ? ` · ${s.break_minutes}m break` : ''}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
          <Text style={styles.hint}>Schedule is view-only — edit shifts on the website.</Text>
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
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  navTxt: { color: '#fff', fontSize: 22, fontWeight: '800' },
  weekLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  totalCard: { backgroundColor: colors.primaryLight, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16 },
  totalNum: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
  totalLabel: { fontSize: 13, color: colors.primaryDark, fontWeight: '600', marginTop: 2 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  dayToday: { borderColor: colors.primary, borderWidth: 2 },
  dayLeft: { width: 44, alignItems: 'center' },
  dayName: { fontSize: 11, fontWeight: '700', color: colors.textMute },
  dayNum: { fontSize: 18, fontWeight: '800', color: colors.text },
  off: { fontSize: 14, color: colors.textFaint, fontStyle: 'italic' },
  shift: { marginBottom: 2 },
  shiftTime: { fontSize: 15, fontWeight: '800', color: colors.text },
  shiftMeta: { fontSize: 12, color: colors.textMute, marginTop: 1 },
  hint: { fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: 12 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
