import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

const ROW_H = 44, CAT_H = 30, DAY_W = 52, NAME_W = 96, HDR_H = 40;
const SC = { pending: '#f59e0b', confirmed: '#7c3aed', checked_in: '#16a34a', checked_out: '#9ca3af' };

function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function startOfWeek(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export default function BoardingCalendarScreen({ session, navigation }) {
  const [anchor, setAnchor] = useState(startOfWeek(new Date()));
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState([]);
  const [kennels, setKennels] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [err, setErr] = useState('');

  const days = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));

  useEffect(() => { load(); }, [anchor]);
  useEffect(() => { const unsub = navigation.addListener('focus', () => load()); return unsub; }, [navigation]);

  async function load() {
    setLoading(true); setErr('');
    try {
      const gid = session.user.id;
      const weekStart = iso(anchor), weekEnd = iso(addDays(anchor, 6));
      const [{ data: cat }, { data: ken }, { data: res }] = await Promise.all([
        supabase.from('kennel_categories').select('id, name').eq('groomer_id', gid),
        supabase.from('kennels').select('id, name, category_id, position, is_active').eq('groomer_id', gid).eq('is_active', true).order('position'),
        supabase.from('boarding_reservations')
          .select('id, kennel_id, start_date, end_date, status, boarding_reservation_pets(pets:pet_id(name))')
          .eq('groomer_id', gid).neq('status', 'cancelled')
          .lte('start_date', weekEnd).gte('end_date', weekStart),
      ]);
      setCats(cat || []);
      setKennels(ken || []);
      setReservations(res || []);
    } catch (e) { setErr(e.message || 'Could not load the boarding calendar.'); } finally { setLoading(false); }
  }

  // occupancy map: "kennelId|dayIso" -> reservation
  const occ = {};
  reservations.forEach((r) => {
    if (!r.kennel_id) return;
    days.forEach((dt) => { const di = iso(dt); if (r.start_date <= di && r.end_date >= di) occ[`${r.kennel_id}|${di}`] = r; });
  });
  function vacancy(di) {
    const taken = kennels.filter((k) => occ[`${k.id}|${di}`]).length;
    return `${kennels.length - taken}/${kennels.length}`;
  }
  // group kennels by category (uncategorized last)
  const groups = [];
  (cats || []).forEach((c) => {
    const ks = kennels.filter((k) => k.category_id === c.id);
    if (ks.length) groups.push({ name: c.name, kennels: ks });
  });
  const uncategorized = kennels.filter((k) => !k.category_id);
  if (uncategorized.length) groups.push({ name: 'Other', kennels: uncategorized });

  const weekLabel = `${anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(anchor, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>Boarding</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Ionicons name="grid" size={20} color="#fff" /><Text style={styles.title}>Calendar</Text>
        </View>
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
      ) : kennels.length === 0 ? (
        <Text style={styles.empty}>No kennels set up yet (add them on the website).</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row' }}>
            {/* Fixed left column: kennel names */}
            <View>
              <View style={[styles.corner, { height: HDR_H, width: NAME_W }]}><Text style={styles.cornerTxt}>Kennel</Text></View>
              {groups.map((g) => (
                <View key={g.name}>
                  <View style={[styles.catCell, { width: NAME_W, height: CAT_H }]}><Text style={styles.catTxt} numberOfLines={1}>{g.name}</Text></View>
                  {g.kennels.map((k) => (
                    <View key={k.id} style={[styles.nameCell, { width: NAME_W, height: ROW_H }]}><Text style={styles.nameTxt} numberOfLines={1}>{k.name}</Text></View>
                  ))}
                </View>
              ))}
            </View>

            {/* Scrollable day columns */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                {/* Day header */}
                <View style={{ flexDirection: 'row' }}>
                  {days.map((dt) => {
                    const today = iso(dt) === iso(new Date());
                    return (
                      <View key={iso(dt)} style={[styles.dayHdr, { width: DAY_W, height: HDR_H }, today && styles.dayToday]}>
                        <Text style={[styles.dayName, today && { color: colors.primaryDark }]}>{dt.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                        <Text style={[styles.dayNum, today && { color: colors.primaryDark }]}>{dt.getDate()}</Text>
                      </View>
                    );
                  })}
                </View>
                {groups.map((g) => (
                  <View key={g.name}>
                    {/* category vacancy row */}
                    <View style={{ flexDirection: 'row' }}>
                      {days.map((dt) => <View key={iso(dt)} style={[styles.catVac, { width: DAY_W, height: CAT_H }]} />)}
                    </View>
                    {g.kennels.map((k) => (
                      <View key={k.id} style={{ flexDirection: 'row' }}>
                        {days.map((dt) => {
                          const di = iso(dt);
                          const r = occ[`${k.id}|${di}`];
                          const color = r ? (SC[r.status] || colors.primary) : null;
                          const petName = r && (r.boarding_reservation_pets || [])[0] && r.boarding_reservation_pets[0].pets && r.boarding_reservation_pets[0].pets.name;
                          return (
                            <Pressable
                              key={di}
                              style={[styles.cell, { width: DAY_W, height: ROW_H }, r && { backgroundColor: color }]}
                              onPress={() => r ? navigation.navigate('BoardingDetail', { reservationId: r.id }) : navigation.navigate('BookBoarding')}
                            >
                              {r ? <Text style={styles.cellTxt} numberOfLines={1}>{petName ? petName.slice(0, 5) : ''}</Text> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                ))}
                {/* Vacancy footer */}
                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                  {days.map((dt) => (
                    <View key={iso(dt)} style={[styles.vacCell, { width: DAY_W }]}><Text style={styles.vacTxt}>{vacancy(iso(dt))}</Text></View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            {[['Confirmed', SC.confirmed], ['Checked in', SC.checked_in], ['Pending', SC.pending], ['Checked out', SC.checked_out]].map(([l, c]) => (
              <View key={l} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: c }]} /><Text style={styles.legendTxt}>{l}</Text></View>
            ))}
          </View>
          <Text style={styles.hint}>Tap a colored cell to open the stay · tap an empty cell to book.</Text>
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
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  navTxt: { color: '#fff', fontSize: 22, fontWeight: '800' },
  weekLabel: { color: '#fff', fontSize: 16, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: colors.textMute, fontSize: 15, marginTop: 30, paddingHorizontal: 24 },
  corner: { justifyContent: 'flex-end', paddingBottom: 4, paddingLeft: 8, backgroundColor: colors.bg },
  cornerTxt: { fontSize: 12, fontWeight: '800', color: colors.textMute },
  catCell: { justifyContent: 'center', paddingLeft: 8, backgroundColor: colors.primaryLight },
  catTxt: { fontSize: 12, fontWeight: '800', color: colors.primaryDark },
  nameCell: { justifyContent: 'center', paddingLeft: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#fff' },
  nameTxt: { fontSize: 12, fontWeight: '600', color: colors.text },
  dayHdr: { alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: colors.border },
  dayToday: { backgroundColor: colors.primaryLight },
  dayName: { fontSize: 10, fontWeight: '700', color: colors.textMute },
  dayNum: { fontSize: 14, fontWeight: '800', color: colors.text },
  catVac: { backgroundColor: colors.primaryLight, borderLeftWidth: 1, borderLeftColor: '#ddd6fe' },
  cell: { borderLeftWidth: 1, borderTopWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  cellTxt: { fontSize: 10, fontWeight: '800', color: '#fff' },
  vacCell: { alignItems: 'center', paddingVertical: 4, borderLeftWidth: 1, borderLeftColor: colors.border },
  vacTxt: { fontSize: 11, fontWeight: '800', color: colors.green },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendTxt: { fontSize: 12, color: colors.textMute, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingHorizontal: 24 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
