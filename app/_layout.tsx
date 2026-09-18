import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthScreen } from '@/components/AuthScreen';
import { AppProvider, useApp } from '@/services/AppProvider';
import { subscribeNotificationResponse } from '@/services/notifications';
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
  useEffect(() => {
    if (!ready || !currentUser) return;
    const sub = subscribeNotificationResponse((matchId) => {
      router.push(`/match/${matchId}`);
    });
    return () => sub.remove();
  }, [ready, currentUser?.id]);
  if (!ready) return <Boot />;
  if (!currentUser) return <AuthScreen />;

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
        <Stack.Screen name="team/[id]" />
        <Stack.Screen name="player/[id]" />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="continent/[id]" />
        <Stack.Screen name="country/[id]" />
        <Stack.Screen name="compose" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="search" />
        <Stack.Screen name="pick-favorites" />
        <Stack.Screen name="tv" />
        <Stack.Screen name="leaderboard" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.shell}>
          <AppProvider>
            <RootNav />
          </AppProvider>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#040c08' },
  shell: Platform.select({
    web: {
      flex: 1,
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      backgroundColor: colors.bg,
    },
    default: { flex: 1, backgroundColor: colors.bg },
  }),
  boot: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
