import type { InstagramAccount } from './types.js';
export declare const fetchConnectedInstagramAccount: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    connected: boolean;
    connectedFacebookPageId: any;
    message: string;
    instagramAccount?: never;
} | {
    connected: boolean;
    instagramAccount: InstagramAccount;
    connectedFacebookPageId: any;
    message?: never;
}>, unknown>;
export declare const testInstagramConnection: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    username: any;
    name: any;
    testedAt: string;
}>, unknown>;
export declare const subscribeInstagramMessages: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const unsubscribeInstagramMessages: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
//# sourceMappingURL=instagram.d.ts.map