import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Linking, TextInput, Switch, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import { loadAttached, saveAttached, markCompleted } from '../lib/attachedRetail';
import GradientHeader from '../components/GradientHeader';

function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function hhmm(d) { return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`; }
function toDate(dateStr, timeStr) {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const [hh, mm] = String(timeStr || '08:00').split(':').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

const STATUS = {
  pending: { label: 'Pending', color: '#b45309', bg: '#fef3c7' },
  confirmed: { label: 'Confirmed', color: '#2563eb', bg: '#dbeafe' },
  checked_in: { label: 'Checked In', color: '#166534', bg: '#dcfce7' },
  checked_out: { label: 'Checked Out', color: '#6b7280', bg: '#f3f4f6' },
  cancelled: { label: 'Cancelled', color: '#b91c1c', bg: '#fee2e2' },
};
const STATUS_OPTIONS = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];
const VAX_TYPES = [
  { label: 'Rabies', value: 'rabies' }, { label: 'DHPP', value: 'dhpp' }, { label: 'Bordetella', value: 'bordetella' },
  { label: 'Leptospirosis', value: 'leptospirosis' }, { label: 'Lyme', value: 'lyme' }, { label: 'Canine Influenza', value: 'canine_influenza' }, { label: 'Other', value: 'other' },
];
const VAX_LABELS = VAX_TYPES.reduce((m, t) => { m[t.value] = t.label; return m; }, {});

function callNumber(p) { if (p) Linking.openURL(`tel:${p.replace(/[^0-9+]/g, '')}`); }
function textNumber(p) { if (p) Linking.openURL(`sms:${p.replace(/[^0-9+]/g, '')}`); }
function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtT(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hh = parseInt(h, 10);
  return `${hh % 12 || 12}:${m} ${hh >= 12 ? 'PM' : 'AM'}`;
}
function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

export default function BoardingDetailScreen({ session, route, navigation }) {
  const { reservationId } = route.params;
  const [loading, setLoading] = useState(true);
  const [r, setR] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickStatus, setPickStatus] = useState(false);
  const [editing, setEditing] = useState(false);
  const [kennels, setKennels] = useState([]);
  const [clientPets, setClientPets] = useState([]);
  const [dStart, setDStart] = useState(new Date());
  const [dEnd, setDEnd] = useState(new Date());
  const [dKennelId, setDKennelId] = useState(null);
  const [dPrice, setDPrice] = useState('');
  const [dNotes, setDNotes] = useState('');
  const [picker, setPicker] = useState(null); // 'sd'|'st'|'ed'|'et'|null
  const [payments, setPayments] = useState([]);
  const [payMethod, setPayMethod] = useState('cash');
  const [payAmount, setPayAmount] = useState('');
  const [payTip, setPayTip] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [recording, setRecording] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [showAddSvc, setShowAddSvc] = useState(false);
  const [retailSale, setRetailSale] = useState(null);
  const [retailItems, setRetailItems] = useState([]);
  const [showRetail, setShowRetail] = useState(false);
  const [welfareLogs, setWelfareLogs] = useState([]);
  const [showWelfare, setShowWelfare] = useState(false);
  const [savingWelfare, setSavingWelfare] = useState(false);
  const [wDate, setWDate] = useState(new Date());
  const [wPickDate, setWPickDate] = useState(false);
  const [wPetId, setWPetId] = useState(null);
  const emptyWelfare = { ate_breakfast: null, ate_lunch: null, ate_dinner: null, drank_water: null, bowel_movement: '', urination: '', vomited: false, vomit_notes: '', behavior: '', food_notes: '', observations: '' };
  const [wForm, setWForm] = useState(emptyWelfare);
  const [vax, setVax] = useState([]);
  const [vaxFor, setVaxFor] = useState(null); // petId currently adding a vaccine
  const [savingVax, setSavingVax] = useState(false);
  const emptyVax = { vaccine_type: '', vaccine_name: '', vet_clinic: '', notes: '', administered: new Date(), expiration: new Date() };
  const [vForm, setVForm] = useState(emptyVax);
  const [vPicker, setVPicker] = useState(null); // 'admin' | 'exp' | null

  useEffect(() => { load(); }, []);

  async function loadVax(petIds) {
    if (!petIds || petIds.length === 0) { setVax([]); return; }
    const { data } = await supabase.from('pet_vaccinations').select('*').in('pet_id', petIds).order('expiration_date', { ascending: true });
    setVax(data || []);
  }

  async function addVaccine(petId) {
    if (!vForm.vaccine_type) { setErr('Pick a vaccine type.'); return; }
    setSavingVax(true); setErr('');
    try {
      const { error } = await supabase.from('pet_vaccinations').insert({
        pet_id: petId,
        vaccine_type: vForm.vaccine_type,
        vaccine_name: vForm.vaccine_name || null,
        administered_date: isoDate(vForm.administered),
        expiration_date: isoDate(vForm.expiration),
        vet_clinic: vForm.vet_clinic || null,
        notes: vForm.notes || null,
      });
      if (error) throw error;
      setVForm(emptyVax); setVaxFor(null);
      const ids = (r.boarding_reservation_pets || []).map((rp) => rp.pet_id);
      await loadVax(ids);
    } catch (e) { setErr(e.message || 'Could not add vaccine.'); } finally { setSavingVax(false); }
  }

  async function loadWelfare() {
    const { data } = await supabase.from('welfare_logs').select('*').eq('reservation_id', reservationId).order('log_date', { ascending: false });
    setWelfareLogs(data || []);
  }

  async function saveWelfare() {
    if (!wPetId) { setErr('Pick which pet this log is for.'); return; }
    setSavingWelfare(true); setErr('');
    try {
      const { error } = await supabase.from('welfare_logs').insert({
        reservation_id: reservationId,
        pet_id: wPetId,
        log_date: isoDate(wDate),
        ate_breakfast: wForm.ate_breakfast,
        ate_lunch: wForm.ate_lunch,
        ate_dinner: wForm.ate_dinner,
        food_notes: wForm.food_notes || null,
        drank_water: wForm.drank_water,
        bowel_movement: wForm.bowel_movement || null,
        urination: wForm.urination || null,
        vomited: wForm.vomited,
        vomit_notes: wForm.vomit_notes || null,
        behavior: wForm.behavior || null,
        observations: wForm.observations || null,
        recorded_by: session.user.id,
      });
      if (error) throw error;
      setWForm(emptyWelfare); setShowWelfare(false);
      await loadWelfare();
    } catch (e) { setErr(e.message || 'Could not save welfare log.'); } finally { setSavingWelfare(false); }
  }

  async function loadPayments() {
    const { data } = await supabase.from('payments')
      .select('id, amount, tip_amount, method, notes, created_at')
      .eq('boarding_reservation_id', reservationId).order('created_at', { ascending: true });
    setPayments(data || []);
  }
  async function loadRetail() {
    const { sale, items } = await loadAttached({ boardingReservationId: reservationId, groomerId: session.user.id });
    setRetailSale(sale ? sale.id : null);
    setRetailItems(items || []);
  }

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase
        .from('boarding_reservations')
        .select(`
          *,
          boarding_reservation_pets ( pet_id, pets:pet_id ( id, name, breed ) ),
          clients:client_id ( id, first_name, last_name, phone ),
          kennels:kennel_id ( name ),
          boarding_addons ( id, service_name, quoted_price )
        `)
        .eq('id', reservationId)
        .maybeSingle();
      if (error) throw error;
      setR(data);
      if (data) {
        setDStart(toDate(data.start_date, data.start_time));
        setDEnd(toDate(data.end_date, data.end_time));
        setDKennelId(data.kennel_id);
        setDPrice(data.total_price != null ? String(data.total_price) : '');
        setDNotes(data.notes || '');
        loadEditLists(data.client_id);
        loadPayments();
        loadRetail();
        loadWelfare();
        const petIds = (data.boarding_reservation_pets || []).map((rp) => rp.pet_id);
        loadVax(petIds);
        const firstPet = (data.boarding_reservation_pets || [])[0];
        if (firstPet && !wPetId) setWPetId(firstPet.pet_id);
      }
    } catch (e) {
      setErr(e.message || 'Could not load this stay.');
    } finally {
      setLoading(false);
    }
  }

  async function loadEditLists(clientId) {
    const [{ data: k }, { data: p }, { data: pr }, { data: sv }] = await Promise.all([
      supabase.from('kennels').select('id, name').eq('groomer_id', session.user.id).order('name'),
      clientId
        ? supabase.from('pets').select('id, name').eq('client_id', clientId).or('is_archived.is.null,is_archived.eq.false').or('is_memorial.is.null,is_memorial.eq.false')
        : Promise.resolve({ data: [] }),
      supabase.from('products').select('id, name, price, qty_on_hand').eq('groomer_id', session.user.id).eq('is_active', true).order('name'),
      supabase.from('services').select('id, service_name, price').eq('groomer_id', session.user.id).order('service_name'),
    ]);
    setKennels(k || []);
    setClientPets(p || []);
    setProducts(pr || []);
    setServices(sv || []);
  }

  async function addDepartureService(svc) {
    setShowAddSvc(false);
    setSaving(true); setErr('');
    try {
      const price = num(svc.price);
      const { error } = await supabase.from('boarding_addons').insert({
        boarding_reservation_id: reservationId,
        service_id: svc.id,
        service_name: svc.service_name,
        quoted_price: price,
        groomer_id: session.user.id,
      });
      if (error) throw error;
      if (price > 0) await supabase.from('boarding_reservations').update({ total_price: num(r.total_price) + price }).eq('id', reservationId);
      await load();
    } catch (e) { setErr(e.message || 'Could not add service.'); } finally { setSaving(false); }
  }
  async function removeDepartureService(addon) {
    setSaving(true); setErr('');
    try {
      const { error } = await supabase.from('boarding_addons').delete().eq('id', addon.id);
      if (error) throw error;
      const price = num(addon.quoted_price);
      if (price > 0) await supabase.from('boarding_reservations').update({ total_price: Math.max(num(r.total_price) - price, 0) }).eq('id', reservationId);
      await load();
    } catch (e) { setErr(e.message || 'Could not remove service.'); } finally { setSaving(false); }
  }

  async function persistRetail(items) {
    setSaving(true); setErr('');
    try {
      await saveAttached({ boardingReservationId: reservationId, groomerId: session.user.id, clientId: r && r.client_id, items });
      await loadRetail();
    } catch (e) { setErr(e.message || 'Could not save retail.'); } finally { setSaving(false); }
  }
  function addRetail(prod) {
    const existing = retailItems.find((x) => x.product_id === prod.id);
    let next;
    if (existing) next = retailItems.map((x) => x.product_id === prod.id ? { ...x, qty: x.qty + 1, line_total: (x.qty + 1) * x.unit_price } : x);
    else { const price = num(prod.price); next = [...retailItems, { product_id: prod.id, name: prod.name, qty: 1, unit_price: price, line_total: price }]; }
    persistRetail(next);
  }
  function removeRetail(productId) { persistRetail(retailItems.filter((x) => x.product_id !== productId)); }

  async function recordPayment(grandTotal) {
    const amt = parseFloat(payAmount || 0);
    const tip = parseFloat(payTip || 0);
    if (!(amt > 0 || tip > 0)) { setErr('Enter an amount.'); return; }
    setRecording(true); setErr('');
    try {
      const { error } = await supabase.from('payments').insert({
        boarding_reservation_id: reservationId,
        client_id: r.client_id,
        groomer_id: session.user.id,
        amount: amt, tip_amount: tip, method: payMethod, notes: payNotes || null,
      });
      if (error) throw error;
      const newPaid = payments.reduce((s, p) => s + num(p.amount), 0) + amt;
      if (retailSale && newPaid >= grandTotal - 0.005) {
        try { await markCompleted({ saleId: retailSale, paymentMethod: payMethod, userId: session.user.id }); } catch (e2) { /* non-fatal */ }
      }
      setPayAmount(''); setPayTip(''); setPayNotes(''); setShowPay(false);
      await loadPayments(); await loadRetail();
    } catch (e) { setErr(e.message || 'Could not record payment.'); } finally { setRecording(false); }
  }

  function onPick(_e, sel) {
    const which = picker;
    setPicker(null);
    if (!sel) return;
    if (which === 'sd') { const x = new Date(dStart); x.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate()); setDStart(x); }
    if (which === 'st') { const x = new Date(dStart); x.setHours(sel.getHours(), sel.getMinutes(), 0, 0); setDStart(x); }
    if (which === 'ed') { const x = new Date(dEnd); x.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate()); setDEnd(x); }
    if (which === 'et') { const x = new Date(dEnd); x.setHours(sel.getHours(), sel.getMinutes(), 0, 0); setDEnd(x); }
  }

  async function saveEdits() {
    setErr('');
    if (isoDate(dEnd) < isoDate(dStart)) { setErr('Pick-up is before drop-off.'); return; }
    setSaving(true);
    try {
      // Conflict check: same kennel overlapping these dates (excluding this stay)
      if (dKennelId) {
        const { data: clash } = await supabase.from('boarding_reservations')
          .select('id').eq('kennel_id', dKennelId).neq('id', reservationId).neq('status', 'cancelled')
          .lte('start_date', isoDate(dEnd)).gte('end_date', isoDate(dStart));
        if (clash && clash.length > 0) { setErr('That kennel is already booked for these dates.'); setSaving(false); return; }
      }
      const { error } = await supabase.from('boarding_reservations').update({
        kennel_id: dKennelId,
        start_date: isoDate(dStart), start_time: hhmm(dStart),
        end_date: isoDate(dEnd), end_time: hhmm(dEnd),
        total_price: parseFloat(dPrice) || 0,
        notes: dNotes.trim() || null,
      }).eq('id', reservationId);
      if (error) throw error;
      setEditing(false);
      await load();
    } catch (e) { setErr(e.message || 'Could not save changes.'); } finally { setSaving(false); }
  }

  async function addPetToStay(petId) {
    setSaving(true); setErr('');
    try {
      const { error } = await supabase.from('boarding_reservation_pets').insert({ reservation_id: reservationId, pet_id: petId });
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || 'Could not add pet.'); } finally { setSaving(false); }
  }
  async function removePetFromStay(petId) {
    setSaving(true); setErr('');
    try {
      const { error } = await supabase.from('boarding_reservation_pets').delete().eq('reservation_id', reservationId).eq('pet_id', petId);
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || 'Could not remove pet.'); } finally { setSaving(false); }
  }

  async function updateStatus(next) {
    setPickStatus(false);
    setSaving(true); setErr('');
    try {
      const { error } = await supabase.from('boarding_reservations').update({ status: next }).eq('id', reservationId);
      if (error) throw error;
      await load();
    } catch (e) { setErr(e.message || 'Could not update status.'); } finally { setSaving(false); }
  }

  function confirmCancel() {
    Alert.alert('Cancel reservation?', 'This will mark the stay as cancelled.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Yes, cancel', style: 'destructive', onPress: () => updateStatus('cancelled') },
    ]);
  }

  // Chip-group for text fields — options are [{label, value}]
  function ChipRow({ label, field, options }) {
    return (
      <View>
        <Text style={styles.editLabel}>{label}</Text>
        <View style={styles.chips}>
          {options.map((o) => {
            const active = wForm[field] === o.value;
            return (
              <Pressable key={o.value} style={[styles.chip, active && styles.chipSel]} onPress={() => setWForm((f) => ({ ...f, [field]: active ? '' : o.value }))}>
                <Text style={[styles.chipText, active && styles.chipTextSel]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
  // Yes/No group for boolean fields (true / false / unset)
  function BoolRow({ label, field }) {
    const v = wForm[field];
    return (
      <View>
        <Text style={styles.editLabel}>{label}</Text>
        <View style={styles.chips}>
          <Pressable style={[styles.chip, v === true && styles.chipSel]} onPress={() => setWForm((f) => ({ ...f, [field]: v === true ? null : true }))}>
            <Text style={[styles.chipText, v === true && styles.chipTextSel]}>Yes</Text>
          </Pressable>
          <Pressable style={[styles.chip, v === false && styles.chipSel]} onPress={() => setWForm((f) => ({ ...f, [field]: v === false ? null : false }))}>
            <Text style={[styles.chipText, v === false && styles.chipTextSel]}>No</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  function petNameById(id) {
    const p = (r ? (r.boarding_reservation_pets || []) : []).map((rp) => rp.pets).find((x) => x && x.id === id);
    return p ? p.name : 'Pet';
  }
  function welfareSummary(w) {
    const bits = [];
    const meals = ['ate_breakfast', 'ate_lunch', 'ate_dinner'].filter((k) => w[k] === true).length;
    if (meals) bits.push(`Ate ${meals} meal${meals > 1 ? 's' : ''}`);
    if (w.drank_water === true) bits.push('Drank water');
    if (w.drank_water === false) bits.push('No water');
    if (w.vomited) bits.push('Vomited');
    if (w.behavior) bits.push(w.behavior.charAt(0).toUpperCase() + w.behavior.slice(1));
    return bits.join(' · ');
  }

  const client = r && r.clients;
  const ss = r ? (STATUS[r.status] || { label: r.status || 'Status', color: colors.textMute, bg: '#f3f4f6' }) : null;
  const pets = r ? (r.boarding_reservation_pets || []).map((rp) => rp.pets).filter(Boolean) : [];
  const addons = r ? (r.boarding_addons || []) : [];
  const retailTotal = retailItems.reduce((s, l) => s + num(l.line_total), 0);
  const grandTotal = (r ? num(r.total_price) : 0) + retailTotal;
  const balanceDue = Math.max(grandTotal - payments.reduce((s, p) => s + num(p.amount), 0), 0);
  const intake = r ? [
    ['Feeding', r.feeding_schedule], ['Special diet', r.special_diet], ['Medications', r.medications_notes],
    ['Walks', r.walk_schedule], ['Playtime', r.playtime_notes], ['Behaviors with dogs', r.behaviors_with_dogs],
    ['Pickup person', r.pickup_person], ['Vet emergency', r.vet_emergency_contact], ['Items brought', r.items_brought],
  ].filter(([, v]) => v) : [];

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Boarding</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Ionicons name="bed" size={22} color="#fff" />
          <Text style={styles.title}>Boarding Stay</Text>
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : !r ? (
        <Text style={styles.err}>Stay not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Quick actions */}
          <View style={styles.quickBar}>
            {r.status !== 'checked_in' && r.status !== 'checked_out' && r.status !== 'cancelled' ? (
              <Pressable style={[styles.qaBtn, { backgroundColor: colors.green }, saving && { opacity: 0.6 }]} onPress={() => updateStatus('checked_in')} disabled={saving}>
                <Ionicons name="log-in-outline" size={18} color="#fff" /><Text style={styles.qaText}>Check In</Text>
              </Pressable>
            ) : null}
            {r.status === 'checked_in' ? (
              <Pressable style={[styles.qaBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]} onPress={() => updateStatus('checked_out')} disabled={saving}>
                <Ionicons name="flag-outline" size={18} color="#fff" /><Text style={styles.qaText}>Check Out</Text>
              </Pressable>
            ) : null}
            {r.status !== 'cancelled' && r.status !== 'checked_out' ? (
              <Pressable style={[styles.qaCancel, saving && { opacity: 0.6 }]} onPress={confirmCancel} disabled={saving}>
                <Text style={styles.qaCancelText}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Stay */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              {ss ? (
                <Pressable style={[styles.badge, { backgroundColor: ss.bg }]} onPress={() => setPickStatus((v) => !v)}>
                  <Text style={[styles.badgeText, { color: ss.color }]}>{(ss.label || '').toUpperCase()}</Text>
                  <Ionicons name={pickStatus ? 'chevron-up' : 'chevron-down'} size={14} color={ss.color} />
                </Pressable>
              ) : <View />}
              <Pressable style={styles.changeBtn} onPress={() => setEditing((v) => !v)}>
                <Text style={styles.changeText}>{editing ? 'Done' : 'Edit'}</Text>
              </Pressable>
            </View>
            {pickStatus ? (
              <View style={styles.statusGrid}>
                {STATUS_OPTIONS.map((s) => {
                  const so = STATUS[s];
                  const active = s === r.status;
                  return (
                    <Pressable key={s} style={[styles.statusOpt, active && { backgroundColor: so.bg, borderColor: so.color }]} onPress={() => updateStatus(s)}>
                      <Text style={[styles.statusOptText, active && { color: so.color }]}>{so.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {!editing ? (
              <>
                <View style={styles.line}><Ionicons name="home-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{(r.kennels && r.kennels.name) || 'Kennel'}</Text></View>
                <View style={styles.line}><Ionicons name="calendar-outline" size={16} color={colors.textMute} /><Text style={styles.lineText}>{fmtDate(r.start_date)}{r.start_time ? ` ${fmtT(r.start_time)}` : ''}  →  {fmtDate(r.end_date)}{r.end_time ? ` ${fmtT(r.end_time)}` : ''}</Text></View>
                {r.total_price != null ? <View style={styles.line}><Ionicons name="cash-outline" size={16} color={colors.textMute} /><Text style={[styles.lineText, { color: colors.green, fontWeight: '800' }]}>${num(r.total_price).toFixed(2)}</Text></View> : null}
              </>
            ) : (
              <View>
                <Text style={styles.editLabel}>Kennel</Text>
                <View style={styles.chips}>
                  {kennels.map((k) => (
                    <Pressable key={k.id} style={[styles.chip, dKennelId === k.id && styles.chipSel]} onPress={() => setDKennelId(k.id)}>
                      <Text style={[styles.chipText, dKennelId === k.id && styles.chipTextSel]}>{k.name || 'Kennel'}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.editLabel}>Drop-off</Text>
                <View style={styles.whenRow}>
                  <Pressable style={styles.whenBtn} onPress={() => setPicker('sd')}><Text style={styles.whenText}>{dStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text></Pressable>
                  <Pressable style={styles.whenBtn} onPress={() => setPicker('st')}><Text style={styles.whenText}>{dStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text></Pressable>
                </View>
                <Text style={styles.editLabel}>Pick-up</Text>
                <View style={styles.whenRow}>
                  <Pressable style={styles.whenBtn} onPress={() => setPicker('ed')}><Text style={styles.whenText}>{dEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text></Pressable>
                  <Pressable style={styles.whenBtn} onPress={() => setPicker('et')}><Text style={styles.whenText}>{dEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text></Pressable>
                </View>
                {picker === 'sd' ? <DateTimePicker value={dStart} mode="date" onChange={onPick} /> : null}
                {picker === 'st' ? <DateTimePicker value={dStart} mode="time" onChange={onPick} /> : null}
                {picker === 'ed' ? <DateTimePicker value={dEnd} mode="date" onChange={onPick} /> : null}
                {picker === 'et' ? <DateTimePicker value={dEnd} mode="time" onChange={onPick} /> : null}
                <Text style={styles.editLabel}>Total price</Text>
                <TextInput style={styles.input} value={dPrice} onChangeText={setDPrice} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.textFaint} />
                <Text style={styles.editLabel}>Notes</Text>
                <TextInput style={[styles.input, styles.multiline]} value={dNotes} onChangeText={setDNotes} placeholder="Notes…" placeholderTextColor={colors.textFaint} multiline />
                <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveEdits} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
                </Pressable>
              </View>
            )}
          </View>

          {/* Client */}
          {client ? (
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Owner</Text>
                <Pressable style={styles.changeBtn} onPress={() => navigation.navigate('Clients', { screen: 'ClientDetail', params: { clientId: client.id, name: `${client.first_name || ''} ${client.last_name || ''}`.trim() } })}>
                  <Text style={styles.changeText}>View Profile</Text>
                </Pressable>
              </View>
              <Text style={styles.clientName}>{`${client.first_name || ''} ${client.last_name || ''}`.trim()}</Text>
              {client.phone ? <Text style={styles.clientPhone}>{client.phone}</Text> : null}
              {client.phone ? (
                <View style={styles.actions}>
                  <Pressable style={styles.actionBtn} onPress={() => callNumber(client.phone)}><Ionicons name="call" size={16} color={colors.primaryDark} /><Text style={styles.actionText}>Call</Text></Pressable>
                  <Pressable style={styles.actionBtn} onPress={() => textNumber(client.phone)}><Ionicons name="chatbubble" size={16} color={colors.primaryDark} /><Text style={styles.actionText}>Text</Text></Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Pets */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pets ({pets.length})</Text>
            {pets.map((p) => (
              <View key={p.id} style={styles.petRow}>
                <View style={styles.petIcon}><Ionicons name="paw" size={15} color={colors.primary} /></View>
                <Text style={styles.petName}>{p.name}{p.breed ? <Text style={styles.petBreed}>  ·  {p.breed}</Text> : null}</Text>
                {editing && pets.length > 1 ? (
                  <Pressable onPress={() => removePetFromStay(p.id)} hitSlop={8}>
                    <Ionicons name="close-circle" size={22} color={colors.textFaint} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {editing ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.editLabel}>Add a pet</Text>
                <View style={styles.chips}>
                  {clientPets.filter((cp) => !pets.some((p) => p.id === cp.id)).map((cp) => (
                    <Pressable key={cp.id} style={styles.chip} onPress={() => addPetToStay(cp.id)}>
                      <Text style={styles.chipText}>+ {cp.name || 'Pet'}</Text>
                    </Pressable>
                  ))}
                  {clientPets.filter((cp) => !pets.some((p) => p.id === cp.id)).length === 0 ? (
                    <Text style={styles.muted}>No other pets on file.</Text>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>

          {/* Vaccinations */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Vaccinations</Text>
            {pets.map((p) => {
              const recs = vax.filter((v) => v.pet_id === p.id);
              return (
                <View key={p.id} style={styles.vaxPet}>
                  <View style={styles.vaxPetHead}>
                    <Text style={styles.vaxPetName}>{p.name}</Text>
                    <Pressable style={styles.changeBtn} onPress={() => { setVaxFor(vaxFor === p.id ? null : p.id); setVForm(emptyVax); }}>
                      <Text style={styles.changeText}>{vaxFor === p.id ? 'Close' : '+ Add'}</Text>
                    </Pressable>
                  </View>
                  {recs.length === 0 ? (
                    <Text style={styles.muted}>No records on file.</Text>
                  ) : (
                    recs.map((v) => {
                      const expired = v.expiration_date && new Date(v.expiration_date) < new Date(new Date().toDateString());
                      return (
                        <View key={v.id} style={styles.vaxRow}>
                          <Text style={styles.vaxType}>{VAX_LABELS[v.vaccine_type] || v.vaccine_type}{v.vaccine_name ? ` · ${v.vaccine_name}` : ''}</Text>
                          <Text style={[styles.vaxExp, expired && { color: '#b91c1c', fontWeight: '800' }]}>{expired ? 'EXPIRED ' : 'exp '}{fmtDate(v.expiration_date)}</Text>
                        </View>
                      );
                    })
                  )}
                  {vaxFor === p.id ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={styles.editLabel}>Vaccine type</Text>
                      <View style={styles.chips}>
                        {VAX_TYPES.map((t) => (
                          <Pressable key={t.value} style={[styles.chip, vForm.vaccine_type === t.value && styles.chipSel]} onPress={() => setVForm((f) => ({ ...f, vaccine_type: t.value }))}>
                            <Text style={[styles.chipText, vForm.vaccine_type === t.value && styles.chipTextSel]}>{t.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Text style={styles.editLabel}>Vaccine name (optional)</Text>
                      <TextInput style={styles.input} value={vForm.vaccine_name} onChangeText={(t) => setVForm((f) => ({ ...f, vaccine_name: t }))} placeholder="e.g. Nobivac" placeholderTextColor={colors.textFaint} />
                      <View style={styles.whenRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.editLabel}>Given</Text>
                          <Pressable style={styles.whenBtn} onPress={() => setVPicker('admin')}><Text style={styles.whenText}>{vForm.administered.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</Text></Pressable>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.editLabel}>Expires</Text>
                          <Pressable style={styles.whenBtn} onPress={() => setVPicker('exp')}><Text style={styles.whenText}>{vForm.expiration.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</Text></Pressable>
                        </View>
                      </View>
                      {vPicker === 'admin' ? <DateTimePicker value={vForm.administered} mode="date" onChange={(_e, s) => { setVPicker(null); if (s) setVForm((f) => ({ ...f, administered: s })); }} /> : null}
                      {vPicker === 'exp' ? <DateTimePicker value={vForm.expiration} mode="date" onChange={(_e, s) => { setVPicker(null); if (s) setVForm((f) => ({ ...f, expiration: s })); }} /> : null}
                      <Text style={styles.editLabel}>Vet clinic (optional)</Text>
                      <TextInput style={styles.input} value={vForm.vet_clinic} onChangeText={(t) => setVForm((f) => ({ ...f, vet_clinic: t }))} placeholder="Clinic name" placeholderTextColor={colors.textFaint} />
                      <Pressable style={[styles.saveBtn, savingVax && { opacity: 0.6 }]} onPress={() => addVaccine(p.id)} disabled={savingVax}>
                        {savingVax ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save vaccine</Text>}
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* Departure / add-on services */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Departure Services</Text>
              <Pressable style={styles.changeBtn} onPress={() => setShowAddSvc((v) => !v)}>
                <Text style={styles.changeText}>{showAddSvc ? 'Close' : '+ Add service'}</Text>
              </Pressable>
            </View>
            {addons.length === 0 ? (
              <Text style={styles.muted}>Nothing added yet. Add a bath, nail trim, or other extra at pickup.</Text>
            ) : (
              addons.map((ad) => (
                <View key={ad.id} style={styles.addonRow}>
                  <Text style={styles.addonName}>{ad.service_name}</Text>
                  <Text style={styles.addonPrice}>${num(ad.quoted_price).toFixed(2)}</Text>
                  <Pressable onPress={() => removeDepartureService(ad)} hitSlop={8} style={{ marginLeft: 10 }}>
                    <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                  </Pressable>
                </View>
              ))
            )}
            {showAddSvc ? (
              <View style={{ marginTop: 8, gap: 6 }}>
                {services.length === 0 ? <Text style={styles.muted}>No services set up.</Text> : null}
                {services.map((sv) => (
                  <Pressable key={sv.id} style={styles.svcOpt} onPress={() => addDepartureService(sv)}>
                    <Text style={styles.svcOptName}>{sv.service_name}</Text>
                    <Text style={styles.svcOptPrice}>{sv.price != null ? `$${parseFloat(sv.price).toFixed(2)}` : ''}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* Retail */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Retail</Text>
              <Pressable style={styles.changeBtn} onPress={() => setShowRetail((v) => !v)}>
                <Text style={styles.changeText}>{showRetail ? 'Close' : 'Add retail'}</Text>
              </Pressable>
            </View>
            {retailItems.length === 0 ? (
              <Text style={styles.muted}>No retail on this bill.</Text>
            ) : (
              retailItems.map((li) => (
                <View key={li.product_id} style={styles.addonRow}>
                  <Text style={styles.addonName}>{li.name}{li.qty > 1 ? `  ×${li.qty}` : ''}</Text>
                  <Text style={styles.addonPrice}>${num(li.line_total).toFixed(2)}</Text>
                  <Pressable onPress={() => removeRetail(li.product_id)} hitSlop={8} style={{ marginLeft: 10 }}>
                    <Ionicons name="close-circle" size={20} color={colors.textFaint} />
                  </Pressable>
                </View>
              ))
            )}
            {showRetail ? (
              <View style={{ marginTop: 8, gap: 6 }}>
                {products.length === 0 ? <Text style={styles.muted}>No products set up.</Text> : null}
                {products.map((pr) => (
                  <Pressable key={pr.id} style={styles.svcOpt} onPress={() => addRetail(pr)}>
                    <Text style={styles.svcOptName}>{pr.name}{pr.qty_on_hand != null ? `  ·  ${pr.qty_on_hand} in stock` : ''}</Text>
                    <Text style={styles.svcOptPrice}>{pr.price != null ? `$${parseFloat(pr.price).toFixed(2)}` : ''}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {/* Payment */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Payment</Text>
              <Pressable style={styles.changeBtn} onPress={() => { setShowPay((v) => !v); setPayAmount(balanceDue ? String(balanceDue.toFixed(2)) : ''); }}>
                <Text style={styles.changeText}>{showPay ? 'Close' : 'Take Payment'}</Text>
              </Pressable>
            </View>
            {payments.length === 0 ? (
              <Text style={styles.muted}>No payments recorded yet.</Text>
            ) : (
              payments.map((pm) => (
                <View key={pm.id} style={styles.addonRow}>
                  <Text style={styles.addonName}>{(pm.method || '').charAt(0).toUpperCase() + (pm.method || '').slice(1)}{pm.tip_amount ? `  (+$${num(pm.tip_amount).toFixed(2)} tip)` : ''}</Text>
                  <Text style={styles.addonPrice}>${num(pm.amount).toFixed(2)}</Text>
                </View>
              ))
            )}
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Bill total{retailTotal > 0 ? ' (stay + retail)' : ''}</Text>
              <Text style={styles.billValue}>${grandTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{balanceDue > 0 ? 'Balance due' : 'Paid in full'}</Text>
              <Text style={[styles.totalValue, balanceDue > 0 ? { color: '#b91c1c' } : { color: colors.green }]}>${balanceDue.toFixed(2)}</Text>
            </View>
            {showPay ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.editLabel}>Method</Text>
                <View style={styles.chips}>
                  {[{ label: 'Cash', value: 'cash' }, { label: 'Zelle', value: 'zelle' }, { label: 'Venmo', value: 'venmo' }].map((mth) => (
                    <Pressable key={mth.value} style={[styles.chip, payMethod === mth.value && styles.chipSel]} onPress={() => setPayMethod(mth.value)}>
                      <Text style={[styles.chipText, payMethod === mth.value && styles.chipTextSel]}>{mth.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.whenRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editLabel}>Amount</Text>
                    <TextInput style={styles.input} value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.textFaint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.editLabel}>Tip (optional)</Text>
                    <TextInput style={styles.input} value={payTip} onChangeText={setPayTip} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.textFaint} />
                  </View>
                </View>
                <TextInput style={[styles.input, { marginTop: 10 }]} value={payNotes} onChangeText={setPayNotes} placeholder="Notes (optional)" placeholderTextColor={colors.textFaint} />
                <Pressable style={[styles.saveBtn, recording && { opacity: 0.6 }]} onPress={() => recordPayment(grandTotal)} disabled={recording}>
                  {recording ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Record payment</Text>}
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Receipt */}
          <Pressable
            style={styles.receiptBtn}
            onPress={() => navigation.navigate('Receipt', { kind: 'boarding', id: reservationId })}
          >
            <Ionicons name="receipt-outline" size={18} color={colors.primaryDark} />
            <Text style={styles.receiptText}>Receipt</Text>
          </Pressable>

          {/* Care & intake */}
          {intake.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Care & Intake</Text>
              {intake.map(([label, val]) => (
                <View key={label} style={styles.intakeRow}>
                  <Text style={styles.intakeLabel}>{label}</Text>
                  <Text style={styles.intakeVal}>{val}</Text>
                </View>
              ))}
              {r.crate_trained ? <Text style={styles.intakeFlag}>✓ Crate trained</Text> : null}
              {r.grooming_at_end ? <Text style={styles.intakeFlag}>✓ Grooming at end of stay</Text> : null}
            </View>
          ) : null}

          {/* Daily Welfare Log */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Daily Welfare Log</Text>
              <Pressable style={styles.changeBtn} onPress={() => setShowWelfare((v) => !v)}>
                <Text style={styles.changeText}>{showWelfare ? 'Close' : '+ Add log'}</Text>
              </Pressable>
            </View>

            {welfareLogs.length === 0 ? (
              <Text style={styles.muted}>No welfare logs yet for this stay.</Text>
            ) : (
              welfareLogs.map((w) => (
                <View key={w.id} style={styles.welfRow}>
                  <Text style={styles.welfDate}>{fmtDate(w.log_date)} · {petNameById(w.pet_id)}</Text>
                  {welfareSummary(w) ? <Text style={styles.welfSummary}>{welfareSummary(w)}</Text> : null}
                  {w.observations ? <Text style={styles.welfNotes}>{w.observations}</Text> : null}
                </View>
              ))
            )}

            {showWelfare ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.editLabel}>Log date</Text>
                <Pressable style={styles.whenBtn} onPress={() => setWPickDate(true)}>
                  <Text style={styles.whenText}>{wDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                </Pressable>
                {wPickDate ? <DateTimePicker value={wDate} mode="date" onChange={(_e, s) => { setWPickDate(false); if (s) setWDate(s); }} /> : null}

                {pets.length > 1 ? (
                  <>
                    <Text style={styles.editLabel}>Pet</Text>
                    <View style={styles.chips}>
                      {pets.map((p) => (
                        <Pressable key={p.id} style={[styles.chip, wPetId === p.id && styles.chipSel]} onPress={() => setWPetId(p.id)}>
                          <Text style={[styles.chipText, wPetId === p.id && styles.chipTextSel]}>{p.name || 'Pet'}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : null}

                <Text style={styles.wfSection}>Feeding</Text>
                <BoolRow label="Ate breakfast" field="ate_breakfast" />
                <BoolRow label="Ate lunch" field="ate_lunch" />
                <BoolRow label="Ate dinner" field="ate_dinner" />
                <BoolRow label="Drank water" field="drank_water" />
                <Text style={styles.editLabel}>Food notes</Text>
                <TextInput style={styles.input} value={wForm.food_notes} onChangeText={(t) => setWForm((f) => ({ ...f, food_notes: t }))} placeholder="Picky eater, ate half…" placeholderTextColor={colors.textFaint} />

                <Text style={styles.wfSection}>Bathroom</Text>
                <ChipRow label="Bowel movement" field="bowel_movement" options={[{ label: 'Normal', value: 'normal' }, { label: 'Loose', value: 'loose' }, { label: 'Diarrhea', value: 'diarrhea' }, { label: 'None', value: 'none' }]} />
                <ChipRow label="Urination" field="urination" options={[{ label: 'Normal', value: 'normal' }, { label: 'Frequent', value: 'frequent' }, { label: 'Accident', value: 'accident' }, { label: 'None', value: 'none' }]} />

                <View style={styles.vomRow}>
                  <Text style={styles.switchLabel}>Vomited?</Text>
                  <Switch value={wForm.vomited} onValueChange={(v) => setWForm((f) => ({ ...f, vomited: v }))} trackColor={{ true: colors.primary }} thumbColor="#fff" />
                </View>
                {wForm.vomited ? (
                  <TextInput style={styles.input} value={wForm.vomit_notes} onChangeText={(t) => setWForm((f) => ({ ...f, vomit_notes: t }))} placeholder="Vomit notes…" placeholderTextColor={colors.textFaint} />
                ) : null}

                <ChipRow label="Behavior & mood" field="behavior" options={[{ label: 'Happy', value: 'happy' }, { label: 'Playful', value: 'playful' }, { label: 'Normal', value: 'normal' }, { label: 'Anxious', value: 'anxious' }, { label: 'Lethargic', value: 'lethargic' }, { label: 'Aggressive', value: 'aggressive' }]} />
                <Text style={styles.editLabel}>Observations</Text>
                <TextInput style={[styles.input, styles.multiline]} value={wForm.observations} onChangeText={(t) => setWForm((f) => ({ ...f, observations: t }))} placeholder="Energy level, socialization, anything unusual…" placeholderTextColor={colors.textFaint} multiline />

                <Pressable style={[styles.saveBtn, savingWelfare && { opacity: 0.6 }]} onPress={saveWelfare} disabled={savingWelfare}>
                  {savingWelfare ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save welfare log</Text>}
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Notes */}
          {r.notes ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notes</Text>
              <Text style={styles.notes}>{r.notes}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  quickBar: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  qaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 14 },
  qaText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  qaCancel: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  qaCancelText: { color: '#b91c1c', fontSize: 15, fontWeight: '800' },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 14, ...shadow },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeBtn: { backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 12, marginBottom: 8 },
  changeText: { color: colors.primaryDark, fontWeight: '800', fontSize: 13 },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primaryLight, borderRadius: 12, paddingVertical: 14, marginBottom: 14 },
  receiptText: { color: colors.primaryDark, fontWeight: '800', fontSize: 15 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10 },
  badgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  statusOpt: { borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  statusOptText: { fontSize: 13, fontWeight: '700', color: colors.textMute },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  lineText: { fontSize: 15, color: colors.text, flexShrink: 1 },
  clientName: { fontSize: 18, fontWeight: '800', color: colors.text },
  clientPhone: { fontSize: 14, color: colors.textMute, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.primaryLight, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  actionText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  petRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  petIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  petName: { fontSize: 16, fontWeight: '800', color: colors.text },
  petBreed: { fontSize: 13, fontWeight: '600', color: colors.textMute },
  addonRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  addonName: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1 },
  addonPrice: { fontSize: 14, color: colors.green, fontWeight: '700' },
  intakeRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  intakeLabel: { fontSize: 12, fontWeight: '800', color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.3 },
  intakeVal: { fontSize: 15, color: colors.text, marginTop: 2 },
  intakeFlag: { fontSize: 14, color: colors.green, fontWeight: '700', marginTop: 8 },
  notes: { fontSize: 15, color: '#374151', lineHeight: 21 },
  editLabel: { fontSize: 12, fontWeight: '800', color: colors.textMute, marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#fff', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#374151', fontWeight: '700', fontSize: 13 },
  chipTextSel: { color: '#fff' },
  muted: { color: colors.textFaint, fontSize: 14 },
  whenRow: { flexDirection: 'row', gap: 10 },
  whenBtn: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  whenText: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  input: { backgroundColor: '#f9fafb', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  multiline: { minHeight: 56, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  svcOpt: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  svcOptName: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1 },
  svcOptPrice: { fontSize: 14, color: colors.green, fontWeight: '700' },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  billLabel: { fontSize: 13, color: colors.textMute },
  billValue: { fontSize: 14, color: colors.text, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8, paddingTop: 12 },
  totalLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.green },
  wfSection: { fontSize: 13, fontWeight: '800', color: colors.primaryDark, marginTop: 16, marginBottom: 2 },
  vaxPet: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  vaxPetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  vaxPetName: { fontSize: 15, fontWeight: '800', color: colors.text },
  vaxRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  vaxType: { fontSize: 14, color: colors.text, fontWeight: '600', flex: 1 },
  vaxExp: { fontSize: 13, color: colors.textMute },
  welfRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  welfDate: { fontSize: 14, fontWeight: '800', color: colors.primaryDark },
  welfSummary: { fontSize: 14, color: colors.text, marginTop: 2 },
  welfNotes: { fontSize: 13, color: colors.textMute, marginTop: 2, fontStyle: 'italic' },
  vomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  switchLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
