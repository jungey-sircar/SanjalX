export const Colors = {
  light: {
    primary: '#07C160',
    secondary: '#576B95',
    background: '#EDEDED',
    surface: '#FFFFFF',
    text: '#191919',
    textSecondary: '#888888',
    border: '#E0E0E0',
    error: '#FA5151',
    success: '#07C160',
    warning: '#FFC300',
    tabBar: '#F7F7F7',
    chatBubbleSent: '#95EC69',
    chatBubbleReceived: '#FFFFFF',
  },
  dark: {
    primary: '#07C160',
    secondary: '#8BA5D3',
    background: '#111111',
    surface: '#1C1C1E',
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    border: '#38383A',
    error: '#FF453A',
    success: '#32D74B',
    warning: '#FFD60A',
    tabBar: '#1C1C1E',
    chatBubbleSent: '#07C160',
    chatBubbleReceived: '#2C2C2E',
  }
};

export type ColorScheme = typeof Colors.light;
