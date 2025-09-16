// app/(tabs)/cams.tsx
import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useHeaderHeight } from '@react-navigation/elements';
import { API_BASE } from '../../constants/config';

/* ---------------- API helpers ---------------- */
async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/* ---------------- Types ---------------- */
type Me = { is_commish?: boolean; is_cam?: boolean };
type CamBlock =
  | { id: string; type: 'post'; title: string; body: string; when: string; span?: 6|12 }
  | { id: string; type: 'image'; url: string; caption?: string; span?: 6|12 };
type CamResp = { items: CamBlock[] };

/* ---------------- Screen ---------------- */
export default function CamsScreen() {
  const nav = useNavigation();
  const qc  = useQueryClient();
  const headerH = useHeaderHeight();

  const [menuOpen, setMenuOpen]       = useState(false);
  const [showCamLogin, setShowCamLogin] = useState(false);
  const [showNewPost, setShowNewPost]   = useState(false);
  const [busyPhoto, setBusyPhoto]       = useState(false);

  useLayoutEffect(() => {
    nav.setOptions({
      title: "Cam's Corner",
      headerRight: () => (
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={{ paddingRight: 12 }}>
          <Ionicons name="menu" size={20} color="#e6e9f2" />
        </Pressable>
      ),
    });
  }, [nav]);

  const meQ   = useQuery<Me>({ queryKey: ['me'], queryFn: () => api('/api/me') });
  const feedQ = useQuery<CamResp>({ queryKey: ['cams'], queryFn: () => api('/api/cams') });

  const camMut = useMutation({
    mutationFn: (pw: string) =>
      api('/cam-login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `cam_password=${encodeURIComponent(pw)}`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setShowCamLogin(false);
      Alert.alert('Cam unlocked', 'You now have edit access.');
    },
  });

  const signOutCamMut = useMutation({
    mutationFn: () => api('/cam-logout', { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      Alert.alert('Signed out', 'Cam tools disabled.');
    },
    onError: () => Alert.alert('Error', 'Could not sign out.'),
  });

  const postMut = useMutation({
    mutationFn: (payload: { title?: string; body: string; span?: 6|12 }) =>
      api('/api/cams/blocks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setShowNewPost(false);
      qc.invalidateQueries({ queryKey: ['cams'] });
    },
  });

  async function pickAndUploadImage() {
    try {
      setBusyPhoto(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const uri = asset.uri;
      const name = uri.split('/').pop() || `photo-${Date.now()}.jpg`;
      const ext = (name.split('.').pop() || 'jpg').toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

      const fd = new FormData();
      // @ts-expect-error – RN FormData file typing
      fd.append('image', { uri, name, type: mime });
      fd.append('caption', '');
      fd.append('span', '6');

      const r = await fetch(`${API_BASE}/api/cams/blocks`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await r.json();
      qc.invalidateQueries({ queryKey: ['cams'] });
    } catch (e: any) {
      Alert.alert('Upload failed', String(e?.message || e));
    } finally {
      setBusyPhoto(false);
    }
  }

  async function deleteBlock(id: string) {
    try {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert('Delete block?', 'This cannot be undone.', [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
        ])
      );
      if (!ok) return;

      const r = await fetch(`${API_BASE}/api/cams/blocks/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      qc.invalidateQueries({ queryKey: ['cams'] });
    } catch (e: any) {
      Alert.alert('Delete failed', String(e?.message || e));
    }
  }

  const items = useMemo(() => feedQ.data?.items ?? [], [feedQ.data?.items]);

  /* ---------- UI ---------- */
  if (feedQ.isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  if (feedQ.isError) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ color: '#fff' }}>Could not load Cam’s feed.</Text>
      </SafeAreaView>
    );
  }

  const isCam = !!meQ.data?.is_cam;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1220' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Banner always visible for viewers and Cam */}
        <View style={styles.heroWrap}>
          <Image
            source={require('../../assets/images/cams-corner-banner.png')}
            style={styles.heroImg}
            resizeMode="cover"
          />
        </View>

        {/* Cam Toolbar (only when unlocked) */}
        {isCam && (
          <View style={[styles.row, { justifyContent: 'flex-end', marginBottom: 10, gap: 8 }]}>
            <Button title={busyPhoto ? 'Uploading…' : 'Add Photo'} onPress={pickAndUploadImage} disabled={busyPhoto} />
            <Button title="Add Text" onPress={() => setShowNewPost(true)} />
            <Button title="Refresh" onPress={() => qc.invalidateQueries({ queryKey: ['cams'] })} />
          </View>
        )}

        {/* Feed */}
        {!items.length ? (
          <Text style={styles.muted}>No posts yet.</Text>
        ) : (
          items.map((b) => (
            <View key={b.id} style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
              {b.type === 'image' ? (
                <>
                  <Image
                    source={{ uri: b.url.startsWith('http') ? b.url : `${API_BASE}${b.url}` }}
                    style={{ width: '100%', height: 220 }}
                    resizeMode="cover"
                  />
                  {(b.caption ?? '').length > 0 && (
                    <View style={{ padding: 12 }}>
                      <Text style={{ color: '#e6e9f2' }}>{b.caption}</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={{ padding: 12 }}>
                  <Text style={styles.cardTitle}>{b.title}</Text>
                  {'when' in b && b.when && (
                    <Text style={[styles.muted, { marginBottom: 6 }]}>
                      {new Date(b.when).toLocaleString()}
                    </Text>
                  )}
                  <Text style={{ color: '#cfe2ff' }}>{b.body}</Text>
                </View>
              )}

              {isCam && (
                <View style={{ padding: 8, borderTopWidth: 1, borderTopColor: '#1e2a44', alignItems: 'flex-end' }}>
                  <Pressable style={styles.iconBtn} onPress={() => deleteBlock(b.id)}>
                    <Ionicons name="trash-outline" size={18} color="#ffb4b4" />
                    <Text style={{ color: '#ffb4b4', marginLeft: 6 }}>Delete</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* ---- HEADER MENU (hamburger) ---- */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.sheet, { marginTop: headerH + 6 }]}>
            {!isCam ? (
              <Pressable style={styles.sheetBtn} onPress={() => { setMenuOpen(false); setShowCamLogin(true); }}>
                <Text style={styles.sheetTxt}>Unlock Cam 🔐</Text>
              </Pressable>
            ) : (
              <>
                <Pressable style={styles.sheetBtn} onPress={() => { setMenuOpen(false); setShowNewPost(true); }}>
                  <Text style={styles.sheetTxt}>New post</Text>
                </Pressable>
                <Pressable style={styles.sheetBtn} onPress={() => { setMenuOpen(false); pickAndUploadImage(); }}>
                  <Text style={styles.sheetTxt}>Add photo</Text>
                </Pressable>
                <Pressable
                  style={styles.sheetBtn}
                  onPress={() => { setMenuOpen(false); signOutCamMut.mutate(); }}
                >
                  <Text style={styles.sheetTxt}>
                    {signOutCamMut.isPending ? 'Signing out…' : 'Sign out of Cam'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Cam unlock modal */}
      <Modal visible={showCamLogin} transparent animationType="fade" onRequestClose={() => setShowCamLogin(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Cam unlock</Text>
            <CamForm
              busy={camMut.isPending}
              onCancel={() => setShowCamLogin(false)}
              onSubmit={(pw) => camMut.mutate(pw)}
            />
          </View>
        </View>
      </Modal>

      {/* New text post modal */}
      <Modal visible={showNewPost} transparent animationType="fade" onRequestClose={() => setShowNewPost(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New post</Text>
            <NewPostForm
              busy={postMut.isPending}
              onCancel={() => setShowNewPost(false)}
              onSubmit={(payload) => postMut.mutate(payload)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------------- Forms ---------------- */
function CamForm({
  busy, onCancel, onSubmit,
}: { busy?: boolean; onCancel: () => void; onSubmit: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  return (
    <>
      <TextInput
        placeholder="Cam password"
        placeholderTextColor="#8aa4d6"
        secureTextEntry
        style={styles.input}
        value={pw}
        onChangeText={setPw}
      />
      <View style={styles.rowEnd}>
        <Button title="Cancel" onPress={onCancel} />
        <View style={{ width: 8 }} />
        <Button title={busy ? 'Unlocking…' : 'Unlock'} onPress={() => onSubmit(pw)} disabled={busy || !pw} />
      </View>
    </>
  );
}

function NewPostForm({
  busy, onCancel, onSubmit,
}: { busy?: boolean; onCancel: () => void; onSubmit: (p: { title?: string; body: string; span?: 6|12 }) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody]   = useState('');
  const [span, setSpan]   = useState<6|12>(6);

  return (
    <>
      <TextInput
        placeholder="Title (optional)"
        placeholderTextColor="#8aa4d6"
        style={styles.input}
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        placeholder="Write your post…"
        placeholderTextColor="#8aa4d6"
        style={[styles.input, { height: 140, textAlignVertical: 'top' }]}
        multiline
        value={body}
        onChangeText={setBody}
      />
      <View style={[styles.row, { justifyContent: 'space-between', marginTop: 8 }]}>
        <Text style={styles.muted}>Width</Text>
        <View style={[styles.row, { gap: 8 }]}>
          <Pressable
            style={[styles.pill, span === 6 && styles.pillActive]}
            onPress={() => setSpan(6)}
          >
            <Text style={[styles.pillTxt, span === 6 && styles.pillTxtActive]}>Half</Text>
          </Pressable>
          <Pressable
            style={[styles.pill, span === 12 && styles.pillActive]}
            onPress={() => setSpan(12)}
          >
            <Text style={[styles.pillTxt, span === 12 && styles.pillTxtActive]}>Full</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.rowEnd}>
        <Button title="Cancel" onPress={onCancel} />
        <View style={{ width: 8 }} />
        <Button
          title={busy ? 'Posting…' : 'Post'}
          onPress={() => onSubmit({ title: title.trim() || undefined, body, span })}
          disabled={busy || !body.trim()}
        />
      </View>
    </>
  );
}

/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  center:{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#0b1220' },
  row:{ flexDirection:'row', alignItems:'center' },
  rowEnd:{ flexDirection:'row', justifyContent:'flex-end', alignItems:'center', marginTop:10 },
  muted:{ color:'#9fb0d2' },

  heroWrap: { marginBottom: 12, borderRadius: 16, overflow: 'hidden' },
  heroImg: { width: '100%', height: 220, borderWidth: 1, borderColor: '#1e2a44' },

  card:{ backgroundColor:'#0e1728', borderColor:'#1e2a44', borderWidth:1, borderRadius:12, marginBottom:12 },
  cardTitle:{ color:'#fff', fontWeight:'700', fontSize:16, marginBottom:4 },

  iconBtn:{ flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:6 },

  // header menu
  sheetBackdrop:{ flex:1, backgroundColor:'rgba(0,0,0,.15)', justifyContent:'flex-start', alignItems:'flex-end' },
  sheet:{ backgroundColor:'#0c1426', borderWidth:1, borderColor:'#1e2a44', borderRadius:12, marginRight:10, minWidth:210, overflow:'hidden' },
  sheetBtn:{ paddingVertical:12, paddingHorizontal:14, borderBottomWidth:1, borderBottomColor:'#1e2a44' },
  sheetTxt:{ color:'#e6e9f2', fontWeight:'600' },

  // generic modals
  backdrop:{ flex:1, backgroundColor:'rgba(0,0,0,.4)', alignItems:'center', justifyContent:'center' },
  modal:{ width:'90%', maxWidth:520, backgroundColor:'#0c1426',
    borderWidth:1, borderColor:'#1e2a44', borderRadius:14, padding:14 },
  modalTitle:{ color:'#fff', fontWeight:'800', fontSize:16, marginBottom:8 },
  input:{ backgroundColor:'#0e1728', color:'#e6e9f2', borderWidth:1, borderColor:'#1e2a44',
    borderRadius:10, padding:10, marginTop:8 },

  pill:{ paddingHorizontal:12, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor:'#1e2a44', backgroundColor:'#0e1728' },
  pillActive:{ borderColor:'#7dd3fc', backgroundColor:'#0c1426' },
  pillTxt:{ color:'#cfe2ff', fontWeight:'600' },
  pillTxtActive:{ color:'#fff' },
});
