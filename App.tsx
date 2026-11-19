import React from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from './src/navigation/AppNavigator';
import { SettingsProvider, useSettings } from './src/state/SettingsProvider';
import { colors } from './src/theme';

function AppContent() {
  const { ready } = useSettings();

  return (
    <>
      <StatusBar barStyle="light-content" />
      {ready ? (
        <AppNavigator />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      )}
    </>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

export default App;

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
