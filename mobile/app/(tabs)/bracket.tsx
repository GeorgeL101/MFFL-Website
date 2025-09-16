import React from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '../../constants/config';

async function api(path: string) {
  const r = await fetch(`${API_BASE}${path}`, { credentials:'include' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

type BracketNode = { r:number|null; m:number|null; t1?:any; t2?:any; w?:number|null };
type BracketResp = { winners: BracketNode[]; losers: BracketNode[]; playoff_start_week:number|null };

export default function Bracket() {
  const q = useQuery<BracketResp>({ queryKey:['bracket'], queryFn:()=>api('/api/sleeper/bracket') });

  if (q.isLoading) return <SafeAreaView style={s.center}><ActivityIndicator/></SafeAreaView>;
  if (q.isError || !q.data) return <SafeAreaView style={s.center}><Text style={{color:'#fff'}}>Could not load bracket.</Text></SafeAreaView>;

  const Row = ({n}:{n:BracketNode}) => (
    <View style={s.card}>
      <Text style={s.cardTitle}>Round {n.r ?? '—'} • Match {n.m ?? '—'}</Text>
      <Text style={s.muted}>{n.t1?.team ?? 'TBD'} vs {n.t2?.team ?? 'TBD'}</Text>
    </View>
  );

  return (
    <SafeAreaView style={{flex:1, backgroundColor:'#0b1220'}}>
      <ScrollView contentContainerStyle={{padding:16}}>
        <Text style={s.title}>Playoffs</Text>
        <Text style={s.muted}>Start week: {q.data.playoff_start_week ?? '—'}</Text>

        <Text style={[s.title,{marginTop:12}]}>Winners</Text>
        {q.data.winners.length ? q.data.winners.map((n,i)=><Row key={`w-${i}`} n={n}/>) : <Text style={s.muted}>TBD</Text>}

        <Text style={[s.title,{marginTop:12}]}>Losers</Text>
        {q.data.losers.length ? q.data.losers.map((n,i)=><Row key={`l-${i}`} n={n}/>) : <Text style={s.muted}>TBD</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center:{ flex:1, alignItems:'center', justifyContent:'center' },
  title:{ color:'#fff', fontSize:18, fontWeight:'800', marginBottom:8 },
  muted:{ color:'#9fb0d2' },
  card:{ backgroundColor:'#0e1728', borderWidth:1, borderColor:'#1e2a44', padding:12, borderRadius:12, marginTop:8 },
  cardTitle:{ color:'#fff', fontWeight:'700', marginBottom:4 },
});
