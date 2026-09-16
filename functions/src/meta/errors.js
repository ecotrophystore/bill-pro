// Maps Meta Graph API error codes to safe, user-facing messages
// Never exposes raw tokens, secrets, or internal API details
export function safeMetaError(error) {
    const code = String(error.code);
    const subcode = error.error_subcode;
    // Token errors
    if (error.code === 190) {
        if (subcode === 460 || subcode === 463) {
            return { code, message: 'Access token has expired. Please generate a new System User Token.' };
        }
        if (subcode === 467) {
            return { code, message: 'Access token is invalid. Please check the token in Firebase Secrets.' };
        }
        return { code, message: 'Invalid or expired access token. Please reconfigure META_FACEBOOK_SYSTEM_USER_TOKEN.' };
    }
    // Permission errors
    if (error.code === 200 || error.code === 10) {
        return { code, message: 'Permission missing. Ensure the required permissions are granted and App Review is approved.' };
    }
    // No Page access
    if (error.code === 100 && subcode === 33) {
        return { code, message: 'Facebook Page not found or not accessible with this token.' };
    }
    // Rate limit
    if (error.code === 4 || error.code === 17 || error.code === 32) {
        return { code, message: 'Meta API rate limit reached. Please wait a few minutes before retrying.' };
    }
    // Temporary server error
    if (error.code === 2) {
        return { code, message: 'Meta is experiencing a temporary issue. Please try again shortly.' };
    }
    // App not subscribed
    if (error.code === 100 && subcode === 2388126) {
        return { code, message: 'App is not subscribed to this webhook field. Please subscribe first.' };
    }
    // Generic fallback — never expose raw message if it might contain tokens
    return {
        code,
        message: `Meta API error (code ${code}). Check the integration status and try again.`
    };
}
// Extracts a safe error from any thrown value
export function extractSafeError(err) {
    if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
        const e = err;
        return safeMetaError(e);
    }
    if (err instanceof Error) {
        // Sanitize: remove anything that looks like a token (long alphanumeric strings)
        const sanitized = err.message.replace(/\b[A-Za-z0-9]{40,}\b/g, '[REDACTED]');
        return { code: 'UNKNOWN', message: sanitized };
    }
    return { code: 'UNKNOWN', message: 'An unexpected error occurred.' };
}
//# sourceMappingURL=errors.js.map