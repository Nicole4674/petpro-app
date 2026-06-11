import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

const PAY_METHODS = ['cash', 'zelle', 'venmo', 'card', 'comp'];
const EMPTY_FORM = { id: null, name: '', description: '', service_ids: [], total_punches: '6', price: '', expires_months: '', is_active: true };

function money(v) { const n = parseFloat(v); return `$${(isNaN(n) ? 0 : n).toFixed(2)}`; }
function fmtDate(s) { if (!s) return ''; return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

export default function PunchCardsScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [soldCards, setSoldCards] = useState([]);
  const [services, setServices] = useState([]);
  const [clients, setClients] = useState([]);
  const [err, setErr] = useState('');

  // create/edit form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // sell flow
  const [sellType, setSellType] = useState(null);
  const [sellSearch, setSellSearch] = useState('');
  const [sellClient, setSellClient] = useState(null);
  const [sellMethod, setSellMethod] = useState('cash');
  const [selling, setSelling] = useState(false);

  const gid = session.user.id;

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const [{ data: t }, { data: sold }, { data: svc }, { data: cls }] = await Promise.all([
        supabase.from('punch_card_types').select('*').eq('groomer_id', gid).order('created_at', { ascending: false }),
        supabase.from('punch_cards').select('*, clients:client_id(first_name, last_name)').eq('groomer_id', gid).order('created_at', { ascending: false }).limit(50),
        supabase.from('services').select('id, service_name, price').eq('groomer_id', gid).eq('is_active', true).order('service_name'),
        supabase.from('clients').select('id, first_name, last_name, phone').eq('groomer_id', gid).order('last_name'),
      ]);
      setTypes(t || []); setSoldCards(sold || []); setServices(svc || []); setClients(cls || []);
    } catch (e) { setErr(e.message || 'Could not load punch cards.'); } finally { setLoading(false); }
  }

  function setF(patch) { setForm((f) => ({ ...f, ...patch })); }
  function toggleService(sid) {
    setF({ service_ids: form.service_ids.includes(sid) ? form.service_ids.filter((x) => x !== sid) : form.service_ids.concat(sid) });
  }
  function openNew() { setForm(EMPTY_FORM); setShowForm(true); }
  function openEdit(t) {
    setForm({
      id: t.id, name: t.name || '', description: t.description || '',
      service_ids: Array.isArray(t.service_ids) ? t.service_ids : [],
      total_punches: String(t.total_punches || 6),
      price: t.price != null ? String(t.price) : '',
      expires_months: t.expires_months != null ? String(t.expires_months) : '',
      is_active: t.is_active !== false,
    });
    setShowForm(true);
  }

  async function saveType() {
    if (!form.name.trim()) { setErr('Name the punch card first (e.g. "6 Baths — pay for 5!").'); return; }
    if (form.service_ids.length === 0) { setErr('Pick at least one service a punch can be used on.'); return; }
    const punches = parseInt(form.total_punches, 10);
    if (!punches || punches < 1) { setErr('How many punches does it come with?'); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { setErr('Set a price (what the client pays up front).'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        groomer_id: gid, name: form.name.trim(), description: form.description.trim() || null,
        service_ids: form.service_ids, total_punches: punches, price,
        expires_months: form.expires_months ? parseInt(form.expires_months, 10) : null, is_active: form.is_active,
      };
      const { error } = form.id
        ? await supabase.from('punch_card_types').update(payload).eq('id', form.id)
        : await supabase.from('punch_card_types').insert([payload]);
      if (error) throw error;
      setShowForm(false); setForm(EMPTY_FORM); load();
    } catch (e) { setErr(e.message || 'Could not save.'); } finally { setSaving(false); }
  }

  async function toggleActive(t) {
    try {
      const { error } = await supabase.from('punch_card_types').update({ is_active: !t.is_active }).eq('id', t.id);
      if (error) throw error;
      load();
    } catch (e) { setErr(e.message || 'Could not update.'); }
  }

  function openSell(t) { setSellType(t); setSellSearch(''); setSellClient(null); setSellMethod('cash'); }

  function confirmSell() {
    if (!sellType || !sellClient) return;
    Alert.alert(
      'Sell punch card?',
      `Sell "${sellType.name}" to ${sellClient.first_name} ${sellClient.last_name} for ${money(sellType.price)} (${sellMethod})?\n\n${sellType.total_punches} punches${sellType.expires_months ? ` · expires in ${sellType.expires_months} months` : ' · never expires'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Record sale', onPress: doSell },
      ]
    );
  }

  async function doSell() {
    setSelling(true); setErr('');
    try {
      let expiresAt = null;
      if (sellType.expires_months) { const d = new Date(); d.setMonth(d.getMonth() + sellType.expires_months); expiresAt = d.toISOString().slice(0, 10); }
      const { error } = await supabase.from('punch_cards').insert([{
        groomer_id: gid, client_id: sellClient.id, type_id: sellType.id, name: sellType.name,
        service_ids: sellType.service_ids, total_punches: sellType.total_punches, punches_remaining: sellType.total_punches,
        price_paid: sellType.price, payment_method: sellMethod, expires_at: expiresAt, status: 'active',
      }]);
      if (error) throw error;
      setSellType(null); setSellClient(null); load();
    } catch (e) { setErr(e.message || 'Could not record the sale.'); } finally { setSelling(false); }
  }

  function serviceNames(ids) {
    return (ids || []).map((id) => { const s = services.find((x) => x.id === id); return s ? s.service_name : null; }).filter(Boolean).join(', ') || '(services no longer active)';
  }

  const sellMatches = sellSearch.trim()
    ? clients.filter((c) => `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(sellSearch.toLowerCase().trim())).slice(0, 8)
    : [];

  // deal math for the form
  const dealMath = (() => {
    const punches = parseInt(form.total_punches, 10) || 0;
    const price = parseFloat(form.price) || 0;
    const selSvcs = services.filter((s) => form.service_ids.includes(s.id));
    const maxSvc = selSvcs.reduce((best, s) => (!best || parseFloat(s.price) > parseFloat(best.price)) ? s : best, null);
    if (!punches || !price || !maxSvc) return null;
    const regular = parseFloat(maxSvc.price) * punches;
    const perVisit = price / punches;
    const savings = regular - price;
    return { perVisit, maxPrice: parseFloat(maxSvc.price), savings, regular };
  })();

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}><Ionicons name="ticket" size={20} color="#fff" /><Text style={styles.title}>Punch Cards</Text></View>
          <Pressable style={styles.newBtn} onPress={openNew}><Text style={styles.newBtnText}>+ New</Text></Pressable>
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Text style={styles.intro}>Prepaid packages — "buy 5 baths, get 1 free." Clients pay once; punches auto-suggest at checkout.</Text>

          {/* Card types */}
          {types.length === 0 ? (
            <Text style={styles.empty}>No punch cards yet. A classic: "6 baths for the price of 5" — cash up front for you, a deal for them.</Text>
          ) : types.map((t) => (
            <View key={t.id} style={[styles.card, !t.is_active && { opacity: 0.6 }]}>
              <Text style={styles.cardName}>{t.name}{!t.is_active ? <Text style={styles.paused}>  · paused</Text> : null}</Text>
              <Text style={styles.cardLine}><Text style={styles.bold}>{money(t.price)}</Text> for <Text style={styles.bold}>{t.total_punches} punches</Text> · {t.expires_months ? `expires ${t.expires_months} mo after purchase` : 'never expires'}</Text>
              <Text style={styles.cardCovers}>Covers: {serviceNames(t.service_ids)}</Text>
              <View style={styles.cardBtns}>
                <Pressable style={[styles.sellBtn, !t.is_active && { backgroundColor: '#e5e7eb' }]} onPress={() => t.is_active && openSell(t)} disabled={!t.is_active}>
                  <Text style={[styles.sellBtnText, !t.is_active && { color: '#9ca3af' }]}>💵 Sell to client</Text>
                </Pressable>
                <Pressable style={styles.smBtn} onPress={() => toggleActive(t)}><Text style={styles.smBtnText}>{t.is_active ? 'Pause' : 'Activate'}</Text></Pressable>
                <Pressable style={styles.smBtn} onPress={() => openEdit(t)}><Text style={styles.smBtnText}>Edit</Text></Pressable>
              </View>
            </View>
          ))}

          {/* Sold cards */}
          {soldCards.length > 0 ? (
            <>
              <Text style={styles.section}>Sold cards</Text>
              {soldCards.map((pc) => {
                const cname = pc.clients ? `${pc.clients.first_name || ''} ${pc.clients.last_name || ''}`.trim() : '?';
                const pct = pc.total_punches > 0 ? pc.punches_remaining / pc.total_punches : 0;
                return (
                  <View key={pc.id} style={styles.soldRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.soldName}><Text style={styles.bold}>{cname}</Text> · {pc.name}</Text>
                      <Text style={styles.soldMeta}>{money(pc.price_paid)} ({pc.payment_method}) · {fmtDate(pc.purchased_at || pc.created_at)}{pc.expires_at ? ` · expires ${pc.expires_at}` : ''}</Text>
                      <View style={styles.soldBar}><View style={[styles.soldBarFill, { width: `${pct * 100}%` }]} /></View>
                    </View>
                    <Text style={[styles.soldLeft, { color: pc.punches_remaining > 0 ? colors.green : colors.textFaint }]}>{pc.punches_remaining}/{pc.total_punches}</Text>
                  </View>
                );
              })}
            </>
          ) : null}
        </ScrollView>
      )}

      {/* Create / edit modal */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{form.id ? 'Edit Punch Card' : 'New Punch Card'}</Text>

              <Text style={styles.label}>Name (clients see this)</Text>
              <TextInput style={styles.input} value={form.name} onChangeText={(v) => setF({ name: v })} placeholder='e.g. "6 Baths — pay for 5!"' placeholderTextColor={colors.textFaint} />

              <Text style={styles.label}>Which services can a punch be used on?</Text>
              <View style={styles.chips}>
                {services.map((s) => {
                  const on = form.service_ids.includes(s.id);
                  return (
                    <Pressable key={s.id} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleService(s.id)}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.service_name} ({money(s.price)})</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.row3}>
                <View style={styles.f1}>
                  <Text style={styles.label}># punches</Text>
                  <TextInput style={styles.input} value={form.total_punches} onChangeText={(v) => setF({ total_punches: v })} keyboardType="number-pad" />
                </View>
                <View style={styles.f1}>
                  <Text style={styles.label}>Card price</Text>
                  <TextInput style={styles.input} value={form.price} onChangeText={(v) => setF({ price: v })} keyboardType="decimal-pad" placeholder="150" placeholderTextColor={colors.textFaint} />
                </View>
                <View style={styles.f1}>
                  <Text style={styles.label}>Expires (mo)</Text>
                  <TextInput style={styles.input} value={form.expires_months} onChangeText={(v) => setF({ expires_months: v })} keyboardType="number-pad" placeholder="never" placeholderTextColor={colors.textFaint} />
                </View>
              </View>

              {dealMath ? (
                <View style={styles.dealBox}>
                  <Text style={styles.dealText}>
                    💡 Client pays <Text style={styles.bold}>{money(form.price)} once</Text> = <Text style={styles.bold}>{money(dealMath.perVisit)}/visit</Text> instead of {money(dealMath.maxPrice)}
                    {dealMath.savings > 0 ? ` — they save ${money(dealMath.savings)} vs per-visit, and you get cash up front.`
                      : dealMath.savings < 0 ? ` — heads up: that's MORE than per-visit (${money(dealMath.regular)}). Lower the price?`
                      : ' — same as per-visit (no discount baked in).'}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.label}>Description for the portal (optional)</Text>
              <TextInput style={styles.input} value={form.description} onChangeText={(v) => setF({ description: v })} placeholder='e.g. "Keep that coat fresh all summer!"' placeholderTextColor={colors.textFaint} />

              {err ? <Text style={styles.err}>{err}</Text> : null}
              <View style={styles.modalBtns}>
                <Pressable style={styles.cancelBtn} onPress={() => { setShowForm(false); setForm(EMPTY_FORM); setErr(''); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveType} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Punch Card</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Sell modal */}
      <Modal visible={!!sellType} animationType="slide" transparent onRequestClose={() => setSellType(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sell: {sellType ? sellType.name : ''}</Text>
            {!sellClient ? (
              <>
                <Text style={styles.label}>Who's buying?</Text>
                <TextInput style={styles.input} value={sellSearch} onChangeText={setSellSearch} placeholder="Search client by name…" placeholderTextColor={colors.textFaint} autoFocus />
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
                  {sellMatches.map((c) => (
                    <Pressable key={c.id} style={styles.clientRow} onPress={() => setSellClient(c)}>
                      <Text style={styles.clientName}>{c.first_name} {c.last_name}</Text>
                      {c.phone ? <Text style={styles.clientPhone}>{c.phone}</Text> : null}
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable style={styles.cancelBtn} onPress={() => setSellType(null)}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              </>
            ) : (
              <>
                <Text style={styles.sellSummary}>Selling to <Text style={styles.bold}>{sellClient.first_name} {sellClient.last_name}</Text> for <Text style={styles.bold}>{money(sellType.price)}</Text></Text>
                <Pressable onPress={() => setSellClient(null)}><Text style={styles.changeLink}>change client</Text></Pressable>
                <Text style={[styles.label, { marginTop: 14 }]}>How did they pay?</Text>
                <View style={styles.chips}>
                  {PAY_METHODS.map((m) => (
                    <Pressable key={m} style={[styles.chip, sellMethod === m && styles.chipOn]} onPress={() => setSellMethod(m)}>
                      <Text style={[styles.chipText, sellMethod === m && styles.chipTextOn]}>{m === 'comp' ? '🎁 comp' : m}</Text>
                    </Pressable>
                  ))}
                </View>
                {err ? <Text style={styles.err}>{err}</Text> : null}
                <View style={styles.modalBtns}>
                  <Pressable style={styles.cancelBtn} onPress={() => { setSellType(null); setSellClient(null); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                  <Pressable style={[styles.saveBtn, { backgroundColor: colors.green }, selling && { opacity: 0.6 }]} onPress={confirmSell} disabled={selling}>
                    {selling ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Record sale · {money(sellType.price)}</Text>}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  newBtn: { backgroundColor: '#fff', borderRadius: 20, paddingVertical: 7, paddingHorizontal: 16 },
  newBtnText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 50 },
  intro: { fontSize: 13, color: colors.textMute, lineHeight: 19, marginBottom: 14 },
  empty: { textAlign: 'center', color: colors.textFaint, fontSize: 14, lineHeight: 20, marginTop: 20, paddingHorizontal: 12 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 12, ...shadow },
  cardName: { fontSize: 16, fontWeight: '800', color: colors.text },
  paused: { fontSize: 12, color: colors.textFaint, fontWeight: '600' },
  cardLine: { fontSize: 13, color: colors.textMute, marginTop: 4 },
  cardCovers: { fontSize: 12, color: colors.textFaint, marginTop: 3 },
  bold: { fontWeight: '800', color: colors.text },
  cardBtns: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  sellBtn: { backgroundColor: colors.green, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  sellBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  smBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  smBtnText: { color: colors.textMute, fontWeight: '700', fontSize: 13 },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 10 },
  soldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  soldName: { fontSize: 13, color: colors.text },
  soldMeta: { fontSize: 12, color: colors.textMute, marginTop: 2 },
  soldBar: { height: 7, borderRadius: 4, backgroundColor: '#f3f4f6', overflow: 'hidden', marginTop: 6 },
  soldBarFill: { height: 7, backgroundColor: colors.green },
  soldLeft: { fontSize: 15, fontWeight: '800' },
  err: { color: '#b91c1c', fontSize: 13, marginVertical: 8, textAlign: 'center' },
  // modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '800', color: colors.textMute, marginBottom: 6, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13, backgroundColor: '#fff' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'capitalize' },
  chipTextOn: { color: '#fff' },
  row3: { flexDirection: 'row', gap: 10 },
  f1: { flex: 1 },
  dealBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 8, padding: 10, marginTop: 12 },
  dealText: { fontSize: 12.5, color: '#166534', lineHeight: 18 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: '#fff' },
  cancelText: { color: colors.textMute, fontWeight: '800', fontSize: 14 },
  saveBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  clientRow: { paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginBottom: 6, backgroundColor: '#fff' },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clientPhone: { fontSize: 12, color: colors.textFaint, marginTop: 1 },
  sellSummary: { fontSize: 15, color: colors.text },
  changeLink: { color: colors.primary, fontWeight: '700', fontSize: 13, marginTop: 4 },
});
