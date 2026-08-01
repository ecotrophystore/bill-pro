/**
 * Get Meta Secrets Status safely
 */
export declare const getMetaSecretStatus: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    config: {
        metaAppId: any;
        metaBusinessPortfolioId: any;
        graphApiVersion: any;
        environment: any;
        whatsappPhoneNumberId: any;
        whatsappBusinessAccountId: any;
        whatsappDisplayPhoneNumber: any;
        whatsappDisplayName: any;
        defaultTemplateLanguage: any;
        facebookPageId: any;
        facebookPageName: any;
        facebookPageCategory: any;
        facebookLeadFormId: any;
        defaultPipelineId: any;
        defaultStageId: any;
        defaultLeadOwnerId: any;
        instagramAccountId: any;
        instagramUsername: any;
        instagramName: any;
        instagramConnectedPageId: any;
    };
    status: {
        connectionStatus: any;
        appSecretConfigured: boolean;
        webhookVerifyTokenConfigured: boolean;
        whatsappTokenConfigured: boolean;
        facebookTokenConfigured: boolean;
        whatsappWebhookVerified: any;
        whatsappWebhookSubscribed: any;
        lastConnectionTestAt: any;
        lastWebhookReceivedAt: any;
        lastSuccessfulMessageAt: any;
        lastErrorCode: any;
        lastErrorMessage: any;
        facebookConnectionStatus: any;
        facebookLeadAdsSubscribed: any;
        facebookMessagesSubscribed: any;
        lastFacebookTestAt: any;
        lastFacebookLeadAt: any;
        lastFacebookMessageAt: any;
        facebookLastErrorCode: any;
        facebookLastErrorMessage: any;
        instagramConnectionStatus: any;
        instagramMessagesSubscribed: any;
        lastInstagramTestAt: any;
        lastInstagramMessageAt: any;
        instagramLastErrorCode: any;
        instagramLastErrorMessage: any;
    };
}>, unknown>;
/**
 * Save non-sensitive Meta integration config
 */
export declare const saveMetaIntegrationConfig: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
/**
 * Test WhatsApp Connection
 */
export declare const testWhatsAppConnection: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    displayPhoneNumber: any;
    verifiedName: any;
    qualityRating: any;
    accountStatus: any;
    lastTestedAt: string;
}>, unknown>;
export declare const subscribeWhatsAppWebhook: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const unsubscribeWhatsAppWebhook: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
}>, unknown>;
export declare const sendWhatsAppTestMessage: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    messageId: any;
}>, unknown>;
/**
 * Webhook Handler (GET & POST)
 */
export declare const metaWebhook: import("firebase-functions/v2/https").HttpsFunction;
//# sourceMappingURL=metaIntegration.d.ts.map