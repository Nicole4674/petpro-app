import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, ActivityIndicator, FlatList, ScrollView, Modal, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

function money(v) { const n = parseFloat(v); return isNaN(n) ? '$0' : `$${n.toFixed(2)}`; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export default function RetailScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [restockFor, setRestockFor] = useState(null);
  const [restockAmt, setRestockAmt] = useState('');

  useEffect(() => { load(); }, []);
  useEffect(() => { const unsub = navigation.addListener('focus', () => load(true)); return unsub; }, [navigation]);

  async function load(refresh) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase.from('products')
        .select('id, name, price, qty_on_hand, low_stock_at, category, description, image_url')
        .eq('groomer_id', session.user.id).eq('is_active', true).order('name');
      if (error) throw error;
      setProducts(data || []);
    } catch (e) { setErr(e.message || 'Could not load products.'); } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }

  async function doRestock() {
    const amt = parseInt(restockAmt, 10);
    if (!amt || amt <= 0) return;
    const p = restockFor;
    setRestockFor(null); setRestockAmt('');
    try {
      const newQty = (parseInt(p.qty_on_hand, 10) || 0) + amt;
      await supabase.from('products').update({ qty_on_hand: newQty }).eq('id', p.id);
      await supabase.from('inventory_movements').insert({ groomer_id: session.user.id, product_id: p.id, qty_change: amt, reason: 'restock' });
      load(true);
    } catch (e) { setErr(e.message || 'Could not add stock.'); }
  }

  const cats = useMemo(() => ['all', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))], [products]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (!q) return true;
      return (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
    });
  }, [products, search, cat]);

  const activeCount = products.length;
  const inventoryValue = products.reduce((s, p) => s + (parseFloat(p.price) || 0) * (parseInt(p.qty_on_hand, 10) || 0), 0);
  const lowCount = products.filter((p) => p.low_stock_at != null && p.qty_on_hand != null && p.qty_on_hand <= p.low_stock_at).length;

  function renderItem({ item }) {
    const low = item.low_stock_at != null && item.qty_on_hand != null && item.qty_on_hand <= item.low_stock_at;
    return (
      <Pressable style={styles.card} onPress={() => navigation.navigate('AddProduct', { productId: item.id })}>
        {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.thumb} /> : <View style={styles.thumbPlaceholder}><Ionicons name="cube-outline" size={20} color={colors.textFaint} /></View>}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name || 'Product'}</Text>
          <View style={styles.metaRow}>
            {item.category ? <Text style={styles.cat}>{cap(item.category)}</Text> : null}
            <Text style={[styles.qty, low && styles.qtyLow]}>{item.qty_on_hand != null ? `${item.qty_on_hand} on hand` : 'stock n/a'}{low ? ' · LOW' : ''}</Text>
          </View>
        </View>
        <Text style={styles.price}>{money(item.price)}</Text>
        <Pressable style={styles.stockBtn} onPress={() => { setRestockFor(item); setRestockAmt(''); }} hitSlop={6}>
          <Ionicons name="add" size={16} color="#fff" /><Text style={styles.stockText}>Stock</Text>
        </Pressable>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}><Ionicons name="cart" size={22} color="#fff" /><Text style={styles.title}>Retail</Text></View>
          <View style={styles.headBtns}>
            <Pressable style={styles.addBtn} onPress={() => navigation.navigate('AddProduct')}><Ionicons name="add" size={18} color={colors.primaryDark} /><Text style={styles.addText}>Add</Text></Pressable>
            <Pressable style={styles.sellBtn} onPress={() => navigation.navigate('Sell')}><Ionicons name="pricetags" size={16} color="#fff" /><Text style={styles.sellText}>Sell</Text></Pressable>
          </View>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput style={styles.search} placeholder="Search products…" placeholderTextColor={colors.textFaint} value={search} onChangeText={setSearch} autoCapitalize="none" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {cats.map((c) => (
            <Pressable key={c} style={[styles.catChip, cat === c && styles.catChipSel]} onPress={() => setCat(c)}>
              <Text style={[styles.catText, cat === c && styles.catTextSel]}>{c === 'all' ? 'All' : cap(c)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => load(true)}
          ListHeaderComponent={
            <View style={styles.stats}>
              <View style={styles.stat}><Text style={styles.statNum}>{activeCount}</Text><Text style={styles.statLabel}>Products</Text></View>
              <View style={styles.stat}><Text style={[styles.statNum, { color: colors.green }]}>{money(inventoryValue)}</Text><Text style={styles.statLabel}>Inventory value</Text></View>
              <View style={styles.stat}><Text style={[styles.statNum, lowCount > 0 && { color: '#b91c1c' }]}>{lowCount}</Text><Text style={styles.statLabel}>Low stock</Text></View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>{search || cat !== 'all' ? 'No products match.' : 'No products yet — tap Add.'}</Text>}
        />
      )}

      {/* Restock modal */}
      <Modal visible={!!restockFor} transparent animationType="fade" onRequestClose={() => setRestockFor(null)}>
        <Pressable style={styles.modalBg} onPress={() => setRestockFor(null)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <Text style={styles.modalTitle}>Add stock</Text>
            <Text style={styles.modalSub}>{restockFor && restockFor.name} · {restockFor && restockFor.qty_on_hand} on hand</Text>
            <TextInput style={styles.modalInput} value={restockAmt} onChangeText={setRestockAmt} keyboardType="numeric" placeholder="Quantity to add" placeholderTextColor={colors.textFaint} autoFocus />
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalCancel} onPress={() => setRestockFor(null)}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
              <Pressable style={styles.modalAdd} onPress={doRestock}><Text style={styles.modalAddText}>Add stock</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 14, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  headBtns: { flexDirection: 'row', gap: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12 },
  addText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  sellBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  sellText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14 },
  search: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
  catRow: { gap: 8, paddingTop: 12, paddingRight: 20 },
  catChip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)' },
  catChipSel: { backgroundColor: '#fff' },
  catText: { color: '#ede9fe', fontWeight: '700', fontSize: 13 },
  catTextSel: { color: colors.primaryDark, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center', ...shadow },
  statNum: { fontSize: 18, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMute, marginTop: 2, textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 8, ...shadow },
  thumb: { width: 40, height: 40, borderRadius: 8 },
  thumbPlaceholder: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' },
  cat: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  qty: { fontSize: 12, color: colors.textMute },
  qtyLow: { color: '#b91c1c', fontWeight: '800' },
  price: { fontSize: 16, fontWeight: '800', color: colors.green },
  stockBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
  stockText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  empty: { textAlign: 'center', color: colors.textMute, fontSize: 15, marginTop: 24 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 30 },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalSub: { fontSize: 13, color: colors.textMute, marginTop: 4, marginBottom: 14 },
  modalInput: { backgroundColor: '#f9fafb', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancel: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.textMute, fontWeight: '800' },
  modalAdd: { flex: 1, backgroundColor: colors.green, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalAddText: { color: '#fff', fontWeight: '800' },
});
