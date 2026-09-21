import { useRouter } from 'expo-router';
import { signOut, updateProfile } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors, SharedStyles } from '../constants/styles';
import { auth } from '../firebase';

export default function Profile() {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const router = useRouter();

    useEffect(() => {
        loadProfile();
    }, []);

    function loadProfile() {
        const user = auth.currentUser;
        if (user) {
            setName(user.displayName || '');
        }
        setLoading(false);
    }

    async function handleSaveName() {
        const user = auth.currentUser;
        if (!user) return;

        setSaving(true);
        try {
            await updateProfile(user, { displayName: name.trim() });
            Alert.alert('Success', 'Profile updated!');
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
        setSaving(false);
    }

    async function handleSignOut() {
        try {
            await signOut(auth);
        } catch (error: any) {
            Alert.alert('Error', 'Could not sign out. Please try again.');
        }
    }

    if (loading) {
        return <View style={SharedStyles.centeredContainer}><ActivityIndicator size="large" color={Colors.primary} /></View>;
    }

    return (
        <View style={styles.container}>
            <View style={styles.infoSection}>
                <View style={[styles.avatarCircle]}>
                    <Text style={styles.avatarInitial}>
                        {name ? name.charAt(0).toUpperCase() : '?'}
                    </Text>
                </View>
                <Text style={styles.emailText}>{auth.currentUser?.email || ''}</Text>
            </View>

            <View style={styles.inputSection}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                    style={SharedStyles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your Name"
                    placeholderTextColor={Colors.textSecondary}
                />

                <TouchableOpacity style={SharedStyles.primaryButton} onPress={handleSaveName} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={SharedStyles.buttonText}>Save Changes</Text>}
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
                <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background, padding: 20 },
    infoSection: { alignItems: 'center', marginTop: 40, marginBottom: 40 },
    avatarCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: Colors.border,
    },
    avatarInitial: { color: '#fff', fontSize: 48, fontWeight: 'bold' },
    emailText: { color: Colors.textSecondary, fontSize: 14, marginTop: 12 },
    inputSection: { gap: 10 },
    label: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginLeft: 4 },
    logoutButton: { marginTop: 'auto', marginBottom: 20, padding: 16, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary },
    logoutText: { color: Colors.primary, fontWeight: 'bold', fontSize: 16 },
});