import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, RefreshControl, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { statusStyle, effectiveStatus } from '../lib/apptStatus';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

// ---------- date helpers ----------
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x; } // Sunday
function sameDay(a, b) { return iso(a) === iso(b); }
function isTodayIso(s) { return s === iso(new Date()); }

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}
function apptPrice(a) {
  const p = a.final_price != null ? a.final_price
    : a.quoted_price != null ? a.quoted_price
    : (a.services && a.services.price != null ? a.services.price : null);
  if (p == null) return null;
  const n = parseFloat(p);
  return isNaN(n) ? null : n;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function ScheduleScreen({ session, navigation, route }) {
  const [view, setView] = useState('day');      // 'day' | 'week' | 'month'
  const [anchor, setAnchor] = useState(new Date());   // drives the visible range
  const [selected, setSelected] = useState(new Date()); // which day's list shows
  const [byDate, setByDate] = useState({});     // iso -> appointments[]
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Recompute the fetch range whenever view or anchor changes
  useEffect(() => { load(); }, [view, iso(anchor)]);
  // Refetch when returning to this tab (e.g. after booking an appointment)
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load(true));
    return unsub;
  }, [navigation]);
  // Jump to a specific date (e.g. tapping a recurring date in an appointment)
  useEffect(() => {
    const jd = route && route.params && route.params.jumpDate;
    if (jd) {
      const [y, m, d] = jd.split('-').map((n) => parseInt(n, 10));
      const dt = new Date(y, m - 1, d);
      setView('day'); setAnchor(dt); setSelected(dt);
      navigation.setParams({ jumpDate: undefined });
    }
  }, [route && route.params && route.params.jumpDate]);

  function range() {
    if (view === 'day') return [anchor, anchor];
    if (view === 'week') { const s = startOfWeek(anchor); return [s, addDays(s, 6)]; }
    const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const e = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return [s, e];
  }

  async function load(refresh) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErr('');
    try {
      const [start, end] = range();
      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, start_time, end_time, status, checked_in_at, checked_out_at, booked_via, quoted_price, final_price, pets:pet_id(name, breed), appointment_pets(pets:pet_id(name, breed)), clients:client_id(first_name, last_name, phone), services:service_id(service_name, price)')
        .eq('groomer_id', session.user.id)
        .gte('appointment_date', iso(start))
        .lte('appointment_date', iso(end))
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true });
      if (error) throw error;
      const map = {};
      (data || []).forEach((a) => {
        (map[a.appointment_date] = map[a.appointment_date] || []).push(a);
      });
      setByDate(map);
    } catch (e) {
      setErr(e.message || 'Could not load the schedule.');
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }

  function shift(dir) {
    if (view === 'day') { const d = addDays(anchor, dir); setAnchor(d); setSelected(d); }
    else if (view === 'week') { setAnchor(addDays(anchor, dir * 7)); }
    else { setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1)); }
  }

  function switchView(v) {
    setView(v);
    setAnchor(selected);
  }

  // header label per view
  let label;
  if (view === 'day') {
    label = selected.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } else if (view === 'week') {
    const s = startOfWeek(anchor); const e = addDays(s, 6);
    label = `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  } else {
    label = anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // The day whose appointments show in the bottom list
  const listDate = view === 'day' ? anchor : selected;
  const listAppts = byDate[iso(listDate)] || [];

  // Pet names on an appointment (multi-pet via appointment_pets, else the single pet)
  function petNamesOf(a) {
    let names = [];
    if (a.appointment_pets && a.appointment_pets.length) {
      names = a.appointment_pets.map((ap) => ap.pets && ap.pets.name).filter(Boolean);
    }
    if (!names.length && a.pets && a.pets.name) names = [a.pets.name];
    return names;
  }
  function petLineOf(a) {
    const names = petNamesOf(a);
    if (names.length <= 1) {
      return [names[0], a.pets && a.pets.breed].filter(Boolean).join(' · ');
    }
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  }

  // One appointment card (week/month lists)
  function renderAppt(a) {
    const price = apptPrice(a);
    const ss = statusStyle(effectiveStatus(a));
    const client = a.clients ? `${a.clients.first_name || ''} ${a.clients.last_name || ''}`.trim() : '';
    const petLine = petLineOf(a);
    return (
      <Pressable
        key={a.id}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
        onPress={() => navigation.navigate('AppointmentDetail', { apptId: a.id })}
      >
        <View style={[styles.cardHead, { backgroundColor: ss.bg }]}>
          <Text style={[styles.cardTime, { color: ss.color }]}>
            {fmtTime(a.start_time)}{a.end_time ? ` – ${fmtTime(a.end_time)}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {a.booked_via === 'client_ai' ? <MaterialCommunityIcons name="robot-happy" size={14} color={colors.primary} /> : null}
            <Text style={[styles.cardStatus, { color: ss.color }]}>{(ss.label || '').toUpperCase()}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          {client ? <Text style={styles.cardClient}>{client}</Text> : null}
          {petLine ? <Text style={styles.cardPet}>{petLine}</Text> : null}
          {a.services && a.services.service_name ? <Text style={styles.cardSvc}>{a.services.service_name}</Text> : null}
          <View style={styles.cardFooter}>
            {price != null ? <Text style={styles.cardPrice}>${price.toFixed(2)}</Text> : <Text />}
            {a.clients && a.clients.phone ? (
              <Text style={styles.cardPhone} onPress={() => Linking.openURL(`tel:${String(a.clients.phone).replace(/[^0-9+]/g, '')}`)}>
                {a.clients.phone}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  function fmtHourLabel(h) {
    return `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  function toMin(t) {
    if (!t) return null;
    const p = String(t).split(':');
    const h = parseInt(p[0], 10), m = parseInt(p[1] || '0', 10);
    return isNaN(h) ? null : h * 60 + m;
  }

  // Side-by-side layout: appointments that overlap in time get their own
  // column so two bookings at the same time sit next to each other.
  function layoutDay(appts) {
    const items = appts
      .map((a) => {
        const start = toMin(a.start_time);
        let end = toMin(a.end_time);
        if (end == null || end <= start) end = (start ?? 0) + 30; // fallback length
        return { a, start, end };
      })
      .filter((x) => x.start != null)
      .sort((x, y) => x.start - y.start || x.end - y.end);

    const out = [];
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
      const cols = []; // each entry = that column's last end time
      cluster.forEach((it) => {
        let placed = false;
        for (let c = 0; c < cols.length; c++) {
          if (cols[c] <= it.start) { it.col = c; cols[c] = it.end; placed = true; break; }
        }
        if (!placed) { it.col = cols.length; cols.push(it.end); }
      });
      cluster.forEach((it) => { it.cols = cols.length; out.push(it); });
      cluster = [];
    };
    items.forEach((it) => {
      if (cluster.length && it.start >= clusterEnd) { flush(); clusterEnd = -1; }
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.end);
    });
    flush();
    return out;
  }

  // One appointment as a height = duration block, positioned in its column.
  function renderApptBlock(it, minMin, HOUR_PX) {
    const { a, start, end, col, cols } = it;
    const ss = statusStyle(effectiveStatus(a));
    const client = a.clients ? `${a.clients.first_name || ''} ${a.clients.last_name || ''}`.trim() : '';
    const petLine = petLineOf(a);
    const price = apptPrice(a);
    const top = ((start - minMin) / 60) * HOUR_PX;
    const height = Math.max(((end - start) / 60) * HOUR_PX, 22); // min tap height
    const widthPct = 100 / cols;
    return (
      <Pressable
        key={a.id}
        onPress={() => navigation.navigate('AppointmentDetail', { apptId: a.id })}
        style={({ pressed }) => [
          styles.block,
          { top, height, left: `${col * widthPct}%`, width: `${widthPct}%`, backgroundColor: ss.bg, borderLeftColor: ss.color },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.blockTopRow}>
          <Text numberOfLines={1} style={[styles.blockTime, { color: ss.color, flex: 1 }]}>
            {fmtTime(a.start_time)}{a.end_time ? `–${fmtTime(a.end_time)}` : ''}
          </Text>
          {a.booked_via === 'client_ai' ? <MaterialCommunityIcons name="robot-happy" size={13} color={colors.primary} /> : null}
          {price != null ? <Text style={styles.blockPrice}>${price.toFixed(0)}</Text> : null}
        </View>
        {client ? <Text numberOfLines={1} style={styles.blockClient}>{client}</Text> : null}
        {height >= 56 && petLine ? <Text numberOfLines={1} style={styles.blockPet}>{petLine}</Text> : null}
        {height >= 78 && a.services && a.services.service_name ? (
          <Text numberOfLines={1} style={styles.blockSvc}>{a.services.service_name}</Text>
        ) : null}
      </Pressable>
    );
  }

  // WEEK view = MoeGo-style 7-day time grid. Horizontally scrollable so each
  // day gets a real column; tap an empty slot to book, tap a block to open it.
  function renderWeekGrid() {
    const weekStart = startOfWeek(anchor);
    const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
    const HOUR_PX = 64;
    const COL_W = 118;
    // Find the time window that fits every appointment across the week
    let minH = 8, maxH = 18;
    days.forEach((d) => (byDate[iso(d)] || []).forEach((a) => {
      const s = toMin(a.start_time), e = toMin(a.end_time);
      if (s != null) minH = Math.min(minH, Math.floor(s / 60));
      if (e != null) maxH = Math.max(maxH, Math.ceil(e / 60));
      else if (s != null) maxH = Math.max(maxH, Math.ceil((s + 60) / 60));
    }));
    const minMin = minH * 60;
    const totalHeight = (maxH - minH) * HOUR_PX;
    const hours = [];
    for (let h = minH; h <= maxH; h++) hours.push(h);

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
        <View>
          {/* Day-of-week header row */}
          <View style={styles.wHeadRow}>
            <View style={{ width: 44 }} />
            {days.map((d, i) => {
              const today = isTodayIso(iso(d));
              return (
                <Pressable
                  key={i}
                  style={[styles.wHead, { width: COL_W }, today && styles.wHeadToday]}
                  onPress={() => { setView('day'); setAnchor(d); setSelected(d); }}
                >
                  <Text style={[styles.wHeadDow, today && styles.wHeadTodayText]}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                  <Text style={[styles.wHeadNum, today && styles.wHeadTodayText]}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Grid body: time gutter + 7 day columns */}
          <View style={{ flexDirection: 'row', height: totalHeight }}>
            <View style={{ width: 44 }}>
              {hours.map((h) => (
                <Text key={h} style={[styles.wLabel, { top: (h - minH) * HOUR_PX - 7 }]}>{fmtHourLabel(h)}</Text>
              ))}
            </View>
            {days.map((d, i) => {
              const laid = layoutDay(byDate[iso(d)] || []);
              return (
                <View key={i} style={[styles.wCol, { width: COL_W, height: totalHeight }]}>
                  {hours.slice(0, -1).map((h) => (
                    <Pressable
                      key={h}
                      onPress={() => navigation.navigate('AddAppointment', { prefillDate: iso(d), prefillHour: h })}
                      style={({ pressed }) => [styles.wLane, { top: (h - minH) * HOUR_PX, height: HOUR_PX }, pressed && { backgroundColor: colors.primaryLight }]}
                    />
                  ))}
                  {laid.map((it) => renderApptBlock(it, minMin, HOUR_PX))}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    );
  }

  // DAY view = proportional time grid (block height = how long it takes).
  function renderDayGrid() {
    const dayAppts = byDate[iso(anchor)] || [];
    const HOUR_PX = 96;
    let minH = 8, maxH = 18; // 8 AM–6 PM default, expands to fit
    dayAppts.forEach((a) => {
      const s = toMin(a.start_time), e = toMin(a.end_time);
      if (s != null) minH = Math.min(minH, Math.floor(s / 60));
      if (e != null) maxH = Math.max(maxH, Math.ceil(e / 60));
      else if (s != null) maxH = Math.max(maxH, Math.ceil((s + 60) / 60));
    });
    const minMin = minH * 60;
    const totalHeight = (maxH - minH) * HOUR_PX;
    const hours = [];
    for (let h = minH; h <= maxH; h++) hours.push(h);
    const laid = layoutDay(dayAppts);

    return (
      <View style={styles.grid}>
        {/* Time labels gutter */}
        <View style={{ width: 52 }}>
          {hours.map((h) => (
            <Text key={h} style={[styles.gLabel, { top: (h - minH) * HOUR_PX - 7 }]}>{fmtHourLabel(h)}</Text>
          ))}
        </View>
        {/* Canvas: tappable empty hour lanes + appointment blocks on top */}
        <View style={[styles.canvas, { height: totalHeight }]}>
          {hours.slice(0, -1).map((h) => (
            <Pressable
              key={h}
              onPress={() => navigation.navigate('AddAppointment', { prefillDate: iso(anchor), prefillHour: h })}
              style={({ pressed }) => [styles.lane, { top: (h - minH) * HOUR_PX, height: HOUR_PX }, pressed && { backgroundColor: colors.primaryLight }]}
            />
          ))}
          {laid.map((it) => renderApptBlock(it, minMin, HOUR_PX))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>📅 Schedule</Text>
          <Pressable
            style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate('AddAppointment', { prefillDate: iso(view === 'day' ? anchor : selected) })}
          >
            <Text style={styles.bookBtnText}>+ Book</Text>
          </Pressable>
        </View>

        {/* Day / Week / Month toggle */}
        <View style={styles.segments}>
          {['day', 'week', 'month'].map((v) => (
            <Pressable key={v} style={[styles.seg, view === v && styles.segActive]} onPress={() => switchView(v)}>
              <Text style={view === v ? styles.segActiveText : styles.segText}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ‹ label › */}
        <View style={styles.nav}>
          <Pressable style={styles.arrow} onPress={() => shift(-1)}><Text style={styles.arrowText}>‹</Text></Pressable>
          <Pressable onPress={() => { setAnchor(new Date()); setSelected(new Date()); }} style={styles.labelWrap}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.todayHint}>tap = today</Text>
          </Pressable>
          <Pressable style={styles.arrow} onPress={() => shift(1)}><Text style={styles.arrowText}>›</Text></Pressable>
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#7c3aed" colors={['#7c3aed']} />}
        >
          {/* MONTH: calendar grid */}
          {view === 'month' && (
            <View style={styles.monthGrid}>
              <View style={styles.monthDowRow}>
                {WEEKDAYS.map((w, i) => <Text key={i} style={styles.monthDow}>{w}</Text>)}
              </View>
              {buildMonth(anchor).map((week, wi) => (
                <View key={wi} style={styles.monthWeek}>
                  {week.map((d, di) => {
                    if (!d) return <View key={di} style={styles.monthCell} />;
                    const count = (byDate[iso(d)] || []).length;
                    const isSel = sameDay(d, selected);
                    const today = isTodayIso(iso(d));
                    return (
                      <Pressable key={di} style={[styles.monthCell, isSel && styles.monthCellSel]} onPress={() => setSelected(d)}>
                        <Text style={[styles.monthNum, today && styles.monthToday, isSel && styles.weekTextSel]}>{d.getDate()}</Text>
                        {count > 0 ? <View style={[styles.dot, isSel && { backgroundColor: '#fff' }]} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {view === 'day' ? (
            // Full time-grid calendar for the day
            renderDayGrid()
          ) : view === 'week' ? (
            // Full 7-day time-grid calendar for the week
            renderWeekGrid()
          ) : (
            <>
              <Text style={styles.listHeading}>
                {listDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
              {listAppts.length === 0 ? (
                <Text style={styles.empty}>No appointments. 🌤️</Text>
              ) : (
                listAppts.map(renderAppt)
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// Build a month as weeks of Date|null cells (null = blank pad)
function buildMonth(anchor) {
  const year = anchor.getFullYear(), month = anchor.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f5f3ff' },
  header: { backgroundColor: '#5b21b6', paddingTop: 64, paddingBottom: 16, paddingHorizontal: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 12 },
  segments: { flexDirection: 'row', backgroundColor: '#6d28d9', borderRadius: 10, padding: 4, marginBottom: 14 },
  seg: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  segActive: { backgroundColor: '#fff' },
  segText: { color: '#ddd6fe', fontWeight: '600', fontSize: 13 },
  segActiveText: { color: '#5b21b6', fontWeight: '800', fontSize: 13 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6d28d9', alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: '#fff', fontSize: 26, fontWeight: '800', lineHeight: 28 },
  labelWrap: { alignItems: 'center', flex: 1 },
  label: { color: '#fff', fontSize: 18, fontWeight: '800' },
  todayHint: { color: '#c4b5fd', fontSize: 11, marginTop: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },

  // week
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  weekPill: { flex: 1, alignItems: 'center', paddingVertical: 8, marginHorizontal: 2, borderRadius: 10, backgroundColor: '#fff' },
  weekPillSel: { backgroundColor: '#7c3aed' },
  weekDow: { fontSize: 11, color: '#9ca3af', fontWeight: '700' },
  weekNum: { fontSize: 16, color: '#1f2937', fontWeight: '800', marginTop: 2 },
  weekTextSel: { color: '#fff' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#7c3aed', marginTop: 4 },
  dotEmpty: { width: 6, height: 6, marginTop: 4 },

  // month
  monthGrid: { backgroundColor: '#fff', borderRadius: 14, padding: 8, marginBottom: 16 },
  monthDowRow: { flexDirection: 'row' },
  monthDow: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#9ca3af', paddingVertical: 6 },
  monthWeek: { flexDirection: 'row' },
  monthCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', margin: 2, borderRadius: 8 },
  monthCellSel: { backgroundColor: '#7c3aed' },
  monthNum: { fontSize: 14, color: '#1f2937', fontWeight: '600' },
  monthToday: { color: '#7c3aed', fontWeight: '800' },

  // week time-grid
  wHeadRow: { flexDirection: 'row', marginBottom: 6 },
  wHead: { alignItems: 'center', paddingVertical: 6, borderRadius: 10, marginHorizontal: 1 },
  wHeadToday: { backgroundColor: colors.primaryLight },
  wHeadDow: { fontSize: 11, fontWeight: '700', color: colors.textFaint },
  wHeadNum: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 1 },
  wHeadTodayText: { color: colors.primaryDark },
  wLabel: { position: 'absolute', right: 6, width: 38, textAlign: 'right', fontSize: 11, fontWeight: '800', color: colors.textFaint },
  wCol: { borderLeftWidth: 1, borderLeftColor: colors.border, position: 'relative' },
  wLane: { position: 'absolute', left: 0, right: 0, borderBottomWidth: 1, borderBottomColor: '#f1eefb' },

  listHeading: { fontSize: 14, fontWeight: '800', color: '#5b21b6', marginBottom: 10, marginLeft: 4 },
  // Day time-grid: time labels on the left, a positioned canvas on the right.
  grid: { flexDirection: 'row', paddingTop: 8 },
  gLabel: { position: 'absolute', right: 8, width: 44, textAlign: 'right', fontSize: 12, fontWeight: '800', color: colors.textFaint },
  canvas: { flex: 1, borderLeftWidth: 2, borderLeftColor: colors.border },
  lane: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopColor: colors.border },
  block: { position: 'absolute', borderRadius: 8, borderLeftWidth: 4, paddingVertical: 3, paddingHorizontal: 7, marginLeft: 2, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  blockTopRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  blockTime: { fontSize: 11, fontWeight: '800' },
  blockPrice: { fontSize: 11, fontWeight: '800', color: colors.green },
  blockClient: { fontSize: 14, fontWeight: '800', color: colors.text },
  blockPet: { fontSize: 12, color: colors.textMute, marginTop: 1 },
  blockSvc: { fontSize: 12, color: '#374151', marginTop: 1, fontWeight: '600' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bookBtn: { backgroundColor: '#fff', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 16 },
  bookBtnText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  // MoeGo-style appointment card
  card: { backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden', marginBottom: 12, ...shadow },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14 },
  cardTime: { fontSize: 13, fontWeight: '800' },
  cardStatus: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  cardBody: { padding: 14 },
  cardClient: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardPet: { fontSize: 14, color: colors.textMute, marginTop: 3 },
  cardSvc: { fontSize: 14, color: '#374151', marginTop: 4, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  cardPrice: { fontSize: 16, fontWeight: '800', color: colors.green },
  cardPhone: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10 },
  time: { fontSize: 14, fontWeight: '800', color: '#7c3aed', width: 74 },
  pet: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  svc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 6 },
  statusText: { fontSize: 11, fontWeight: '800' },
  price: { fontSize: 15, fontWeight: '800', color: '#16a34a' },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 15, marginTop: 12 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
