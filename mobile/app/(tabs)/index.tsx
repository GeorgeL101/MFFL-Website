import React, { useMemo, useState, useLayoutEffect } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '../../constants/config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';


/* ---------- small helpers ---------- */
const ymd = (d: Date) => {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/* ---------- types ---------- */
type League = {
  leagueName: string;
  announcements: { id: string; title: string; body: string; date: string }[];
  roster: { team: string; manager: string; avatarThumb?: string | null }[];
};
type Me = { is_commish?: boolean };
type GamesResp = {
  games: {
    id: string; startUTC: string; network?: string | null;
    home: { abbrev?: string; name?: string };
    away: { abbrev?: string; name?: string };
  }[];
};
type TxResp = {
  items: {
    id: string; when: string; round: number; type: string;
    rosters?: { team: string; avatarThumb?: string | null }[];
    adds?: { name: string }[]; drops?: { name: string }[]; waiver_bid?: number;
  }[];
};

export default function HomeScreen() {
  const nav = useNavigation();
  const qc  = useQueryClient();
  const headerH = useHeaderHeight();


  // header menu
  const [menuOpen, setMenuOpen]         = useState(false);

  // modals
  const [showSuggest, setShowSuggest]   = useState(false);
  const [showCommish, setShowCommish]   = useState(false);
  const [showInbox, setShowInbox]       = useState(false);
  const [showActivity, setShowActivity] = useState(false);

  // calendar dates
  const [activeDate, setActiveDate]     = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // responsive column width for calendar
  const { width: winW } = useWindowDimensions();
  const H_PADDING = 16;        // ScrollView horizontal padding
  const GAP = 6;               // gap between cells
  const COL_W = Math.floor((winW - H_PADDING * 2 - GAP * 6) / 7); // 7 columns

  // queries
  const meQ      = useQuery<Me>({ queryKey: ['me'], queryFn: () => api('/api/me') });
  const leagueQ  = useQuery<League>({ queryKey: ['league'], queryFn: () => api('/api/league') });
  const gamesQ   = useQuery<GamesResp>({
    queryKey: ['games', ymd(selectedDate)],
    queryFn: () => api(`/api/nfl/games?date=${ymd(selectedDate)}`),
  });
  const txQ      = useQuery<TxResp>({
    queryKey: ['tx'],
    queryFn: () => api('/api/sleeper/transactions'),
    enabled: showActivity,
  });

  // mutations
  const suggestMut = useMutation({
    mutationFn: (payload: { name?: string; text: string }) =>
      api('/api/suggestions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setShowSuggest(false);
      Alert.alert('Thanks!', 'Suggestion submitted.');
    },
  });

  const commishMut = useMutation({
    mutationFn: (pw: string) =>
      api('/commish-login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `commish_password=${encodeURIComponent(pw)}`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setShowCommish(false);
      Alert.alert('Unlocked', 'Commissioner tools enabled.');
    },
  });

  const inboxQ = useQuery<{ items: { id: string; name?: string; text: string; when: string }[] }>(
    {
      queryKey: ['inbox'],
      queryFn: () => api('/api/suggestions'),
      enabled: !!meQ.data?.is_commish && showInbox,
    }
  );

  // month grid
  const monthGrid = useMemo(() => {
    const start = new Date(activeDate.getFullYear(), activeDate.getMonth(), 1);
    const end   = new Date(activeDate.getFullYear(), activeDate.getMonth() + 1, 0);
    const items: { key: string; d?: Date }[] = [];
    for (let i = 0; i < start.getDay(); i++) items.push({ key: `pad-${i}` });
    for (let day = 1; day <= end.getDate(); day++) {
      const d = new Date(activeDate.getFullYear(), activeDate.getMonth(), day);
      items.push({ key: ymd(d), d });
    }
    return items;
  }, [activeDate]);

  // put actions in the header
  useLayoutEffect(() => {
    nav.setOptions({
      title: 'MFFL • Home',
      headerRight: () => (
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={10} style={{ paddingHorizontal: 12 }}>
          <Ionicons name="menu" size={22} color="#e6e9f2" />
        </Pressable>
      ),
    });
  }, [nav, meQ.data?.is_commish]);

  if (leagueQ.isLoading)
    return <SafeAreaView style={styles.center}><ActivityIndicator/></SafeAreaView>;
  if (leagueQ.isError || !leagueQ.data)
    return <SafeAreaView style={styles.center}><Text style={{color:'#fff'}}>Could not load league.</Text></SafeAreaView>;

  const league = leagueQ.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1220' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* Announcements */}
        <Text style={styles.sectionTitle}>Announcements</Text>
        {league.announcements.length ? (
          league.announcements.map((a) => (
            <View key={a.id} style={styles.card}>
              <Text style={styles.cardTitle}>{a.title}</Text>
              <Text style={styles.muted}>{new Date(a.date).toLocaleString()}</Text>
              <Text style={{ color: '#dfe7ff', marginTop: 4 }}>{a.body}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>No announcements yet.</Text>
        )}

        {/* Calendar + Games */}
        <View style={styles.rowSpace}>
          <Text style={styles.sectionTitle}>NFL Games</Text>
          <View style={styles.row}>
            <Button title="‹" onPress={() => setActiveDate(new Date(activeDate.getFullYear(), activeDate.getMonth() - 1, 1))}/>
            <View style={{ width: 6 }} />
            <Button title="Today" onPress={() => { const t = new Date(); setActiveDate(new Date(t.getFullYear(), t.getMonth(), 1)); setSelectedDate(t); }}/>
            <View style={{ width: 6 }} />
            <Button title="›" onPress={() => setActiveDate(new Date(activeDate.getFullYear(), activeDate.getMonth() + 1, 1))}/>
          </View>
        </View>

        {/* DoW header aligned to grid */}
        <View style={[styles.rowWrap, { gap: GAP, marginTop: 6 }]}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <View key={d} style={{ width: COL_W, alignItems: 'center' }}>
              <Text style={[styles.muted, { marginBottom: 4 }]}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Month grid */}
        <View style={[styles.rowWrap, { gap: GAP }]}>
          {monthGrid.map(cell =>
            !cell.d ? (
              <View key={cell.key} style={{ width: COL_W, height: 44 }} />
            ) : (
              <Pressable
                key={cell.key}
                onPress={() => setSelectedDate(cell.d!)}
                style={[
                  styles.day,
                  { width: COL_W, height: 44 },
                  ymd(cell.d) === ymd(selectedDate) && styles.daySelected
                ]}
              >
                <Text style={{ color:'#cfe2ff' }}>{cell.d.getDate()}</Text>
              </Pressable>
            )
          )}
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={styles.muted}>
            {selectedDate.toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' })}
          </Text>
          {gamesQ.isLoading ? (
            <ActivityIndicator style={{ marginTop: 8 }} />
          ) : gamesQ.data?.games?.length ? (
            gamesQ.data.games.map(g => (
              <View key={g.id} style={styles.gameRow}>
                <Text style={{ color:'#dfe7ff', fontWeight:'700' }}>
                  {(g.away.abbrev || g.away.name) ?? 'Away'} @ {(g.home.abbrev || g.home.name) ?? 'Home'}
                </Text>
                <Text style={styles.muted}>
                  {new Date(g.startUTC).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })} • {g.network ?? ''}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>No games.</Text>
          )}
        </View>

        {/* Roster */}
        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>League Roster</Text>
        <View style={{ gap: 8 }}>
          {league.roster.map((m, i) => (
            <View key={`${m.team}-${i}`} style={styles.rosterItem}>
              {m.avatarThumb ? (
                <Image source={{ uri: m.avatarThumb.startsWith('http') ? m.avatarThumb : `${API_BASE}${m.avatarThumb}` }} style={styles.avatar}/>
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#10203a' }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{m.team}</Text>
                <Text style={styles.muted}>{m.manager}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ---------- HEADER MENU (hamburger) — in-screen dropdown ---------- */}
{menuOpen && (
  <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
    {/* dim background to close */}
    <Pressable
      style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,.12)' }]}
      onPress={() => setMenuOpen(false)}
    />
    {/* anchored just below the header, away from the Island */}
    <View style={{ position: 'absolute', top: 8, right: 10 }}>
      <View style={styles.sheet}>
        <Pressable style={styles.sheetBtn} onPress={() => { setMenuOpen(false); setShowActivity(true); }}>
          <Text style={styles.sheetTxt}>Activity</Text>
        </Pressable>
        <Pressable style={styles.sheetBtn} onPress={() => { setMenuOpen(false); setShowSuggest(true); }}>
          <Text style={styles.sheetTxt}>Suggest 💡</Text>
        </Pressable>
        {!meQ.data?.is_commish ? (
          <Pressable style={styles.sheetBtn} onPress={() => { setMenuOpen(false); setShowCommish(true); }}>
            <Text style={styles.sheetTxt}>Commish unlock 🔐</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.sheetBtn} onPress={() => { setMenuOpen(false); setShowInbox(true); }}>
            <Text style={styles.sheetTxt}>Suggestion inbox 📥</Text>
          </Pressable>
        )}
      </View>
    </View>
  </View>
)}


      {/* ---------- Suggestion modal ---------- */}
      <Modal visible={showSuggest} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Submit a suggestion</Text>
            <SuggestForm
              busy={suggestMut.isPending}
              onCancel={() => setShowSuggest(false)}
              onSubmit={(p) => suggestMut.mutate(p)}
            />
          </View>
        </View>
      </Modal>

      {/* ---------- Commish unlock ---------- */}
      <Modal visible={showCommish} transparent animationType="fade">
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Commissioner unlock</Text>
            <CommishForm
              busy={commishMut.isPending}
              onCancel={() => setShowCommish(false)}
              onSubmit={(pw) => commishMut.mutate(pw)}
            />
          </View>
        </View>
      </Modal>

      {/* ---------- Suggestions Inbox ---------- */}
      <Modal visible={showInbox} transparent animationType="fade" onRequestClose={() => setShowInbox(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.modal, { maxHeight: '75%' }]}>
            <View style={styles.rowSpace}>
              <Text style={styles.modalTitle}>Suggestion Inbox</Text>
              <Button title="Close" onPress={() => setShowInbox(false)} />
            </View>
            {inboxQ.isLoading ? (
              <ActivityIndicator />
            ) : inboxQ.data?.items?.length ? (
              <ScrollView style={{ marginTop: 8 }}>
                {inboxQ.data.items.map(x => (
                  <View key={x.id} style={styles.card}>
                    <Text style={{ color:'#fff', fontWeight:'600' }}>
                      {x.name ? `${x.name}: ` : ''}<Text style={{ color:'#dfe7ff' }}>{x.text}</Text>
                    </Text>
                    <Text style={styles.muted}>{new Date(x.when).toLocaleString()}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.muted}>No suggestions yet.</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* ---------- Activity (transactions) ---------- */}
      <Modal visible={showActivity} transparent animationType="fade" onRequestClose={() => setShowActivity(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.modal, { maxHeight: '75%' }]}>
            <View style={styles.rowSpace}>
              <Text style={styles.modalTitle}>League Activity</Text>
              <Button title="Close" onPress={() => setShowActivity(false)} />
            </View>
            {txQ.isLoading ? (
              <ActivityIndicator />
            ) : txQ.data?.items?.length ? (
              <ScrollView style={{ marginTop: 8 }}>
                {txQ.data.items.map(t => (
                  <View key={t.id} style={styles.card}>
                    <Text style={{ color:'#fff', fontWeight:'600' }}>{describeTx(t)}</Text>
                    <Text style={styles.muted}>
                      {new Date(t.when).toLocaleString()} • Week {t.round}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.muted}>No recent activity.</Text>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- little helpers/components ---------- */
function describeTx(t: TxResp['items'][number]) {
  if (t.type === 'trade' && (t.rosters?.length ?? 0) >= 2) {
    const a = t.rosters![0]?.team, b = t.rosters![1]?.team;
    return `${a} ↔ ${b} completed a trade.`;
  }
  const add = t.adds?.[0], drop = t.drops?.[0];
  if (add && drop) return `${add.name} added; ${drop.name} dropped.`;
  if (add) return `${add.name} added${t.waiver_bid ? ` for $${t.waiver_bid}` : ''}.`;
  if (drop) return `${drop.name} dropped.`;
  return 'League activity.';
}

function SuggestForm({
  busy, onCancel, onSubmit,
}:{ busy?: boolean; onCancel: () => void; onSubmit: (p: { name?: string; text: string }) => void }) {
  const [name, setName] = useState(''); const [text, setText] = useState('');
  return (
    <>
      <TextInput placeholder="Your name (optional)" placeholderTextColor="#8aa4d6"
        style={styles.input} value={name} onChangeText={setName} />
      <TextInput placeholder="Your suggestion…" placeholderTextColor="#8aa4d6"
        style={[styles.input, { height: 120, textAlignVertical: 'top' }]} multiline
        value={text} onChangeText={setText} />
      <View style={styles.rowEnd}>
        <Button title="Cancel" onPress={onCancel} />
        <View style={{ width: 8 }} />
        <Button title={busy ? 'Sending…' : 'Send'}
          onPress={() => onSubmit({ name: name.trim() || undefined, text })}
          disabled={busy || !text.trim()} />
      </View>
    </>
  );
}

function CommishForm({
  busy, onCancel, onSubmit,
}:{ busy?: boolean; onCancel: () => void; onSubmit: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  return (
    <>
      <TextInput placeholder="Commissioner password" placeholderTextColor="#8aa4d6"
        secureTextEntry style={styles.input} value={pw} onChangeText={setPw} />
      <View style={styles.rowEnd}>
        <Button title="Cancel" onPress={onCancel} />
        <View style={{ width: 8 }} />
        <Button title={busy ? 'Unlocking…' : 'Unlock'}
          onPress={() => onSubmit(pw)} disabled={busy || !pw} />
      </View>
    </>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  center:{ flex:1, alignItems:'center', justifyContent:'center' },
  sectionTitle:{ color:'#fff', fontSize:18, fontWeight:'800', marginTop:12, marginBottom:6 },
  row:{ flexDirection:'row', alignItems:'center' },
  rowEnd:{ flexDirection:'row', justifyContent:'flex-end', alignItems:'center', marginTop:10 },
  rowSpace:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  rowWrap:{ flexDirection:'row', flexWrap:'wrap' },
  muted:{ color:'#9fb0d2' },
  card:{ backgroundColor:'#0e1728', borderColor:'#1e2a44', borderWidth:1, padding:12, borderRadius:12, marginBottom:8 },
  cardTitle:{ color:'#fff', fontWeight:'700', marginBottom:4 },
  day:{
    alignItems:'center', justifyContent:'center',
    borderWidth:1, borderColor:'#1e2a44', borderRadius:8, backgroundColor:'#0c1426',
  },
  daySelected:{ borderColor:'#7dd3fc', borderWidth:2 },
  gameRow:{ paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#1e2a44' },
  rosterItem:{ flexDirection:'row', alignItems:'center', gap:10,
    backgroundColor:'#0e1728', borderWidth:1, borderColor:'#1e2a44', padding:10, borderRadius:12 },
  avatar:{ width:38, height:38, borderRadius:19, marginRight:6 },

  // header menu
  sheetBackdrop:{ flex:1, backgroundColor:'rgba(0,0,0,.15)', justifyContent:'flex-start', alignItems:'flex-end' },
  sheet:{ backgroundColor:'#0c1426', borderWidth:1, borderColor:'#1e2a44', borderRadius:12, marginTop:6, marginRight:10, minWidth:210, overflow:'hidden' },
  sheetBtn:{ paddingVertical:12, paddingHorizontal:14, borderBottomWidth:1, borderBottomColor:'#1e2a44' },
  sheetTxt:{ color:'#e6e9f2', fontWeight:'600' },

  // generic modals
  backdrop:{ flex:1, backgroundColor:'rgba(0,0,0,.4)', alignItems:'center', justifyContent:'center' },
  modal:{ width:'90%', maxWidth:520, backgroundColor:'#0c1426',
    borderWidth:1, borderColor:'#1e2a44', borderRadius:14, padding:14 },
  modalTitle:{ color:'#fff', fontWeight:'800', fontSize:16, marginBottom:8 },
  input:{ backgroundColor:'#0e1728', color:'#e6e9f2', borderWidth:1, borderColor:'#1e2a44',
    borderRadius:10, padding:10, marginTop:8 },
});
