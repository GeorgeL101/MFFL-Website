// app/(tabs)/teams.tsx
import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '../../constants/config';

/* ---------------- helpers ---------------- */
async function api(path: string, init?: RequestInit) {
  const r = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

type League = {
  roster: { roster_id: number; team: string; manager: string; avatarThumb?: string | null }[];
};

type RosterDetail = {
  roster_id: number;
  starters: { id: string; name: string; pos?: string; team?: string }[];
  bench:    { id: string; name: string; pos?: string; team?: string }[];
  reserve?: { id: string; name: string; pos?: string; team?: string }[];
};

/* ---------------- screen ---------------- */
export default function TeamsScreen() {
  const nav = useNavigation();

  useLayoutEffect(() => {
    nav.setOptions({
      title: 'MFFL • Teams',
      headerRight: () => (
        <View style={{ paddingHorizontal: 12 }}>
          <Ionicons name="people" size={22} color="#e6e9f2" />
        </View>
      ),
    });
  }, [nav]);

  // 1) Get league teams (includes roster_id from your server.js)
  const leagueQ = useQuery<League>({
    queryKey: ['league'],
    queryFn: () => api('/api/league'),
  });

  const teams = leagueQ.data?.roster ?? [];

  // currently selected roster_id
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null);

  // 2) Fetch the selected roster’s players
  const rosterQ = useQuery<RosterDetail>({
    queryKey: ['roster', selectedRosterId],
    queryFn: () => api(`/api/sleeper/roster/${selectedRosterId}`),
    enabled: selectedRosterId != null,
  });

  const starters = rosterQ.data?.starters ?? [];
  const bench    = rosterQ.data?.bench ?? [];
  const reserve  = rosterQ.data?.reserve ?? [];

  if (leagueQ.isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  if (leagueQ.isError || !teams.length) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ color: '#fff' }}>Could not load teams.</Text>
      </SafeAreaView>
    );
  }

  // pick first team automatically if none selected
  useMemo(() => {
    if (selectedRosterId == null && teams.length) {
      setSelectedRosterId(teams[0].roster_id);
    }
  }, [teams, selectedRosterId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0b1220' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Team picker chips */}
        <Text style={styles.h2}>Teams</Text>
        <View style={styles.chipsWrap}>
          {teams.map((t) => (
            <Pressable
              key={t.roster_id}
              onPress={() => setSelectedRosterId(t.roster_id)}
              style={[
                styles.chip,
                selectedRosterId === t.roster_id && styles.chipActive,
              ]}
            >
              <Text style={[styles.chipTxt, selectedRosterId === t.roster_id && styles.chipTxtActive]}>
                {t.team}
              </Text>
              <Text style={styles.chipSub}>{t.manager}</Text>
            </Pressable>
          ))}
        </View>

        {/* Roster for selected team */}
        {selectedRosterId == null ? (
          <Text style={styles.muted}>Select a team to view its roster.</Text>
        ) : rosterQ.isLoading ? (
          <View style={{ marginTop: 12 }}>
            <ActivityIndicator />
          </View>
        ) : rosterQ.isError ? (
          <Text style={styles.muted}>Could not load roster.</Text>
        ) : (
          <>
            <Text style={[styles.h2, { marginTop: 12 }]}>Starters</Text>
            {starters.length ? starters.map((p) => (
              <View key={p.id} style={styles.playerRow}>
                <Text style={styles.pName}>{p.name}</Text>
                <Text style={styles.pMeta}>{[p.pos, p.team].filter(Boolean).join(' • ')}</Text>
              </View>
            )) : <Text style={styles.muted}>No starters listed.</Text>}

            <Text style={[styles.h2, { marginTop: 14 }]}>Bench</Text>
            {bench.length ? bench.map((p) => (
              <View key={p.id} style={styles.playerRow}>
                <Text style={styles.pName}>{p.name}</Text>
                <Text style={styles.pMeta}>{[p.pos, p.team].filter(Boolean).join(' • ')}</Text>
              </View>
            )) : <Text style={styles.muted}>Bench is empty.</Text>}

            {!!reserve.length && (
              <>
                <Text style={[styles.h2, { marginTop: 14 }]}>Reserve</Text>
                {reserve.map((p) => (
                  <View key={p.id} style={styles.playerRow}>
                    <Text style={styles.pName}>{p.name}</Text>
                    <Text style={styles.pMeta}>{[p.pos, p.team].filter(Boolean).join(' • ')}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  center:{ flex:1, alignItems:'center', justifyContent:'center' },
  h2:{ color:'#fff', fontSize:18, fontWeight:'800', marginBottom:8 },
  muted:{ color:'#9fb0d2' },

  chipsWrap:{ flexDirection:'row', flexWrap:'wrap', gap:10 },
  chip:{
    padding:10,
    borderRadius:12,
    borderWidth:1,
    borderColor:'#1e2a44',
    backgroundColor:'#0e1728',
    minWidth:140,
  },
  chipActive:{ borderColor:'#7dd3fc', backgroundColor:'#0c1426' },
  chipTxt:{ color:'#e6e9f2', fontWeight:'700' },
  chipTxtActive:{ color:'#fff' },
  chipSub:{ color:'#9fb0d2', fontSize:12, marginTop:2 },

  playerRow:{ paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#1e2a44' },
  pName:{ color:'#e6e9f2', fontWeight:'700' },
  pMeta:{ color:'#9fb0d2', fontSize:12, marginTop:2 },
});
