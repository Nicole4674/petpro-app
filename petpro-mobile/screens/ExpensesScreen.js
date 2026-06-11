import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Modal, Share, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

const CATEGORIES = [
  { id: 'supplies', label: 'Supplies', emoji: '🧴', help: 'Shampoo, conditioner, brushes, blades, scissors. 100% deductible — keep receipts.' },
  { id: 'equipment', label: 'Equipment', emoji: '⚙️', help: 'Clippers, dryers, tables. Big-ticket items may need to be depreciated — ask a CPA if it\'s over $2,500.' },
  { id: 'blade_sharpening', label: 'Blade Sharpening', emoji: '🔪', help: 'Routine sharpening + small tool repairs. 100% deductible.' },
  { id: 'rent', label: 'Rent', emoji: '🏠', help: 'Shop space rent. If you work from home, ask a CPA about the "home office deduction."' },
  { id: 'utilities', label: 'Utilities', emoji: '⚡', help: 'Electric, water, internet for the shop space.' },
  { id: 'phone', label: 'Phone', emoji: '📱', help: 'Business portion of your phone bill. If 100% business, deduct fully; otherwise estimate the work %.' },
  { id: 'vehicle_mileage', label: 'Vehicle / Mileage', emoji: '🚗', help: 'Mobile groomers — track ALL business miles. IRS lets you deduct $0.67/mile in 2026. Supply runs count too!' },
  { id: 'marketing', label: 'Marketing', emoji: '📢', help: 'Ads, business cards, social media spend, website costs, business gifts.' },
  { id: 'software', label: 'Software', emoji: '💻', help: 'PetPro itself, Stripe fees, any other subscriptions you pay to run the business.' },
  { id: 'insurance', label: 'Insurance', emoji: '🛡️', help: 'Business liability, equipment insurance, professional indemnity.' },
  { id: 'education', label: 'Education', emoji: '📚', help: 'Grooming classes, conferences, certifications, books. 100% deductible if business-related.' },
  { id: 'doggy_supplies', label: 'Doggy Supplies', emoji: '🐶', help: 'Treats, bandanas, bows, toys you give clients. Deductible as cost of service.' },
  { id: 'other', label: 'Other', emoji: '✂️', help: 'Anything that doesn\'t fit a category — add notes describing what it was.' },
];
const PAYMENT_METHODS = ['cash', 'card', 'zelle', 'venmo', 'check', 'paypal', 'other'];
const PRESETS = [{ id: 'this_month', label: 'This Month' }, { id: 'last_month', label: 'Last Month' }, { id: 'ytd', label: 'Year to Date' }, { id: 'all', label: 'All Time' }];

