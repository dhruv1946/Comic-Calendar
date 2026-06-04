import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const [isResetting, setIsResetting] = useState(false);
    const [resetStep, setResetStep] = useState<1 | 2>(1);
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');

    const router = useRouter();

    async function signInWithEmail() {
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) Alert.alert('Sign In Error', error.message);
        else router.replace('/');
        setLoading(false);
    }

    async function handleSendResetCode() {
        if (!email) {
            Alert.alert('Missing Email', 'Please enter your email address first.');
            return;
        }
        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email);

        if (error) {
            Alert.alert('Error', error.message);
        } else {
            setResetStep(2);
            Alert.alert('Code Sent', 'Check your email for the 6-digit reset code.');
        }
        setLoading(false);
    }

    async function handleUpdatePassword() {
        if (!otp || !newPassword) {
            Alert.alert('Missing Fields', 'Please enter the reset code and your new password.');
            return;
        }

        setLoading(true);

        const { error: verifyError } = await supabase.auth.verifyOtp({
            email,
            token: otp,
            type: 'recovery',
        });

        if (verifyError) {
            Alert.alert('Verification Error', verifyError.message);
            setLoading(false);
            return;
        }

        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (updateError) {
            Alert.alert('Update Error', updateError.message);
        } else {
            Alert.alert('Success', 'Your password has been reset!');
            setIsResetting(false);
            setResetStep(1);
            setPassword('');
        }
        setLoading(false);
    }

    return (
        <View style={styles.container}>
            {!isResetting ? (
                <>
                    <Text style={styles.headerText}>Welcome to your Pull List</Text>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            onChangeText={setEmail}
                            value={email}
                            placeholder="email@address.com"
                            placeholderTextColor="#888"
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                        <TextInput
                            style={styles.input}
                            onChangeText={setPassword}
                            value={password}
                            secureTextEntry={true}
                            placeholder="Password"
                            placeholderTextColor="#888"
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity style={styles.primaryButton} onPress={signInWithEmail} disabled={loading}>
                            <Text style={styles.buttonText}>Sign In</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/signup')} disabled={loading}>
                            <Text style={styles.secondaryButtonText}>Create Account</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setIsResetting(true)} disabled={loading} style={{ marginTop: 10 }}>
                            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                        </TouchableOpacity>
                    </View>
                </>
            ) : resetStep === 1 ? (
                <>
                    <Text style={styles.headerText}>Reset Password</Text>
                    <Text style={styles.subText}>Enter your account email and we'll send you a 6-digit recovery code.</Text>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            onChangeText={setEmail}
                            value={email}
                            placeholder="email@address.com"
                            placeholderTextColor="#888"
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity style={styles.primaryButton} onPress={handleSendResetCode} disabled={loading}>
                            <Text style={styles.buttonText}>Send Code</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsResetting(false)} disabled={loading}>
                            <Text style={styles.secondaryButtonText}>Back to Login</Text>
                        </TouchableOpacity>
                    </View>
                </>
            ) : (
                <>
                    <Text style={styles.headerText}>Enter Reset Code</Text>
                    <Text style={styles.subText}>Enter the 6-digit code sent to {email} and choose a new password.</Text>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={[styles.input, { textAlign: 'center', fontSize: 24, letterSpacing: 5 }]}
                            onChangeText={setOtp}
                            value={otp}
                            placeholder="000000"
                            placeholderTextColor="#888"
                            keyboardType="number-pad"
                            maxLength={6}
                        />
                        <TextInput
                            style={styles.input}
                            onChangeText={setNewPassword}
                            value={newPassword}
                            secureTextEntry={true}
                            placeholder="New Password"
                            placeholderTextColor="#888"
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity style={styles.primaryButton} onPress={handleUpdatePassword} disabled={loading}>
                            <Text style={styles.buttonText}>Update Password</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.secondaryButton} onPress={() => { setIsResetting(false); setResetStep(1); }} disabled={loading}>
                            <Text style={styles.secondaryButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}

            {loading && <ActivityIndicator size="large" color="#ff4757" style={{ marginTop: 20 }} />}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#121212', justifyContent: 'center' },
    headerText: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
    subText: { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 30, paddingHorizontal: 20 },
    inputContainer: { gap: 15, marginBottom: 30 },
    input: {
        backgroundColor: '#1e1e1e',
        color: '#fff',
        paddingHorizontal: 15,
        paddingVertical: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#333',
    },
    buttonContainer: { gap: 15 },
    primaryButton: {
        backgroundColor: '#ff4757',
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
        borderColor: '#ff4757',
    },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    secondaryButtonText: { color: '#ff4757', fontWeight: 'bold', fontSize: 16 },
    forgotPasswordText: { color: '#888', textAlign: 'center', fontSize: 14, textDecorationLine: 'underline' },
});