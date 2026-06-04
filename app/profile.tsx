import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase';

export default function Profile() {
    const [name, setName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const router = useRouter();

    useEffect(() => {
        loadProfile();
    }, []);

    async function loadProfile() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setName(user.user_metadata?.full_name || '');
            setAvatarUrl(user.user_metadata?.avatar_url || null);
        }
        setLoading(false);
    }

    async function handlePickImage() {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            uploadImage(result.assets[0].uri);
        }
    }

    async function uploadImage(uri: string) {
        try {
            setSaving(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');

            const response = await fetch(uri);
            const blob = await response.blob();

            const fileName = `${user.id}-${Date.now()}.jpg`;
            const { error: uploadError, data } = await supabase.storage
                .from('avatars')
                .upload(fileName, blob, { contentType: 'image/jpeg' });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);

            setAvatarUrl(publicUrl);
            await supabase.auth.updateUser({
                data: { avatar_url: publicUrl }
            });

        } catch (error: any) {
            Alert.alert('Upload Error', error.message);
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveName() {
        setSaving(true);
        const { error } = await supabase.auth.updateUser({
            data: { full_name: name }
        });

        if (error) Alert.alert('Error', error.message);
        else Alert.alert('Success', 'Profile updated!');
        setSaving(false);
    }

    async function handleSignOut() {
        await supabase.auth.signOut();
    }

    if (loading) {
        return <View style={styles.center}><ActivityIndicator size="large" color="#ff4757" /></View>;
    }

    return (
        <View style={styles.container}>
            <View style={styles.avatarSection}>
                <TouchableOpacity onPress={handlePickImage} disabled={saving}>
                    {avatarUrl ? (
                        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                            <Text style={styles.avatarText}>+</Text>
                        </View>
                    )}
                </TouchableOpacity>
                <Text style={styles.subText}>Tap to change picture</Text>
            </View>

            <View style={styles.inputSection}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your Name"
                    placeholderTextColor="#888"
                />

                <TouchableOpacity style={styles.primaryButton} onPress={handleSaveName} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Changes</Text>}
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
                <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212', padding: 20 },
    center: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
    avatarSection: { alignItems: 'center', marginTop: 40, marginBottom: 40 },
    avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1e1e1e', borderWidth: 2, borderColor: '#333' },
    avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#888', fontSize: 40 },
    subText: { color: '#888', fontSize: 12, marginTop: 10 },
    inputSection: { gap: 10 },
    label: { color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 4 },
    input: { backgroundColor: '#1e1e1e', color: '#fff', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
    primaryButton: { backgroundColor: '#ff4757', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    logoutButton: { marginTop: 'auto', marginBottom: 20, padding: 16, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ff4757' },
    logoutText: { color: '#ff4757', fontWeight: 'bold', fontSize: 16 },
});