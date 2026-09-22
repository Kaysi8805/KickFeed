import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';

import { tabBarFocusIndex } from '@/lib/entityTabs';
import { colors } from '@/theme';

function nestedRouteName(route: BottomTabBarProps['state']['routes'][number]): string | undefined {
  const nested = route.state;
  if (!nested || !('routes' in nested) || !Array.isArray(nested.routes) || nested.routes.length === 0) {
    return undefined;
  }
  const index = typeof nested.index === 'number' ? nested.index : 0;
  const child = nested.routes[index];
  return child && typeof child === 'object' && 'name' in child ? String(child.name) : undefined;
}

/**
 * The entity stack is a hidden tab, so the real index paints no bar item.
 * Alias that focus onto Home, Matches, or Leagues so a primary tab stays selected.
 * Tab presses still navigate using the real route (see screenListeners).
 */
function EntityTabBar(props: BottomTabBarProps) {
  const route = props.state.routes[props.state.index];
  const index = tabBarFocusIndex(props.state.routes, props.state.index, route ? nestedRouteName(route) : undefined);
  return <BottomTabBar {...props} state={{ ...props.state, index }} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <EntityTabBar {...props} />}
      screenListeners={({ navigation, route }) => ({
        tabPress: () => {
          const state = navigation.getState();
          const current = state.routes[state.index ?? 0];
          if (current?.name === '(entity)' && route.name !== '(entity)') {
            navigation.navigate(route.name);
          }
        },
      })}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surfaceElevated,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color, size }) => <Ionicons name="football" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="leagues"
        options={{
          title: 'Leagues',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="following"
        options={{
          title: 'Following',
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="(entity)" options={{ href: null }} />
    </Tabs>
  );
}
