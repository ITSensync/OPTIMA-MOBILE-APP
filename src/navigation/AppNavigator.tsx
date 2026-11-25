import React from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlacementHistoryScreen } from '../screens/PlacementHistoryScreen';
import { PlacementScreen } from '../screens/PlacementScreen';
import { RelocationScreen } from '../screens/RelocationScreen';
import { colors } from '../theme';
import type { PlacementTabParamList } from './types';

const Tab = createBottomTabNavigator<PlacementTabParamList>();

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
    notification: colors.danger,
  },
};

const ICONS: Record<keyof PlacementTabParamList, string> = {
  Placement: '▣',
  Relocation: '↔',
  History: '≡',
};

function Tabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 64 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ],
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color }) => (
          <Text style={[styles.tabIcon, { color }]}>{ICONS[route.name]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Placement" component={PlacementScreen} options={{ title: 'Placement' }} />
      <Tab.Screen name="Relocation" component={RelocationScreen} options={{ title: 'Relocation' }} />
      <Tab.Screen
        name="History"
        component={PlacementHistoryScreen}
        options={{ title: 'History' }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Tabs />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    height: 64,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  tabIcon: { fontSize: 19 },
});
