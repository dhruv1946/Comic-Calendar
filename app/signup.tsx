import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [otp, setOtp] = useState('');

    const [loading, setLoading] = useState(false);
    const [pendingVerification, setPendingVerification] = useState(false);

    const router = useRouter();

    async function handleSignUp() {
        if (!name || !email || !password) {
            Alert.alert('Missing Fields', 'Please fill out all fields.');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: name,
                }
            }
        });

        if (error) {
            Alert.alert('Sign Up Error', error.message);
        } else {
            setPendingVerification(true);
        }
        setLoading(false);
    }

    async function handleVerifyOTP() {
        if (!otp) return;

        setLoading(true);
        const { error, data } = await supabase.auth.verifyOtp({
            email,
            token: otp,
            type: 'signup',
        });

        if (error) {
            Alert.alert('Verification Error', error.message);
        } else if (data.session) {
            router.replace('/');
        }
        setLoading(false);
    }

    return (
        <View style={styles.container}>
            {!pendingVerification ? (
                <>
                    <Text style={styles.headerText}>Create an Account</Text>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            onChangeText={setName}
                            value={name}
                            placeholder="Full Name"
                            placeholderTextColor="#888"
                        />
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
                        <TouchableOpacity style={styles.primaryButton} onPress={handleSignUp} disabled={loading}>
                            <Text style={styles.buttonText}>Sign Up</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()} disabled={loading}>
                            <Text style={styles.secondaryButtonText}>Back to Login</Text>
                        </TouchableOpacity>
                    </View>
                </>
            ) : (
                <>
                    <Text style={styles.headerText}>Check your Email</Text>
                    <Text style={styles.subText}>We sent a 6-digit verification code to {email}.</Text>

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
                    </View>

                    <View style={styles.buttonContainer}>
                        <TouchableOpacity style={styles.primaryButton} onPress={handleVerifyOTP} disabled={loading}>
                            <Text style={styles.buttonText}>Verify & Login</Text>
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
    },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    secondaryButtonText: { color: '#888', fontWeight: 'bold', fontSize: 14 },
});