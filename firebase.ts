/**
 * Firebase client — initializes the Firebase app, Auth, and Firestore.
 * Credentials are loaded from constants/config.ts (gitignored).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-expect-error — getReactNativePersistence exists at runtime via Metro's
// react-native conditional export, but TypeScript resolves the default types
// which don't include it. This is a known Firebase v12 typing gap.
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import { Config } from './constants/config';

const firebaseConfig = {
    apiKey: Config.FIREBASE_API_KEY,
    authDomain: Config.FIREBASE_AUTH_DOMAIN,
    projectId: Config.FIREBASE_PROJECT_ID,
    storageBucket: Config.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: Config.FIREBASE_MESSAGING_SENDER_ID,
    appId: Config.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// On native, persist sessions via AsyncStorage.
// On web, getAuth() uses browser localStorage automatically.
export const auth = Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
    });

export const db = getFirestore(app);