function money(d) { return '$' + (parseFloat(d) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function isoD(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function shortDate(s) { if (!s) return ''; return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
function getDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'this_month') return [isoD(new Date(now.getFullYear(), now.getMonth(), 1)), isoD(today)];
  if (preset === 'last_month') return [isoD(new Date(now.getFullYear(), now.getMonth() - 1, 1)), isoD(new Date(now.getFullYear(), now.getMonth(), 0))];
  if (preset === 'ytd') return [isoD(new Date(now.getFullYear(), 0, 1)), isoD(today)];
  if (preset === 'all') return ['2020-01-01', isoD(today)];
  return [isoD(today), isoD(today)];
}
const catMeta = (id) => CATEGORIES.find((c) => c.id === id) || { label: id, emoji: '❓', help: '' };

export default function ExpensesScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [preset, setPreset] = useState('this_month');
  const [err, setErr] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const gid = session.user.id;

  useEffect(() => { load(); }, [preset]);

  async function load() {
    setLoading(true); setErr('');
    try {
      const [start, end] = getDateRange(preset);
      const { data: exp, error: e1 } = await supabase.from('expenses').select('*')
        .eq('groomer_id', gid).gte('expense_date', start).lte('expense_date', end)
        .order('expense_date', { ascending: false }).order('created_at', { ascending: false });
      if (e1) throw e1;
      setExpenses(exp || []);
      const startIso = new Date(start + 'T00:00:00').toISOString();
      const endIso = new Date(end + 'T23:59:59').toISOString();
      const { data: pays } = await supabase.from('payments').select('amount, refunded_amount, tip_amount')
        .eq('groomer_id', gid).gte('created_at', startIso).lte('created_at', endIso);
      let rev = 0;
      (pays || []).forEach((p) => { rev += (parseFloat(p.amount || 0) + parseFloat(p.tip_amount || 0) - parseFloat(p.refunded_amount || 0)); });
      setRevenue(rev);
    } catch (e) { setErr(e.message || 'Could not load expenses.'); } finally { setLoading(false); }
  }

  const totalExpenses = expenses.reduce((s, e) => s + (parseFloat(e.amount_cents || 0) / 100), 0);
  const profit = revenue - totalExpenses;

  const breakdown = (() => {
    const by = {};
    expenses.forEach((e) => { const d = parseFloat(e.amount_cents || 0) / 100; by[e.category] = (by[e.category] || 0) + d; });
    return Object.entries(by).map(([cat, total]) => ({ cat, ...catMeta(cat), total })).sort((a, b) => b.total - a.total);
  })();
  const maxCat = breakdown[0] ? breakdown[0].total : 1;

  function del(id) {
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { const { error } = await supabase.from('expenses').delete().eq('id', id); if (error) throw error; load(); }
        catch (e) { setErr(e.message || 'Could not delete.'); }
      } },
    ]);
  }

  function exportCsv() {
    if (expenses.length === 0) { setErr('No expenses to export.'); return; }
    const header = ['Date', 'Amount', 'Category', 'Vendor', 'Payment Method', 'Notes'];
    const rows = expenses.map((e) => [e.expense_date, (parseFloat(e.amount_cents) / 100).toFixed(2), catMeta(e.category).label, e.vendor || '', e.payment_method || '', (e.notes || '').replace(/"/g, '""')]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    Share.share({ message: csv, title: `PetPro expenses ${getDateRange(preset)[0]} to ${getDateRange(preset)[1]}` });
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}><Ionicons name="cash" size={20} color="#fff" /><Text style={styles.title}>Expenses</Text></View>
          <Pressable style={styles.newBtn} onPress={() => { setEditing(null); setShowModal(true); }}><Text style={styles.newBtnText}>+ Add</Text></Pressable>
        </View>
      </GradientHeader>

      {loading && expenses.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {err ? <Text style={styles.err}>{err}</Text> : null}

          {/* Date presets */}
          <View style={styles.presetRow}>
            {PRESETS.map((p) => (
              <Pressable key={p.id} style={[styles.preset, preset === p.id && styles.presetOn]} onPress={() => setPreset(p.id)}>
                <Text style={[styles.presetText, preset === p.id && styles.presetTextOn]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* P&L cards */}
          <View style={styles.cards}>
            <View style={[styles.summaryCard, { borderTopColor: colors.green }]}>
              <Text style={styles.sumLabel}>Revenue</Text>
              <Text style={[styles.sumVal, { color: colors.green }]}>{money(revenue)}</Text>
              <Text style={styles.sumHint}>payments processed</Text>
            </View>
            <View style={[styles.summaryCard, { borderTopColor: '#dc2626' }]}>
              <Text style={styles.sumLabel}>Expenses</Text>
              <Text style={[styles.sumVal, { color: '#dc2626' }]}>{money(totalExpenses)}</Text>
              <Text style={styles.sumHint}>{expenses.length} tracked</Text>
            </View>
            <View style={[styles.summaryCard, { borderTopColor: profit >= 0 ? colors.primary : '#dc2626' }]}>
              <Text style={styles.sumLabel}>Profit</Text>
              <Text style={[styles.sumVal, { color: profit >= 0 ? colors.primary : '#dc2626' }]}>{money(profit)}</Text>
              <Text style={styles.sumHint}>{profit >= 0 ? '✅ in the black' : '⚠️ expenses > revenue'}</Text>
            </View>
          </View>

          {/* Top categories */}
          {breakdown.length > 0 ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>📊 Top Categories</Text>
              {breakdown.map((c) => (
                <View key={c.cat} style={{ marginBottom: 10 }}>
                  <View style={styles.catRow}><Text style={styles.catName}>{c.emoji} {c.label}</Text><Text style={styles.catTotal}>{money(c.total)}</Text></View>
                  <View style={styles.catBar}><View style={[styles.catBarFill, { width: `${(c.total / maxCat) * 100}%` }]} /></View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Recent expenses */}
          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Recent Expenses</Text>
              <Pressable style={[styles.csvBtn, expenses.length === 0 && { opacity: 0.5 }]} onPress={exportCsv} disabled={expenses.length === 0}>
                <Ionicons name="download-outline" size={14} color={colors.textMute} /><Text style={styles.csvText}>Export CSV</Text>
              </Pressable>
            </View>
            {expenses.length === 0 ? (
              <Text style={styles.empty}>No expenses logged in this range yet. Tap + Add to start tracking. 🐾</Text>
            ) : expenses.map((e) => {
              const cm = catMeta(e.category);
              return (
                <Pressable key={e.id} style={styles.expRow} onPress={() => { setEditing(e); setShowModal(true); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expTop}>{cm.emoji} {cm.label} <Text style={styles.expAmt}>· {money(parseFloat(e.amount_cents) / 100)}</Text></Text>
                    <Text style={styles.expMeta}>{shortDate(e.expense_date)}{e.vendor ? ` · ${e.vendor}` : ''}{e.notes ? ` · ${e.notes}` : ''}</Text>
                  </View>
                  <Pressable onPress={() => del(e.id)} hitSlop={8}><Ionicons name="trash-outline" size={18} color="#dc2626" /></Pressable>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      <ExpenseModal visible={showModal} existing={editing} gid={gid} onClose={() => { setShowModal(false); setEditing(null); }} onSaved={() => { setShowModal(false); setEditing(null); load(); }} />
    </View>
  );
}

function ExpenseModal({ visible, existing, gid, onClose, onSaved }) {
  const [date, setDate] = useState(isoD(new Date()));
  const [showDate, setShowDate] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('supplies');
  const [vendor, setVendor] = useState('');
  const [method, setMethod] = useState('card');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (visible) {
      setDate(existing ? existing.expense_date : isoD(new Date()));
      setAmount(existing ? (parseFloat(existing.amount_cents) / 100).toFixed(2) : '');
      setCategory(existing ? existing.category : 'supplies');
      setVendor(existing ? (existing.vendor || '') : '');
      setMethod(existing ? (existing.payment_method || 'card') : 'card');
      setNotes(existing ? (existing.notes || '') : '');
      setErr('');
    }
  }, [visible, existing]);

  async function save() {
    const dollars = parseFloat(amount);
    if (isNaN(dollars) || dollars < 0) { setErr('Enter a valid amount.'); return; }
    if (!date) { setErr('Pick a date.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { groomer_id: gid, expense_date: date, amount_cents: Math.round(dollars * 100), category, vendor: vendor.trim() || null, payment_method: method || null, notes: notes.trim() || null };
      const { error } = existing
        ? await supabase.from('expenses').update(payload).eq('id', existing.id)
        : await supabase.from('expenses').insert(payload);
      if (error) throw error;
      onSaved();
    } catch (e) { setErr('Could not save: ' + (e.message || e)); } finally { setSaving(false); }
  }

  const cm = catMeta(category);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{existing ? 'Edit Expense' : 'Add Expense'}</Text>

            <View style={styles.row2}>
              <View style={styles.f1}>
                <Text style={styles.label}>Date</Text>
                <Pressable style={styles.input} onPress={() => setShowDate(true)}><Text style={{ color: colors.text, fontSize: 15 }}>{date}</Text></Pressable>
              </View>
              <View style={styles.f1}>
                <Text style={styles.label}>Amount ($)</Text>
                <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} />
              </View>
            </View>
            {showDate ? (
              <DateTimePicker value={new Date(date + 'T00:00:00')} mode="date" onChange={(e, d) => { setShowDate(Platform.OS === 'ios'); if (d) setDate(isoD(d)); }} />
            ) : null}

            <Text style={styles.label}>Category</Text>
            <View style={styles.chips}>
              {CATEGORIES.map((c) => (
                <Pressable key={c.id} style={[styles.chip, category === c.id && styles.chipOn]} onPress={() => setCategory(c.id)}>
                  <Text style={[styles.chipText, category === c.id && styles.chipTextOn]}>{c.emoji} {c.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.helpBox}><Text style={styles.helpText}>💡 {cm.help}</Text></View>

            <View style={styles.row2}>
              <View style={styles.f1}>
                <Text style={styles.label}>Vendor</Text>
                <TextInput style={styles.input} value={vendor} onChangeText={setVendor} placeholder="e.g. PetEdge, Andis" placeholderTextColor={colors.textFaint} />
              </View>
            </View>

            <Text style={styles.label}>Payment method</Text>
            <View style={styles.chips}>
              {PAYMENT_METHODS.map((m) => (
                <Pressable key={m} style={[styles.chip, method === m && styles.chipOn]} onPress={() => setMethod(m)}>
                  <Text style={[styles.chipText, method === m && styles.chipTextOn]}>{m}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.input, { minHeight: 56, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} placeholder="Optional — what was this for?" placeholderTextColor={colors.textFaint} multiline />

            {err ? <Text style={styles.err}>{err}</Text> : null}
            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{existing ? 'Save Changes' : 'Add Expense'}</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  err: { color: '#b91c1c', fontSize: 13, marginVertical: 8, textAlign: 'center' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  preset: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 13, backgroundColor: '#fff' },
  presetOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetText: { fontSize: 13, fontWeight: '700', color: colors.textMute },
  presetTextOn: { color: '#fff' },
  cards: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderTopWidth: 4, padding: 12, ...shadow },
  sumLabel: { fontSize: 10, color: colors.textMute, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  sumVal: { fontSize: 19, fontWeight: '800', marginTop: 4 },
  sumHint: { fontSize: 10, color: colors.textFaint, marginTop: 2 },
  panel: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 16, ...shadow },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  panelTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 12 },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  catName: { fontSize: 13, color: colors.textMute },
  catTotal: { fontSize: 13, fontWeight: '800', color: colors.text },
  catBar: { height: 6, borderRadius: 999, backgroundColor: '#f3f4f6', overflow: 'hidden' },
  catBarFill: { height: 6, backgroundColor: colors.primary },
  csvBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: '#fff' },
  csvText: { fontSize: 12, fontWeight: '700', color: colors.textMute },
  empty: { textAlign: 'center', color: colors.textFaint, fontSize: 14, lineHeight: 20, paddingVertical: 20 },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  expTop: { fontSize: 14, color: colors.text, fontWeight: '600' },
  expAmt: { fontWeight: '800', color: colors.text },
  expMeta: { fontSize: 12, color: colors.textMute, marginTop: 2 },
  // modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '92%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '800', color: colors.textMute, marginBottom: 6, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fff' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'capitalize' },
  chipTextOn: { color: '#fff' },
  helpBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 8, padding: 10, marginTop: 8 },
  helpText: { fontSize: 12, color: '#166534', lineHeight: 18 },
  row2: { flexDirection: 'row', gap: 10 },
  f1: { flex: 1 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: '#fff' },
  cancelText: { color: colors.textMute, fontWeight: '800', fontSize: 14 },
  saveBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
