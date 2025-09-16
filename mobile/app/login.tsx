import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { API_BASE } from "../constants/config";
import { useAuth } from "./_layout";

export default function Login() {
  const { setToken } = useAuth();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function doLogin() {
    if (!pw.trim()) return;
    setBusy(true);
    try {
      // 1) hit your existing /login (sets a cookie session)
      await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `password=${encodeURIComponent(pw)}`,
      });

      // 2) verify we’re actually authed
      const me = await fetch(`${API_BASE}/api/me`);
      if (!me.ok) throw new Error("Not authed");

      // 3) set a local flag so we skip the login screen next time
      await SecureStore.setItemAsync("mffl_token", "ok");
      setToken("ok");

      router.replace("/");
    } catch (e) {
      Alert.alert("Login failed", "Check the password and server URL.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Sign in to MFFL</Text>
      <TextInput
        value={pw}
        onChangeText={setPw}
        placeholder="Site password"
        placeholderTextColor="#789"
        secureTextEntry
        autoCapitalize="none"
        style={s.input}
      />
      <Pressable disabled={busy} onPress={doLogin} style={s.btn}>
        {busy ? <ActivityIndicator color="#06210f" /> : <Text style={s.btnTxt}>Enter</Text>}
      </Pressable>
      <Text style={s.hint}>Same shared password as the website.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0b1220", padding: 20, justifyContent: "center" },
  title: { color: "#e6e9f2", fontSize: 22, fontWeight: "800", marginBottom: 14 },
  input: {
    backgroundColor: "#0e1728", color: "#e6e9f2", borderColor: "#1e2a44",
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12,
  },
  btn: { backgroundColor: "#22c55e", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  btnTxt: { color: "#06210f", fontWeight: "800" },
  hint: { color: "#9fb0d2", marginTop: 12 },
});
