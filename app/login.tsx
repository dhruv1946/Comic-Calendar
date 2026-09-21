    import { useRouter } from 'expo-router';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, SharedStyles } from '../constants/styles';
import { validateEmail, validatePassword } from '../constants/validation';
import { auth } from '../firebase';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const [isResetting, setIsResetting] = useState(false);

    const router = useRouter();

    async function signInWithEmail() {
        const emailCheck = validateEmail(email);
        if (!emailCheck.valid) {
            Alert.alert('Invalid Email', emailCheck.message);
            return;
        }
        const passCheck = validatePassword(password);
        if (!passCheck.valid) {
            Alert.alert('Invalid Password', passCheck.message);
            return;
        }

        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
            router.replace('/');
        } catch (error: any) {
            const message = getFirebaseAuthErrorMessage(error.code);
            Alert.alert('Sign In Error', message);
        }
        setLoading(false);
    }

    async function handleSendResetLink() {
        const emailCheck = validateEmail(email);
        if (!emailCheck.valid) {
            Alert.alert('Invalid Email', emailCheck.message);
            return;
        }
        setLoading(true);
        try {
            await sendPasswordResetEmail(auth, email.trim());
            Alert.alert(
                'Reset Link Sent',
                'Check your email for a password reset link. After resetting, come back here to sign in.'
            );
            setIsResetting(false);
        } catch (error: any) {
            const message = getFirebaseAuthErrorMessage(error.code);
            Alert.alert('Error', message);
        }
        setLoading(false);
    }

    return (
        <View style={SharedStyles.authContainer}>
            {!isResetting ? (
                <>
                    <Text style={SharedStyles.headerText}>Welcome to your Pull List</Text>

                    <View style={SharedStyles.inputContainer}>
                        <TextInput
                            style={SharedStyles.input}
                            onChangeText={setEmail}
                            value={email}
                            placeholder="email@address.com"
                            placeholderTextColor={Colors.textSecondary}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                        <TextInput
                            style={SharedStyles.input}
                            onChangeText={setPassword}
                            value={password}
                            secureTextEntry={true}
                            placeholder="Password"
                            placeholderTextColor={Colors.textSecondary}
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={SharedStyles.buttonContainer}>
                        <TouchableOpacity style={SharedStyles.primaryButton} onPress={signInWithEmail} disabled={loading}>
                            <Text style={SharedStyles.buttonText}>Sign In</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={SharedStyles.secondaryButton} onPress={() => router.push('/signup')} disabled={loading}>
                            <Text style={SharedStyles.secondaryButtonText}>Create Account</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setIsResetting(true)} disabled={loading} style={{ marginTop: 10 }}>
                            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                        </TouchableOpacity>
                    </View>
                </>
            ) : (
                <>
                    <Text style={SharedStyles.headerText}>Reset Password</Text>
                    <Text style={SharedStyles.subText}>Enter your account email and we'll send you a password reset link.</Text>

                    <View style={SharedStyles.inputContainer}>
                        <TextInput
                            style={SharedStyles.input}
                            onChangeText={setEmail}
                            value={email}
                            placeholder="email@address.com"
                            placeholderTextColor={Colors.textSecondary}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>

                    <View style={SharedStyles.buttonContainer}>
                        <TouchableOpacity style={SharedStyles.primaryButton} onPress={handleSendResetLink} disabled={loading}>
                            <Text style={SharedStyles.buttonText}>Send Reset Link</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={SharedStyles.secondaryButton} onPress={() => setIsResetting(false)} disabled={loading}>
                            <Text style={SharedStyles.secondaryButtonText}>Back to Login</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}

            {loading && <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />}
        </View>
    );
}

/** Map Firebase auth error codes to user-friendly messages */
function getFirebaseAuthErrorMessage(code: string): string {
    switch (code) {
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
            return 'Invalid email or password.';
        case 'auth/wrong-password':
            return 'Incorrect password.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please try again later.';
        case 'auth/user-disabled':
            return 'This account has been disabled.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        default:
            return 'An unexpected error occurred. Please try again.';
    }
}

const styles = StyleSheet.create({
    forgotPasswordText: { color: Colors.textSecondary, textAlign: 'center', fontSize: 14, textDecorationLine: 'underline' },
});