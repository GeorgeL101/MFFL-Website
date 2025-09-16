// app/(tabs)/_layout.tsx
import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
// Optional: blur background
// import { BlurView } from 'expo-blur';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        // Header (for each tab screen)
        headerStyle: { backgroundColor: '#0b1220' },
        headerTintColor: '#e6e9f2',
        headerTitleStyle: { fontWeight: '800' },

        // Tab bar
        tabBarStyle: {
          backgroundColor: '#0b1220',
          borderTopColor: '#1e2a44',
          height: 64,
        },
        // If you like a frosted look instead:
        // tabBarBackground: () => (
        //   <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        // ),

        tabBarActiveTintColor: '#22c55e',
        tabBarInactiveTintColor: '#9fb0d2',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
        tabBarIconStyle: { marginTop: 6 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'Teams',
          tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="bracket"
        options={{
          title: 'Bracket',
          tabBarIcon: ({ color }) => <Ionicons name="trophy-outline" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cams"
        options={{
          title: "Cam’s Corner",
          tabBarIcon: ({ color }) => <Ionicons name="american-football-outline" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
