// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // backend/* are separate projects with their own tooling.
    ignores: ['dist/*', 'backend/**'],
  },
]);
