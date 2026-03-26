export type TerminalThemeName =
  | 'OpsClaw Dark'
  | 'Dracula'
  | 'Catppuccin Mocha'
  | 'Solarized Dark'
  | 'Light';

export type XtermTheme = {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

export type AppTheme = {
  mode: 'dark' | 'light';
  bg: {
    base: string;
    elevated: string;
    elevated2: string;
    elevated3: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  border: {
    default: string;
    strong: string;
  };
  accent: {
    primary: string;
    primaryHover: string;
  };
  status: {
    success: string;
    warning: string;
    error: string;
  };
};

export type TerminalFontFamily =
  | '"IBM Plex Mono", monospace'
  | '"JetBrains Mono", monospace'
  | '"Fira Code", monospace'
  | '"Cascadia Code", monospace'
  | 'Menlo, monospace'
  | 'monospace';

export type TerminalSettings = {
  fontFamily: TerminalFontFamily;
  fontSize: number;
  lineHeight: number;
  scrollback: number;
  themeName: TerminalThemeName;
};

export const TERMINAL_SETTINGS_KEY = 'opsclaw:terminal-settings';

export const APP_THEMES: Record<TerminalThemeName, AppTheme> = {
  'OpsClaw Dark': {
    mode: 'dark',
    bg: { base: '#111214', elevated: '#141519', elevated2: '#17181b', elevated3: '#1e2025' },
    text: { primary: '#e5e7eb', secondary: '#9ca3af', tertiary: '#6b7280' },
    border: { default: '#262626', strong: '#404040' },
    accent: { primary: '#3b82f6', primaryHover: '#2563eb' },
    status: { success: '#10b981', warning: '#fbbf24', error: '#ef4444' },
  },
  'Dracula': {
    mode: 'dark',
    bg: { base: '#282a36', elevated: '#2d2f3b', elevated2: '#343746', elevated3: '#3d4051' },
    text: { primary: '#f8f8f2', secondary: '#a0a0a0', tertiary: '#6272a4' },
    border: { default: '#44475a', strong: '#5a5d70' },
    accent: { primary: '#bd93f9', primaryHover: '#a87fe8' },
    status: { success: '#50fa7b', warning: '#f1fa8c', error: '#ff5555' },
  },
  'Catppuccin Mocha': {
    mode: 'dark',
    bg: { base: '#1e1e2e', elevated: '#24243e', elevated2: '#2a2a40', elevated3: '#313244' },
    text: { primary: '#cdd6f4', secondary: '#a6adc8', tertiary: '#7f849c' },
    border: { default: '#45475a', strong: '#585b70' },
    accent: { primary: '#89b4fa', primaryHover: '#74a0e8' },
    status: { success: '#a6e3a1', warning: '#f9e2af', error: '#f38ba8' },
  },
  'Solarized Dark': {
    mode: 'dark',
    bg: { base: '#002b36', elevated: '#073642', elevated2: '#0d4450', elevated3: '#13525e' },
    text: { primary: '#fdf6e3', secondary: '#93a1a1', tertiary: '#657b83' },
    border: { default: '#073642', strong: '#0d4450' },
    accent: { primary: '#268bd2', primaryHover: '#2176b8' },
    status: { success: '#859900', warning: '#b58900', error: '#dc322f' },
  },
  'Light': {
    mode: 'light',
    bg: { base: '#ffffff', elevated: '#f9fafb', elevated2: '#f3f4f6', elevated3: '#e5e7eb' },
    text: { primary: '#111827', secondary: '#6b7280', tertiary: '#9ca3af' },
    border: { default: '#e5e7eb', strong: '#d1d5db' },
    accent: { primary: '#3b82f6', primaryHover: '#2563eb' },
    status: { success: '#10b981', warning: '#f59e0b', error: '#ef4444' },
  },
};

export const TERMINAL_THEMES: Record<TerminalThemeName, XtermTheme> = {
  // OpsClaw custom dark theme
  'OpsClaw Dark': {
    background: '#0b1015',
    foreground: '#d7e0ea',
    cursor: '#67b7ff',
    cursorAccent: '#0b1015',
    selectionBackground: '#2a4a6b',
    selectionForeground: '#d7e0ea',
    black: '#0b1015',
    red: '#ea857a',
    green: '#84d68e',
    yellow: '#e2b366',
    blue: '#67b7ff',
    magenta: '#b892ff',
    cyan: '#79d3ff',
    white: '#d7e0ea',
    brightBlack: '#54606d',
    brightRed: '#f3a39a',
    brightGreen: '#a6ecae',
    brightYellow: '#f0cd89',
    brightBlue: '#96d6ff',
    brightMagenta: '#ccb4ff',
    brightCyan: '#a7e7ff',
    brightWhite: '#f5f9fc',
  },

  // Dracula — official canonical palette (draculatheme.com)
  'Dracula': {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    cursorAccent: '#282a36',
    selectionBackground: '#44475a',
    selectionForeground: '#f8f8f2',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },

  // Catppuccin Mocha — official palette (catppuccin.com)
  'Catppuccin Mocha': {
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    cursorAccent: '#1e1e2e',
    selectionBackground: '#585b70',
    selectionForeground: '#cdd6f4',
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
  },

  // Solarized Dark — Ethan Schoonover canonical palette
  'Solarized Dark': {
    background: '#002b36',
    foreground: '#839496',
    cursor: '#93a1a1',
    cursorAccent: '#002b36',
    selectionBackground: '#073642',
    selectionForeground: '#93a1a1',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
  },

  // Light — One Light palette
  'Light': {
    background: '#fafafa',
    foreground: '#383a42',
    cursor: '#4078f2',
    cursorAccent: '#fafafa',
    selectionBackground: '#c8d3e3',
    selectionForeground: '#383a42',
    black: '#696c77',
    red: '#e45649',
    green: '#50a14f',
    yellow: '#986801',
    blue: '#4078f2',
    magenta: '#a626a4',
    cyan: '#0184bc',
    white: '#a0a1a7',
    brightBlack: '#4f525e',
    brightRed: '#ca1243',
    brightGreen: '#50a14f',
    brightYellow: '#c18401',
    brightBlue: '#4078f2',
    brightMagenta: '#a626a4',
    brightCyan: '#0184bc',
    brightWhite: '#383a42',
  },
};

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: 13,
  lineHeight: 1.35,
  scrollback: 3000,
  themeName: 'OpsClaw Dark',
};

export const FONT_FAMILY_OPTIONS: Array<{ label: string; value: TerminalFontFamily }> = [
  { label: 'IBM Plex Mono', value: '"IBM Plex Mono", monospace' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Fira Code', value: '"Fira Code", monospace' },
  { label: 'Cascadia Code', value: '"Cascadia Code", monospace' },
  { label: 'Menlo', value: 'Menlo, monospace' },
  { label: 'System Monospace', value: 'monospace' },
];

export function loadTerminalSettings(): TerminalSettings {
  try {
    const raw = localStorage.getItem(TERMINAL_SETTINGS_KEY);
    if (!raw) return DEFAULT_TERMINAL_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TerminalSettings>;
    // Guard: themeName must be a known theme
    const knownThemes = Object.keys(TERMINAL_THEMES) as TerminalThemeName[];
    if (parsed.themeName && !knownThemes.includes(parsed.themeName)) {
      parsed.themeName = DEFAULT_TERMINAL_SETTINGS.themeName;
    }
    return { ...DEFAULT_TERMINAL_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_TERMINAL_SETTINGS;
  }
}

export function saveTerminalSettings(settings: TerminalSettings): void {
  localStorage.setItem(TERMINAL_SETTINGS_KEY, JSON.stringify(settings));
}
