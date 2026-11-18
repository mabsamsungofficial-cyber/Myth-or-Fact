import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mythorfact.maker',
  appName: 'Myth or Fact Maker',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Preferences: {},
    Filesystem: {},
    Share: {}
  }
};

export default config;
