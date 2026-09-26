import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMaterial3Theme } from '@pchmn/expo-material3-theme';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'pine' | 'mocha' | 'obsidian' | 'navy' | 'coral' | 'forest' | 'teal' | 'indigo' | 'plum' | 'matcha' | 'noir';
export type ColorMode = 'system' | 'light' | 'dark';

export const PRESET_COLORS = {
    pine: '#2D5A27',      // Pine Green
    mocha: '#8B5A2B',     // Warm Brown
    obsidian: '#800000',  // Deep Crimson / Near Black
    navy: '#000080',      // Navy Blue
    coral: '#FF7F50',     // Coral
    forest: '#68BA7F',    // Forest
    teal: '#00695C',      // Deep Teal
    indigo: '#283593',    // Indigo
    plum: '#6A1B9A',      // Deep Plum
    matcha: '#4A5D23',    // Matcha Green
    noir: '#333333',      // Black and White
};

// These are just for the UI Swatches in the profile screen
export const PREVIEW_COLORS: Record<string, { fg: string, bgDark: string, bgLight: string }> = {
    pine: { fg: '#2D5A27', bgDark: '#0F1A12', bgLight: '#F4F2ED' },
    mocha: { fg: '#8B5A2B', bgDark: '#241810', bgLight: '#F7EBE1' },
    obsidian: { fg: '#800000', bgDark: '#160808', bgLight: '#F8E8E8' },
    navy: { fg: '#000080', bgDark: '#080D1A', bgLight: '#E8EDF5' },
    coral: { fg: '#FF7F50', bgDark: '#2A1610', bgLight: '#FDF1EB' },
    forest: { fg: '#68BA7F', bgDark: '#253D2C', bgLight: '#E8F5E9' },
    teal: { fg: '#00695C', bgDark: '#001D1A', bgLight: '#E0F2F1' },
    indigo: { fg: '#283593', bgDark: '#1A1B26', bgLight: '#E8EAF6' },
    plum: { fg: '#6A1B9A', bgDark: '#230E26', bgLight: '#F3E5F5' },
    matcha: { fg: '#4A5D23', bgDark: '#1C261E', bgLight: '#F5F5DC' },
    noir: { fg: '#333333', bgDark: '#000000', bgLight: '#FFFFFF' },
};

// Material 3 defaults are often too subtle (just grey/white). We forcibly inject these rich, themed backgrounds!
const THEME_OVERRIDES: Record<string, { light: any, dark: any }> = {
    pine: {
        light: { background: '#F4F2ED', surface: '#F4F2ED', surfaceContainer: '#EAE6DF', surfaceContainerHigh: '#DED9CE', surfaceVariant: '#DED9CE', outline: '#9EBAA4', onSurface: '#2D5A27', onBackground: '#2D5A27' },
        dark: { background: '#0F1A12', surface: '#0F1A12', surfaceContainer: '#16281B', surfaceContainerHigh: '#1E3624', surfaceVariant: '#1E3624', outline: '#4A6B53', onSurface: '#F4F2ED', onBackground: '#F4F2ED', onSurfaceVariant: '#DED9CE' },
    },
    mocha: {
        light: { background: '#F7EBE1', surface: '#F7EBE1', surfaceContainer: '#EAD7C8', surfaceContainerHigh: '#DAC3B0', surfaceVariant: '#DAC3B0', outline: '#AD9480' },
        dark: { background: '#241810', surface: '#241810', surfaceContainer: '#302015', surfaceContainerHigh: '#402B1D', surfaceVariant: '#402B1D', outline: '#70503B' },
    },
    obsidian: {
        light: { background: '#F8E8E8', surface: '#F8E8E8', surfaceContainer: '#F2D8D8', surfaceContainerHigh: '#E8C4C4', surfaceVariant: '#E8C4C4', outline: '#BA9292' },
        dark: { background: '#160808', surface: '#160808', surfaceContainer: '#220C0C', surfaceContainerHigh: '#331212', surfaceVariant: '#331212', outline: '#6B3333' },
    },
    navy: {
        light: { background: '#E8EDF5', surface: '#E8EDF5', surfaceContainer: '#D4E0F0', surfaceContainerHigh: '#C1D2E8', surfaceVariant: '#C1D2E8', outline: '#95A9C4' },
        dark: { background: '#080D1A', surface: '#080D1A', surfaceContainer: '#0F1A30', surfaceContainerHigh: '#152445', surfaceVariant: '#152445', outline: '#344B75' },
    },
    coral: {
        light: { background: '#FDF1EB', surface: '#FDF1EB', surfaceContainer: '#F7DFD3', surfaceContainerHigh: '#EFC9B6', surfaceVariant: '#EFC9B6', outline: '#C49F8C' },
        dark: { background: '#2A1610', surface: '#2A1610', surfaceContainer: '#3A1E15', surfaceContainerHigh: '#4D271B', surfaceVariant: '#4D271B', outline: '#7A4836' },
    },
    forest: {
        light: { background: '#E8F5E9', surface: '#E8F5E9', surfaceContainer: '#C8E6C9', surfaceContainerHigh: '#A5D6A7', surfaceVariant: '#A5D6A7', outline: '#81C784' },
        dark: { background: '#253D2C', surface: '#253D2C', surfaceContainer: '#1B2D20', surfaceContainerHigh: '#121F16', surfaceVariant: '#121F16', outline: '#3E5C47' },
    },
    teal: {
        light: { background: '#E0F2F1', surface: '#E0F2F1', surfaceContainer: '#B2DFDB', surfaceContainerHigh: '#80CBC4', surfaceVariant: '#80CBC4', outline: '#4DB6AC' },
        dark: { background: '#001D1A', surface: '#001D1A', surfaceContainer: '#00332E', surfaceContainerHigh: '#004D40', surfaceVariant: '#004D40', outline: '#00695C' },
    },
    indigo: {
        light: { background: '#E8EAF6', surface: '#E8EAF6', surfaceContainer: '#C5CAE9', surfaceContainerHigh: '#9FA8DA', surfaceVariant: '#9FA8DA', outline: '#7986CB' },
        dark: { background: '#1A1B26', surface: '#1A1B26', surfaceContainer: '#282A3A', surfaceContainerHigh: '#393C54', surfaceVariant: '#393C54', outline: '#5C6BC0' },
    },
    plum: {
        light: { background: '#F3E5F5', surface: '#F3E5F5', surfaceContainer: '#E1BEE7', surfaceContainerHigh: '#CE93D8', surfaceVariant: '#CE93D8', outline: '#BA68C8' },
        dark: { background: '#230E26', surface: '#230E26', surfaceContainer: '#38163D', surfaceContainerHigh: '#4A148C', surfaceVariant: '#4A148C', outline: '#7B1FA2' },
    },
    matcha: {
        light: { background: '#F5F5DC', surface: '#F5F5DC', surfaceContainer: '#E3E3B5', surfaceContainerHigh: '#D1D192', surfaceVariant: '#D1D192', outline: '#9E9D24' },
        dark: { background: '#1C261E', surface: '#1C261E', surfaceContainer: '#2A3B2D', surfaceContainerHigh: '#39523D', surfaceVariant: '#39523D', outline: '#558B2F' },
    },
    noir: {
        light: { background: '#FFFFFF', surface: '#FFFFFF', surfaceContainer: '#F0F0F0', surfaceContainerHigh: '#E0E0E0', surfaceVariant: '#E0E0E0', outline: '#999999', onSurface: '#000000', onBackground: '#000000', onSurfaceVariant: '#333333', primary: '#000000', onPrimary: '#FFFFFF', primaryContainer: '#CCCCCC', onPrimaryContainer: '#000000' },
        dark: { background: '#000000', surface: '#000000', surfaceContainer: '#111111', surfaceContainerHigh: '#222222', surfaceVariant: '#222222', outline: '#666666', onSurface: '#FFFFFF', onBackground: '#FFFFFF', onSurfaceVariant: '#CCCCCC', primary: '#FFFFFF', onPrimary: '#000000', primaryContainer: '#333333', onPrimaryContainer: '#FFFFFF' },
    },
};

