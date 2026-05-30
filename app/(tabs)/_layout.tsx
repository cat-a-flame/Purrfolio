import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightColors, darkColors } from '@/lib/theme';

function TabIcon({ name, color, focused, accentBg }: { name: any; color: string; focused: boolean; accentBg: string }) {
  return (
    <View style={[styles.iconWrap, focused && { backgroundColor: accentBg }]}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 48,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function TabsLayout() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const accentBg = colors.accent + '22';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          height: 60,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => <TabIcon name="home-outline" color={color} focused={focused} accentBg={accentBg} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, focused }) => <TabIcon name="list-outline" color={color} focused={focused} accentBg={accentBg} />,
        }}
      />
      <Tabs.Screen
        name="recurring"
        options={{
          title: 'Recurring',
          tabBarIcon: ({ color, focused }) => <TabIcon name="repeat-outline" color={color} focused={focused} accentBg={accentBg} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, focused }) => <TabIcon name="bar-chart-outline" color={color} focused={focused} accentBg={accentBg} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ href: null }}
      />
    </Tabs>
  );
}
