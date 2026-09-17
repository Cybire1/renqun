import { Tabs } from 'expo-router';
import { MezoTabBar } from '../../components/mezo/MezoTabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <MezoTabBar {...props} />} screenOptions={{ headerShown: false }}>
      {/* Order here = order in the dock: Markets · Portfolio · Wallet · Settings */}
      <Tabs.Screen name="index" options={{ title: 'Markets' }} />
      <Tabs.Screen name="positions" options={{ title: 'Portfolio' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
      <Tabs.Screen name="more" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
