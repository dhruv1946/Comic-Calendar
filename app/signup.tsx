import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, SharedStyles } from '../constants/styles';
import { validateEmail, validateName, validatePassword } from '../constants/validation';
import { auth } from '../firebase';

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [loading, setLoading] = useState(false);

    const router = useRouter();

    async function handleSignUp() {
        const nameCheck = validateName(name);
        if (!nameCheck.valid) {
            Alert.alert('Invalid Name', nameCheck.message);
            return;
        }
        const emailCheck = validateEmail(email);
        if (!emailCheck.valid) {
            Alert.alert('Invalid Email', emailCheck.message);
            return;
        }
        const passCheck = validatePassword(password);
        if (!passCheck.valid) {
            Alert.alert('Weak Password', passCheck.message);
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
            const message = getFirebaseSignUpErrorMessage(error.code);
            Alert.alert('Sign Up Error', message);
        }
        setLoading(false);
    }

    return (
        <View style={SharedStyles.authContainer}>
            <Text style={SharedStyles.headerText}>Create an Account</Text>

            <View style={SharedStyles.inputContainer}>
                <TextInput
                    style={SharedStyles.input}
                    onChangeText={setName}
                    value={name}
                    placeholder="Full Name"
                    placeholderTextColor={Colors.textSecondary}
                />
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
                    placeholder="Password (min 8 characters)"
                    placeholderTextColor={Colors.textSecondary}
                    autoCapitalize="none"
                />
            </View>

            <View style={SharedStyles.buttonContainer}>
                <TouchableOpacity style={SharedStyles.primaryButton} onPress={handleSignUp} disabled={loading}>
                    <Text style={SharedStyles.buttonText}>Sign Up</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.backButton} onPress={() => router.back()} disabled={loading}>
                    <Text style={styles.backButtonText}>Back to Login</Text>
                </TouchableOpacity>
            </View>

            {loading && <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />}
        </View>
    );
}

/** Map Firebase auth error codes to user-friendly messages */
function getFirebaseSignUpErrorMessage(code: string): string {
    switch (code) {
        case 'auth/email-already-in-use':
            return 'An account with this email already exists.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        case 'auth/weak-password':
            return 'Password is too weak. Use at least 8 characters.';
        default:
            return 'An unexpected error occurred. Please try again.';
    }
}

const styles = StyleSheet.create({
    backButton: {
        backgroundColor: 'transparent',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    backButtonText: { color: Colors.textSecondary, fontWeight: 'bold', fontSize: 14 },
});