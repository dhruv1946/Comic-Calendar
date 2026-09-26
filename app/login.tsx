import { useRouter } from 'expo-router';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getFirebaseErrorMessage } from '../constants/firebaseErrors';
import { Colors, SharedStyles } from '../constants/styles';
import { validateEmail, validatePassword } from '../constants/validation';
import { auth } from '../firebase';
import { useAppTheme } from '../hooks/useTheme';
import { useThemedAlert } from '../components/ThemedAlertProvider';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { colors } = useAppTheme();
    const { showAlert } = useThemedAlert();

    const [isResetting, setIsResetting] = useState(false);

    const router = useRouter();

    async function signInWithEmail() {
        const emailCheck = validateEmail(email);
        if (!emailCheck.valid) {
            showAlert('Invalid Email', emailCheck.message);
            return;
        }
        const passCheck = validatePassword(password);
        if (!passCheck.valid) {
            showAlert('Invalid Password', passCheck.message);
            return;
        }

        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
            router.replace('/');
        } catch (error: any) {
            const message = getFirebaseErrorMessage(error.code);
            showAlert('Sign In Error', message);
        }
        setLoading(false);
    }

    async function handleSendResetLink() {
        const emailCheck = validateEmail(email);
        if (!emailCheck.valid) {
            showAlert('Invalid Email', emailCheck.message);
            return;
        }
        setLoading(true);
        try {
            await sendPasswordResetEmail(auth, email.trim());
            showAlert(
                'Reset Link Sent',
                'Check your email for a password reset link. After resetting, come back here to sign in.'
            );
            setIsResetting(false);
        } catch (error: any) {
            const message = getFirebaseErrorMessage(error.code);
            showAlert('Error', message);
        }
        setLoading(false);
    }

    return (
        <View style={[SharedStyles.authContainer, { backgroundColor: colors.background }]}>
            {!isResetting ? (
                <>
                    <Text style={[SharedStyles.headerText, { color: colors.onBackground }]}>Welcome to your Pull List</Text>

                    <View style={SharedStyles.inputContainer}>
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
                            placeholder="Password"
                            placeholderTextColor={colors.onSurfaceVariant}
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={SharedStyles.buttonContainer}>
                        <TouchableOpacity style={[SharedStyles.primaryButton, { backgroundColor: colors.primary }]} onPress={signInWithEmail} disabled={loading}>
                            <Text style={[SharedStyles.buttonText, { color: colors.onPrimary }]}>Sign In</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[SharedStyles.secondaryButton, { borderColor: colors.primary }]} onPress={() => router.push('/signup')} disabled={loading}>
                            <Text style={[SharedStyles.secondaryButtonText, { color: colors.primary }]}>Create Account</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setIsResetting(true)} disabled={loading} style={{ marginTop: 10 }}>
                            <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Forgot Password?</Text>
                        </TouchableOpacity>
                    </View>
                </>
            ) : (
                <>
                    <Text style={[SharedStyles.headerText, { color: colors.onBackground }]}>Reset Password</Text>
                    <Text style={[SharedStyles.subText, { color: colors.onSurfaceVariant }]}>Enter your account email and we'll send you a password reset link.</Text>

                    <View style={SharedStyles.inputContainer}>
                        <TextInput
                            style={[SharedStyles.input, { backgroundColor: colors.surfaceContainer, color: colors.onSurface, borderColor: colors.outline }]}
                            onChangeText={setEmail}
                            value={email}
                            placeholder="email@address.com"
                            placeholderTextColor={colors.onSurfaceVariant}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>

                    <View style={SharedStyles.buttonContainer}>
                        <TouchableOpacity style={[SharedStyles.primaryButton, { backgroundColor: colors.primary }]} onPress={handleSendResetLink} disabled={loading}>
                            <Text style={[SharedStyles.buttonText, { color: colors.onPrimary }]}>Send Reset Link</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[SharedStyles.secondaryButton, { borderColor: colors.primary }]} onPress={() => setIsResetting(false)} disabled={loading}>
                            <Text style={[SharedStyles.secondaryButtonText, { color: colors.primary }]}>Back to Login</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}

            {loading && <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />}
        </View>
    );
}

const styles = StyleSheet.create({
    forgotPasswordText: { textAlign: 'center', fontSize: 14, textDecorationLine: 'underline' },
});