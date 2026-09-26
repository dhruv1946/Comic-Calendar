import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getFirebaseErrorMessage } from '../constants/firebaseErrors';
import { Colors, SharedStyles } from '../constants/styles';
import { validateEmail, validateName, validatePassword } from '../constants/validation';
import { auth } from '../firebase';
import { useAppTheme } from '../hooks/useTheme';
import { useThemedAlert } from '../components/ThemedAlertProvider';

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { colors } = useAppTheme();
    const { showAlert } = useThemedAlert();

    const router = useRouter();

    async function handleSignUp() {
        const nameCheck = validateName(name);
        if (!nameCheck.valid) {
            showAlert('Invalid Name', nameCheck.message);
            return;
        }
        const emailCheck = validateEmail(email);
        if (!emailCheck.valid) {
            showAlert('Invalid Email', emailCheck.message);
            return;
        }
        const passCheck = validatePassword(password);
        if (!passCheck.valid) {
            showAlert('Weak Password', passCheck.message);
            return;
        }

        setLoading(true);
        try {
            const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);

            // Set the display name on the Firebase user profile
            await updateProfile(user, { displayName: name.trim() });

            // Send verification email in the background — don't block the user
            sendEmailVerification(user).catch(() => {
                // Silently fail — the user can resend from the home screen banner
            });

            router.replace('/');
        } catch (error: any) {
            const message = getFirebaseErrorMessage(error.code);
            showAlert('Sign Up Error', message);
        }
        setLoading(false);
    }

    return (
        <View style={[SharedStyles.authContainer, { backgroundColor: colors.background }]}>
            <Text style={[SharedStyles.headerText, { color: colors.onBackground }]}>Create an Account</Text>

            <View style={SharedStyles.inputContainer}>
                <TextInput
                    style={[SharedStyles.input, { backgroundColor: colors.surfaceContainer, color: colors.onSurface, borderColor: colors.outline }]}
                    onChangeText={setName}
                    value={name}
                    placeholder="Full Name"
                    placeholderTextColor={colors.onSurfaceVariant}
                />
                <TextInput
                    style={[SharedStyles.input, { backgroundColor: colors.surfaceContainer, color: colors.onSurface, borderColor: colors.outline }]}
                    onChangeText={setEmail}
                    value={email}
                    placeholder="email@address.com"
                    placeholderTextColor={colors.onSurfaceVariant}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    style={[SharedStyles.input, { backgroundColor: colors.surfaceContainer, color: colors.onSurface, borderColor: colors.outline }]}
                    onChangeText={setPassword}
                    value={password}
                    secureTextEntry={true}
                    placeholder="Password (min 8 characters)"
                    placeholderTextColor={colors.onSurfaceVariant}
                    autoCapitalize="none"
                />
            </View>

            <View style={SharedStyles.buttonContainer}>
                <TouchableOpacity style={[SharedStyles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleSignUp} disabled={loading}>
                    <Text style={[SharedStyles.buttonText, { color: colors.onPrimary }]}>Sign Up</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.backButton} onPress={() => router.back()} disabled={loading}>
                    <Text style={[styles.backButtonText, { color: colors.primary }]}>Back to Login</Text>
                </TouchableOpacity>
            </View>

            {loading && <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />}
        </View>
    );
}

const styles = StyleSheet.create({
    backButton: {
        backgroundColor: 'transparent',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    backButtonText: { fontWeight: 'bold', fontSize: 14 },
});