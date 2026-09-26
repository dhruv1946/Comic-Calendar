import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { useAppTheme } from '../hooks/useTheme';

export interface AlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
    visible: boolean;
    title: string;
    message: string;
    buttons: AlertButton[];
}

interface AlertContextType {
    showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
}

const AlertContext = createContext<AlertContextType | null>(null);

export function ThemedAlertProvider({ children }: { children: ReactNode }) {
    const { colors } = useAppTheme();
    const [alertState, setAlertState] = useState<AlertState>({
        visible: false,
        title: '',
        message: '',
        buttons: [],
    });

    const showAlert = (title: string, message: string = '', buttons: AlertButton[] = [{ text: 'OK' }]) => {
        setAlertState({ visible: true, title, message, buttons });
    };

    const hideAlert = () => {
        setAlertState(prev => ({ ...prev, visible: false }));
    };

    const handleButtonPress = (onPress?: () => void) => {
        hideAlert();
        if (onPress) {
            setTimeout(onPress, 50); // slight delay to allow modal to close
        }
    };

    return (
        <AlertContext.Provider value={{ showAlert }}>
            {children}
            <Modal
                transparent
                visible={alertState.visible}
                animationType="fade"
                onRequestClose={hideAlert}
            >
                <TouchableWithoutFeedback onPress={hideAlert}>
                    <View style={styles.overlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.dialog, { backgroundColor: colors.surfaceContainerHighest || colors.surfaceContainer }]}>
                                <Text style={[styles.title, { color: colors.onSurface }]}>{alertState.title}</Text>
                                {!!alertState.message && (
                                    <Text style={[styles.message, { color: colors.onSurfaceVariant }]}>{alertState.message}</Text>
                                )}
                                <View style={styles.buttonContainer}>
                                    {alertState.buttons.map((btn, index) => {
                                        const isDestructive = btn.style === 'destructive';
                                        return (
                                            <TouchableOpacity 
                                                key={index} 
                                                style={styles.button} 
                                                onPress={() => handleButtonPress(btn.onPress)}
                                            >
                                                <Text style={[
                                                    styles.buttonText, 
                                                    { color: isDestructive ? '#EF4444' : colors.primary, fontWeight: btn.style === 'cancel' ? 'normal' : 'bold' }
                                                ]}>
                                                    {btn.text.toUpperCase()}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </AlertContext.Provider>
    );
}

export function useThemedAlert() {
    const context = useContext(AlertContext);
    if (!context) throw new Error('useThemedAlert must be used within ThemedAlertProvider');
    return context;
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    dialog: {
        width: '85%',
        maxWidth: 400,
        borderRadius: 24, // Material 3 dialog corner radius
        padding: 24,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
    },
    title: {
        fontSize: 24,
        fontWeight: 'normal', // Material 3 uses normal weight for dialog titles
        marginBottom: 16,
    },
    message: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 24,
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
    },
    button: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        minWidth: 64,
        alignItems: 'center',
    },
    buttonText: {
        fontSize: 14,
        letterSpacing: 0.1,
    }
});
