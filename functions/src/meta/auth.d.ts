export declare const fbToken: import("firebase-functions/params").SecretParam;
export declare const waToken: import("firebase-functions/params").SecretParam;
export declare function resolveFacebookAuthorization(): Promise<string>;
export declare function resolveWhatsAppAuthorization(): Promise<string>;
export declare function requireAdmin(uid: string): Promise<void>;
export declare function getConfig(): Promise<any>;
//# sourceMappingURL=auth.d.ts.map