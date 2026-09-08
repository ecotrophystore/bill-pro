import type { FacebookPage, FacebookLeadForm } from './types.js';
export declare const fetchAvailableFacebookPages: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    pages: FacebookPage[];
}>, unknown>;
export declare const testFacebookConnection: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    pageId: any;
    pageName: any;
    category: any;
    connectedInstagramAccountId: any;
    testedAt: string;
}>, unknown>;
export declare const fetchFacebookLeadForms: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    forms: FacebookLeadForm[];
}>, unknown>;
export declare const saveFacebookConfig: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const saveInstagramConfig: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const subscribeFacebookLeadAds: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const unsubscribeFacebookLeadAds: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const subscribeFacebookPageMessages: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const unsubscribeFacebookPageMessages: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const disconnectFacebookIntegration: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
//# sourceMappingURL=facebook.d.ts.map