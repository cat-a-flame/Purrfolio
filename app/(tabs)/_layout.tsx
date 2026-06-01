import { Tabs } from 'expo-router';
import CustomTabBar from '@/components/CustomTabBar';
import { RecurringProvider } from '@/lib/recurringContext';

export default function TabsLayout() {
  return (
    <RecurringProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 },
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="recurring" options={{ title: 'Recurring' }} />
      <Tabs.Screen name="stats" options={{ title: 'Statistics' }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
    </RecurringProvider>
  );
}
