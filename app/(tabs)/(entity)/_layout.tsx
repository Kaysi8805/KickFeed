import { Stack } from 'expo-router';

import { colors } from '@/theme';

/**
 * Football entity screens share one stack inside the tab navigator so
 * `/match`, `/team`, `/player`, and `/league` keep their URLs and the tab bar.
 * Compose, edit-profile, and other utility routes stay on the root stack.
 */
export default function EntityStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    />
  );
}
