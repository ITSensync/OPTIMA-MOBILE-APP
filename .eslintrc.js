module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // `void promise` dipakai sengaja untuk menandai fire-and-forget.
    'no-void': 'off',
    // tabBarIcon adalah render prop, bukan komponen nested.
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
};
