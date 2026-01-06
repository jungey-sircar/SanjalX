import { useColorScheme } from 'react-native';
import { Colors, ColorScheme } from '../constants/theme';

export function useTheme(): ColorScheme {
  const colorScheme = useColorScheme();
  return Colors[colorScheme || 'light'];
}