interface ThemeContextType {
    preference: ThemePreference;
    setPreference: (pref: ThemePreference, save?: boolean) => void;
    colorMode: ColorMode;
    setColorMode: (mode: ColorMode, save?: boolean) => void;
    isDark: boolean;
    colors: ReturnType<typeof useMaterial3Theme>['theme']['dark'];
    isDynamicSupported: boolean;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [preference, setPreferenceState] = useState<ThemePreference>('system');
    const [colorMode, setColorModeState] = useState<ColorMode>('system');
    const systemColorScheme = useColorScheme();
    
    // We use dynamic theme. If the user picks a preset, we feed that preset's color 
    // as the source color to generate a complete Material 3 palette from it!
    const sourceColor = preference === 'system' ? undefined : PRESET_COLORS[preference];
    
    const { theme, updateTheme, resetTheme } = useMaterial3Theme({ fallbackSourceColor: PRESET_COLORS.pine });
    
    useEffect(() => {
        // Load preference from storage
        AsyncStorage.getItem('theme_preference').then((pref) => {
            if (pref) {
                setPreferenceState(pref as ThemePreference);
            }
        });
        AsyncStorage.getItem('color_mode').then((mode) => {
            if (mode) {
                setColorModeState(mode as ColorMode);
            }
        });
    }, []);

    useEffect(() => {
        if (sourceColor) {
            updateTheme(sourceColor);
        } else {
            resetTheme(); // reset to system dynamic color
        }
    }, [sourceColor]);

    const setPreference = (pref: ThemePreference, save = true) => {
        setPreferenceState(pref);
        if (save) AsyncStorage.setItem('theme_preference', pref);
    };

    const setColorMode = (mode: ColorMode, save = true) => {
        setColorModeState(mode);
        if (save) AsyncStorage.setItem('color_mode', mode);
    };

    const isDark = colorMode === 'system' ? systemColorScheme === 'dark' : colorMode === 'dark';
    
    // Retrieve base material 3 theme
    let activeColors = isDark ? theme.dark : theme.light;

    // Inject strong background overrides if a preset is selected
    if (preference !== 'system' && THEME_OVERRIDES[preference]) {
        const overrides = isDark ? THEME_OVERRIDES[preference].dark : THEME_OVERRIDES[preference].light;
        activeColors = { ...activeColors, ...overrides };
    }

    const value = {
        preference,
        setPreference,
        colorMode,
        setColorMode,
        isDark,
        colors: activeColors,
        isDynamicSupported: true,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useAppTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useAppTheme must be used within ThemeProvider');
    return context;
}
