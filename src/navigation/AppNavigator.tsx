import React from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  DarkTheme,
  NavigationContainer,
  type Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { InventoryScreen } from '../screens/InventoryScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { PendingPlacementScreen } from '../screens/PendingPlacementScreen';
import { PlacementSettingsScreen } from '../screens/PlacementSettingsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TagDetailScreen } from '../screens/TagDetailScreen';
import { TagsScreen } from '../screens/TagsScreen';
import { colors } from '../theme';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

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

const ICONS: Record<keyof TabParamList, string> = {
  Inventory: '▣',
  Tags: '▤',
  History: '≡',
  Settings: '⚙',
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
      <Tab.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{ title: 'Inventory' }}
      />
      <Tab.Screen
        name="Tags"
        component={TagsScreen}
        options={{ title: 'Tag' }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'Riwayat' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Setelan' }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name="Main"
          component={Tabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="TagDetail"
          component={TagDetailScreen}
          options={{ title: 'Detail Tag' }}
        />
        <Stack.Screen
          name="Diagnostics"
          component={DiagnosticsScreen}
          options={{ title: 'Diagnostics' }}
        />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifikasi' }}
        />
        <Stack.Screen
          name="PendingPlacement"
          component={PendingPlacementScreen}
          options={{ title: 'Detail Penempatan' }}
        />
        <Stack.Screen
          name="PlacementSettings"
          component={PlacementSettingsScreen}
          options={{ title: 'Daftar Penempatan' }}
        />
      </Stack.Navigator>
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
