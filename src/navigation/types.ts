import type { NavigatorScreenParams } from '@react-navigation/native';

export type PlacementTabParamList = {
  Placement: undefined;
  History: undefined;
};

export type TabParamList = {
  Inventory: undefined;
  Tags: undefined;
  History: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<TabParamList> | undefined;
  TagDetail: { epc: string };
  Diagnostics: undefined;
  Notifications: undefined;
  PendingPlacement: { epc: string };
  PlacementSettings: undefined;
};
