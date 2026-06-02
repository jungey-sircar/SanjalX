import Constants from 'expo-constants';
import { Platform } from 'react-native';

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const getConfiguredBackendUrl = () => {
  const backendUrl =
    Constants.expoConfig?.extra?.backendUrl ||
    process.env.EXPO_PUBLIC_BACKEND_URL;

  return typeof backendUrl === 'string' && backendUrl.trim()
    ? trimTrailingSlash(backendUrl.trim())
    : null;
};

const getExpoHost = () => {
  const constants = Constants as typeof Constants & {
    manifest?: { debuggerHost?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
  };

  const hostUri =
    Constants.expoConfig?.hostUri ||
    constants.manifest?.debuggerHost ||
    constants.manifest2?.extra?.expoClient?.hostUri;

  return hostUri?.split(':')[0];
};

export const getBackendUrl = () => {
  const configuredUrl = getConfiguredBackendUrl();
  if (configuredUrl) {
    return configuredUrl;
  }

  const expoHost = getExpoHost();
  if (expoHost) {
    return `http://${expoHost}:8000`;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:8000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  return 'http://127.0.0.1:8000';
};

export const getWebSocketUrl = (path: string) => {
  const backendUrl = getBackendUrl();
  const wsBaseUrl = backendUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  return `${wsBaseUrl}${path}`;
};
