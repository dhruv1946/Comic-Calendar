/**
 * Input validation utilities for authentication forms.
 * Validates email format and password strength before sending to Firebase.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export interface ValidationResult {
    valid: boolean;
    message: string;
}

export function validateEmail(email: string): ValidationResult {
    const trimmed = email.trim();
    if (!trimmed) {
        return { valid: false, message: 'Please enter your email address.' };
    }
    if (!EMAIL_REGEX.test(trimmed)) {
        return { valid: false, message: 'Please enter a valid email address.' };
    }
    return { valid: true, message: '' };
}

export function validatePassword(password: string): ValidationResult {
    if (!password) {
        return { valid: false, message: 'Please enter a password.' };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return {
            valid: false,
            message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        };
    }
    return { valid: true, message: '' };
}

export function validateName(name: string): ValidationResult {
    const trimmed = name.trim();
    if (!trimmed) {
        return { valid: false, message: 'Please enter your name.' };
    }
    if (trimmed.length < 2) {
        return { valid: false, message: 'Name must be at least 2 characters.' };
    }
    return { valid: true, message: '' };
}
