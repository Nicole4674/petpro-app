import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

const CATEGORIES = ['shampoo', 'conditioner', 'treats', 'food', 'supplements', 'brushes', 'toys', 'apparel', 'accessories', 'other'];
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// base64 → bytes (for uploading the picked photo to Supabase Storage)
function base64ToBytes(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = {};
  for (let i = 0; i < chars.length; i++) lookup[chars[i]] = i;
  const clean = b64.replace(/=+$/, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let p = 0, buf = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buf = (buf << 6) | lookup[clean[i]];
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes[p++] = (buf >> bits) & 0xff; }
  }
  return bytes;
}

export default function AddProductScreen({ session, route, navigation }) {
  const productId = route.params && route.params.productId;
  const editing = !!productId;
  const [loading, setLoading] = useState(editing);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('shampoo');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('0');
  const [lowAt, setLowAt] = useState('3');
  const [desc, setDesc] = useState('');
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!editing) return;
    (async () => {
      const { data } = await supabase.from('products').select('*').eq('id', productId).maybeSingle();
      if (data) {
        setName(data.name || '');
        setCategory(data.category || 'shampoo');
        setPrice(data.price != null ? String(data.price) : '');
        setQty(data.qty_on_hand != null ? String(data.qty_on_hand) : '0');
        setLowAt(data.low_stock_at != null ? String(data.low_stock_at) : '');
        setDesc(data.description || '');
        setBarcode(data.barcode || '');
        setImageUrl(data.image_url || '');
      }
      setLoading(false);
    })();
  }, []);

  async function pickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
      if (res.canceled) return;
      const a = res.assets[0];
      setUploading(true); setErr('');
      const ext = (a.mimeType && a.mimeType.split('/')[1]) || 'jpg';
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const bytes = base64ToBytes(a.base64);
      const { error: upErr } = await supabase.storage.from('product-photos').upload(path, bytes, { contentType: a.mimeType || 'image/jpeg', upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('product-photos').getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } catch (e) { setErr('Photo upload failed: ' + (e.message || e)); } finally { setUploading(false); }
  }

  async function save() {
    setErr('');
    if (!name.trim()) { setErr('Enter a product name.'); return; }
    if (price === '' || isNaN(parseFloat(price))) { setErr('Enter a price.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        price: parseFloat(price),
        description: desc.trim() || null,
        qty_on_hand: parseInt(qty, 10) || 0,
        low_stock_at: lowAt === '' ? null : parseInt(lowAt, 10),
        barcode: barcode.trim() || null,
        image_url: imageUrl || null,
      };
      if (editing) {
        const { error } = await supabase.from('products').update(payload).eq('id', productId);
        if (error) throw error;
      } else {
        payload.groomer_id = session.user.id;
        payload.is_active = true;
        const { data, error } = await supabase.from('products').insert(payload).select().single();
        if (error) throw error;
        if (payload.qty_on_hand > 0 && data) {
          await supabase.from('inventory_movements').insert({
            groomer_id: session.user.id, product_id: data.id, qty_change: payload.qty_on_hand, reason: 'restock',
          });
        }
      }
      navigation.goBack();
    } catch (e) { setErr(e.message || 'Could not save the product.'); } finally { setSaving(false); }
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>Retail</Text>
        </Pressable>
        <Text style={styles.title}>{editing ? 'Edit Product' : 'Add Product'}</Text>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Photo</Text>
          <Pressable style={styles.photoBox} onPress={pickPhoto} disabled={uploading}>
            {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.photo} /> : (
              <View style={styles.photoPlaceholder}>
                {uploading ? <ActivityIndicator color={colors.primary} /> : <><Ionicons name="camera-outline" size={26} color={colors.primary} /><Text style={styles.photoText}>Upload photo</Text></>}
              </View>
            )}
            {imageUrl && !uploading ? <View style={styles.photoEdit}><Text style={styles.photoEditText}>Replace</Text></View> : null}
          </Pressable>

          <Text style={styles.label}>Name *</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Coconut Oatmeal Shampoo 16oz" placeholderTextColor={colors.textFaint} autoCapitalize="words" />

          <Text style={styles.label}>Category</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Pressable key={c} style={[styles.chip, category === c && styles.chipSel]} onPress={() => setCategory(c)}>
                <Text style={[styles.chipText, category === c && styles.chipTextSel]}>{cap(c)}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Price *</Text>
              <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0.00" placeholderTextColor={colors.textFaint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{editing ? 'Stock on hand' : 'Starting stock'}</Text>
              <TextInput style={styles.input} value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textFaint} />
            </View>
          </View>

          <Text style={styles.label}>Low-stock alert at</Text>
          <TextInput style={styles.input} value={lowAt} onChangeText={setLowAt} keyboardType="numeric" placeholder="3" placeholderTextColor={colors.textFaint} />

          <Text style={styles.label}>Barcode (optional)</Text>
          <TextInput style={styles.input} value={barcode} onChangeText={setBarcode} placeholder="UPC / barcode number" placeholderTextColor={colors.textFaint} autoCapitalize="none" />

          <Text style={styles.label}>Description</Text>
          <TextInput style={[styles.input, styles.multiline]} value={desc} onChangeText={setDesc} placeholder="Size, ingredients, notes…" placeholderTextColor={colors.textFaint} multiline />

          {err ? <Text style={styles.err}>{err}</Text> : null}
          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{editing ? 'Save Changes' : 'Add Product'}</Text>}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '800', color: colors.textMute, marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: colors.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  photoBox: { width: 110, height: 110, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  photoEdit: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 3, alignItems: 'center' },
  photoEditText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  row2: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.card, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  chipSel: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#374151', fontWeight: '700', fontSize: 13 },
  chipTextSel: { color: '#fff' },
  saveBtn: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  err: { color: '#b91c1c', fontSize: 14, marginTop: 16, textAlign: 'center' },
});
