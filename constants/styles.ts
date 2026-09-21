/**
 * Shared style constants and reusable style objects.
 * Eliminates duplication across login, signup, search, index, and profile screens.
 */

import { StyleSheet } from 'react-native';

// ── Color Palette ────────────────────────────────────────────────────
export const Colors = {
    background: '#121212',
    surface: '#1e1e1e',
    surfaceAlt: '#2a2a2a',
    border: '#333',
    primary: '#ff4757',
    warning: '#ffa502',
    textPrimary: '#ffffff',
    textSecondary: '#888888',
    textMuted: '#444',
} as const;

// ── Shared Styles ────────────────────────────────────────────────────
export const SharedStyles = StyleSheet.create({
    // Containers
    screenContainer: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    centeredContainer: {
        flex: 1,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    authContainer: {
        flex: 1,
        padding: 20,
        backgroundColor: Colors.background,
        justifyContent: 'center',
    },

    // Typography
    headerText: {
        color: Colors.textPrimary,
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 10,
    },
    subText: {
        color: Colors.textSecondary,
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 30,
        paddingHorizontal: 20,
    },

    // Inputs
    inputContainer: {
        gap: 15,
        marginBottom: 30,
    },
    input: {
        backgroundColor: Colors.surface,
        color: Colors.textPrimary,
        paddingHorizontal: 15,
        paddingVertical: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },

    // Buttons
    buttonContainer: {
        gap: 15,
    },
    primaryButton: {
        backgroundColor: Colors.primary,
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    secondaryButton: {
        backgroundColor: 'transparent',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.primary,
    },
    buttonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    secondaryButtonText: {
        color: Colors.primary,
        fontWeight: 'bold',
        fontSize: 16,
    },

    // Cards
    gridCard: {
        backgroundColor: Colors.surface,
        width: '48%' as any,
        borderRadius: 12,
        marginBottom: 15,
        overflow: 'hidden' as const,
        elevation: 3,
    },
    imagePlaceholder: {
        width: '100%',
        aspectRatio: 2 / 3,
        backgroundColor: Colors.surfaceAlt,
        justifyContent: 'center',
        alignItems: 'center',
    },
    coverImage: {
        width: '100%',
        height: '100%',
    },
    textContainer: {
        padding: 10,
        minHeight: 50,
        backgroundColor: Colors.surface,
    },
    gridTitle: {
        color: Colors.textPrimary,
        fontSize: 13,
        fontWeight: 'bold',
        lineHeight: 18,
    },

    // Delete button overlay
    deleteButton: {
        position: 'absolute',
        top: 6,
        right: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        width: 26,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    deleteButtonText: {
        color: Colors.primary,
        fontSize: 14,
        fontWeight: 'bold',
        marginTop: -2,
    },
});
