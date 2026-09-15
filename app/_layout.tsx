import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DemoLogin } from '@/components/DemoLogin';
import { AppProvider, useApp } from '@/services/AppProvider';
import { colors } from '@/theme';

function Boot() {
  return (
    <View style={styles.boot}>
      <ActivityIndicator color={colors.lime} size="large" />
    </View>
  );
}

function RootNav() {
  const { ready, currentUser } = useApp();
  if (!ready) return <Boot />;
  if (!currentUser) return <DemoLogin />;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="match/[id]" />
        <Stack.Screen name="league/[id]" />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="continent/[id]" />
        <Stack.Screen name="country/[id]" />
        <Stack.Screen name="compose" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="pick-favorites" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <AppProvider>
          <RootNav />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
