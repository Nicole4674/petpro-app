import { useState, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { supabase } from '../lib/supabase';

function money(v) {
  const n = parseFloat(v);
  return isNaN(n) ? '' : `$${n.toFixed(2)}`;
}

export default function RetailScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load(refresh) {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, qty_on_hand, low_stock_at, category')
        .eq('groomer_id', session.user.id)
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      setProducts(data || []);
    } catch (e) {
      setErr(e.message || 'Could not load products.');
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
  }, [products, search]);

  function renderItem({ item }) {
    const low = item.low_stock_at != null && item.qty_on_hand != null && item.qty_on_hand <= item.low_stock_at;
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.name || 'Product'}</Text>
          <View style={styles.metaRow}>
            {item.category ? <Text style={styles.cat}>{item.category}</Text> : null}
            <Text style={[styles.qty, low && styles.qtyLow]}>
              {item.qty_on_hand != null ? `${item.qty_on_hand} in stock` : 'stock n/a'}{low ? ' · LOW' : ''}
            </Text>
          </View>
        </View>
        <Text style={styles.price}>{money(item.price)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ More</Text>
        </Pressable>
        <Text style={styles.title}>🛒 Retail</Text>
        <TextInput
          style={styles.search}
          placeholder="Search products…"
          placeholderTextColor="#a78bfa"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
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
          ListHeaderComponent={<Text style={styles.count}>{filtered.length} {filtered.length === 1 ? 'product' : 'products'}</Text>}
          ListEmptyComponent={<Text style={styles.empty}>{search ? 'No matches.' : 'No products yet.'}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f5f3ff' },
  header: { backgroundColor: '#5b21b6', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  back: { marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 12 },
  search: { backgroundColor: '#fff', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: '#1f2937' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  count: { color: '#6b7280', fontSize: 13, marginBottom: 10, marginLeft: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8 },
  name: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' },
  cat: { fontSize: 12, color: '#7c3aed', fontWeight: '700', textTransform: 'capitalize' },
  qty: { fontSize: 12, color: '#6b7280' },
  qtyLow: { color: '#b91c1c', fontWeight: '800' },
  price: { fontSize: 16, fontWeight: '800', color: '#16a34a' },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 15, marginTop: 24 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
