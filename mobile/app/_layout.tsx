import { Stack } from "expo-router";
import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";

const qc = new QueryClient();

type AuthCtx = { token: string | null; setToken: (t: string | null) => void };
const AuthContext = createContext<AuthCtx>({ token: null, setToken: () => {} });
export const useAuth = () => useContext(AuthContext);

export default function RootLayout() {
  const [token, setToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync("mffl_token").then((t) => {
      setToken(t);
      setBooting(false);
    });
  }, []);

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // app/_layout.tsx
// ...
return (
  <AuthContext.Provider value={{ token, setToken }}>
    <QueryClientProvider client={qc}>
      {/* Hide the root header so "(tabs)" doesn't show */}
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  </AuthContext.Provider>
);

}
