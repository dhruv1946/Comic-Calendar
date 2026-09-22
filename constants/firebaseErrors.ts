/**
 * Shared Firebase Auth error code → user-friendly message mapper.
 * Used by both login and signup screens.
 */

const ERROR_MESSAGES: Record<string, string> = {
    // Sign-in errors
    'auth/user-not-found': 'Invalid email or password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/user-disabled': 'This account has been disabled.',

    // Sign-up errors
    'auth/email-already-in-use': 'An account with this email already exists.',

    // Shared
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password is too weak. Use at least 8 characters.',
};

const DEFAULT_MESSAGE = 'An unexpected error occurred. Please try again.';

export function getFirebaseErrorMessage(code: string): string {
    return ERROR_MESSAGES[code] || DEFAULT_MESSAGE;
}
