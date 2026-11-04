import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  AppState,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from './src/navigation/AppNavigator';
import { SettingsProvider, useSettings } from './src/state/SettingsProvider';
import { flushLogs } from './src/storage/logRepo';
import { colors } from './src/theme';

function AppContent() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        void flushLogs();
      }
    });
    return () => {
      sub.remove();
      void flushLogs();
    };
  }, []);

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
