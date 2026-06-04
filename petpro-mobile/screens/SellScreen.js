import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

const METHODS = [{ label: 'Cash', value: 'cash' }, { label: 'Zelle', value: 'zelle' }, { label: 'Venmo', value: 'venmo' }];

function money(v) { const n = parseFloat(v); return `$${(isNaN(n) ? 0 : n).toFixed(2)}`; }

export default function SellScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]); // [{ product, qty }]
  const [view, setView] = useState('shop'); // 'shop' | 'checkout' | 'done'
  const [method, setMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [charging, setCharging] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase.from('products')
        .select('id, name, price, qty_on_hand, category')
        .eq('groomer_id', session.user.id).eq('is_active', true).order('name');
      if (error) throw error;
      setProducts(data || []);
    } catch (e) { setErr(e.message || 'Could not load products.'); } finally { setLoading(false); }
  }

  function addToCart(p) {
    setCart((c) => {
      const ex = c.find((l) => l.product.id === p.id);
      if (ex) return c.map((l) => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l);
      return [...c, { product: p, qty: 1 }];
    });
  }
  function setQty(id, delta) {
    setCart((c) => c.map((l) => l.product.id === id ? { ...l, qty: l.qty + delta } : l).filter((l) => l.qty > 0));
  }
  function qtyOf(id) { const l = cart.find((x) => x.product.id === id); return l ? l.qty : 0; }

  const subtotal = cart.reduce((s, l) => s + (parseFloat(l.product.price) || 0) * l.qty, 0);
  const disc = parseFloat(discount) || 0;
  const total = Math.max(subtotal - disc, 0);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  async function checkout() {
    if (cart.length === 0) return;
    setCharging(true); setErr('');
    try {
      const { data: sale, error: e1 } = await supabase.from('sales').insert({
        groomer_id: session.user.id, client_id: null, appointment_id: null,
        subtotal, discount_amount: disc, tax_amount: 0, tip_amount: 0, total,
        payment_method: method, payment_status: 'paid', status: 'completed', note: note.trim() || null,
      }).select().single();
      if (e1) throw e1;

      const items = cart.map((l) => ({
        sale_id: sale.id, product_id: l.product.id, custom_name: null,
        qty: l.qty, unit_price: parseFloat(l.product.price) || 0, line_total: (parseFloat(l.product.price) || 0) * l.qty,
      }));
      const { error: e2 } = await supabase.from('sale_items').insert(items);
      if (e2) throw e2;

      await supabase.from('sale_payments').insert({ sale_id: sale.id, groomer_id: session.user.id, method, amount: total });

      // Decrement inventory + log movements
      for (const l of cart) {
        const newQty = (parseInt(l.product.qty_on_hand, 10) || 0) - l.qty;
        await supabase.from('products').update({ qty_on_hand: newQty }).eq('id', l.product.id);
        await supabase.from('inventory_movements').insert({
          groomer_id: session.user.id, product_id: l.product.id, qty_change: -l.qty, reason: 'sale', reference_id: sale.id,
        });
      }
      setView('done');
    } catch (e) { setErr(e.message || 'Could not complete the sale.'); } finally { setCharging(false); }
  }

  function reset() { setCart([]); setDiscount(''); setNote(''); setView('shop'); load(); }

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    return !q || (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
  });

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>Retail</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Ionicons name="pricetags" size={20} color="#fff" /><Text style={styles.title}>Sell</Text>
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : view === 'done' ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={64} color={colors.green} />
          <Text style={styles.doneBig}>Sale complete</Text>
          <Text style={styles.doneSub}>{money(total)} · {method}</Text>
          <Pressable style={styles.newSaleBtn} onPress={reset}><Text style={styles.newSaleText}>New sale</Text></Pressable>
        </View>
      ) : view === 'checkout' ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <Text style={styles.section}>Cart ({cartCount})</Text>
          {cart.map((l) => (
            <View key={l.product.id} style={styles.cartRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cartName}>{l.product.name}</Text>
                <Text style={styles.cartPrice}>{money(l.product.price)} each</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => setQty(l.product.id, -1)}><Ionicons name="remove" size={18} color={colors.primaryDark} /></Pressable>
                <Text style={styles.stepQty}>{l.qty}</Text>
                <Pressable style={styles.stepBtn} onPress={() => setQty(l.product.id, 1)}><Ionicons name="add" size={18} color={colors.primaryDark} /></Pressable>
              </View>
              <Text style={styles.lineTotal}>{money((parseFloat(l.product.price) || 0) * l.qty)}</Text>
            </View>
          ))}

          <Text style={styles.label}>Discount (optional)</Text>
          <TextInput style={styles.input} value={discount} onChangeText={setDiscount} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.textFaint} />

          <Text style={styles.label}>Payment method</Text>
          <View style={styles.chips}>
            {METHODS.map((m) => (
              <Pressable key={m.value} style={[styles.chip, method === m.value && styles.chipSel]} onPress={() => setMethod(m.value)}>
                <Text style={[styles.chipText, method === m.value && styles.chipTextSel]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="e.g. shampoo + treats" placeholderTextColor={colors.textFaint} />

          <View style={styles.totalCard}>
            <View style={styles.totRow}><Text style={styles.totLabel}>Subtotal</Text><Text style={styles.totVal}>{money(subtotal)}</Text></View>
            {disc > 0 ? <View style={styles.totRow}><Text style={styles.totLabel}>Discount</Text><Text style={styles.totVal}>-{money(disc)}</Text></View> : null}
            <View style={[styles.totRow, styles.grand]}><Text style={styles.grandLabel}>Total</Text><Text style={styles.grandVal}>{money(total)}</Text></View>
          </View>

          <Pressable style={[styles.payBtn, charging && { opacity: 0.6 }]} onPress={checkout} disabled={charging}>
            {charging ? <ActivityIndicator color="#fff" /> : <Text style={styles.payText}>Complete sale · {money(total)}</Text>}
          </Pressable>
          <Pressable style={styles.backToShop} onPress={() => setView('shop')}><Text style={styles.backToShopText}>‹ Back to products</Text></Pressable>
        </ScrollView>
      ) : (
        <>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search products…" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
          </View>
          <ScrollView contentContainerStyle={styles.shopScroll}>
            {err ? <Text style={styles.err}>{err}</Text> : null}
            {filtered.length === 0 ? <Text style={styles.muted}>No products.</Text> : filtered.map((p) => {
              const inCart = qtyOf(p.id);
              const low = p.low_stock_at != null && p.qty_on_hand != null && p.qty_on_hand <= p.low_stock_at;
              return (
                <Pressable key={p.id} style={styles.prodRow} onPress={() => addToCart(p)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prodName}>{p.name}</Text>
                    <Text style={styles.prodMeta}>{money(p.price)}{p.qty_on_hand != null ? ` · ${p.qty_on_hand} in stock` : ''}{low ? ' · LOW' : ''}</Text>
                  </View>
                  {inCart > 0 ? <View style={styles.inCart}><Text style={styles.inCartText}>{inCart}</Text></View> : <Ionicons name="add-circle" size={26} color={colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
          {cart.length > 0 ? (
            <Pressable style={styles.cartBar} onPress={() => setView('checkout')}>
              <Text style={styles.cartBarText}>{cartCount} item{cartCount === 1 ? '' : 's'} · {money(subtotal)}</Text>
              <Text style={styles.cartBarCta}>Checkout ›</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, margin: 16, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
  shopScroll: { padding: 16, paddingTop: 6, paddingBottom: 100 },
  scroll: { padding: 20, paddingBottom: 60 },
  muted: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 20 },
  prodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 8, ...shadow },
  prodName: { fontSize: 15, fontWeight: '700', color: colors.text },
  prodMeta: { fontSize: 13, color: colors.textMute, marginTop: 2 },
  inCart: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  inCartText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  cartBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: 16, paddingHorizontal: 20 },
  cartBarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cartBarCta: { color: '#fff', fontWeight: '800', fontSize: 15 },
  section: { fontSize: 13, fontWeight: '800', color: colors.textMute, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 12, marginBottom: 8, ...shadow },
  cartName: { fontSize: 15, fontWeight: '700', color: colors.text },
  cartPrice: { fontSize: 12, color: colors.textMute, marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  stepQty: { fontSize: 16, fontWeight: '800', color: colors.text, minWidth: 18, textAlign: 'center' },
  lineTotal: { fontSize: 15, fontWeight: '800', color: colors.text, width: 64, textAlign: 'right' },
  label: { fontSize: 13, fontWeight: '800', color: colors.textMute, marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: colors.card, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.border },
  chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#374151', fontWeight: '700' },
  chipTextSel: { color: '#fff' },
  totalCard: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginTop: 18, ...shadow },
  totRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  totLabel: { fontSize: 14, color: colors.textMute },
  totVal: { fontSize: 14, color: colors.text, fontWeight: '600' },
  grand: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingTop: 10, marginBottom: 0 },
  grandLabel: { fontSize: 16, fontWeight: '800', color: colors.text },
  grandVal: { fontSize: 20, fontWeight: '800', color: colors.green },
  payBtn: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  payText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  backToShop: { alignItems: 'center', paddingVertical: 14 },
  backToShopText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  doneBig: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 12 },
  doneSub: { fontSize: 15, color: colors.textMute, marginTop: 4 },
  newSaleBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40, marginTop: 24 },
  newSaleText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
});
