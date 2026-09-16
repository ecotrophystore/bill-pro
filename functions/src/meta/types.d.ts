export type MetaConnectionStatus = 'not_configured' | 'configured' | 'fetching' | 'testing' | 'connected' | 'disconnected' | 'invalid_token' | 'token_expired' | 'permission_missing' | 'no_page_access' | 'no_instagram_account' | 'webhook_not_subscribed' | 'error';
export interface FacebookPage {
    id: string;
    name: string;
    category?: string;
    pictureUrl?: string;
    tasks?: string[];
    connectedInstagramAccountId?: string;
}
export interface FacebookLeadForm {
    id: string;
    name: string;
    status?: string;
    createdTime?: string;
}
export interface InstagramAccount {
    id: string;
    username?: string;
    name?: string;
    profilePictureUrl?: string;
}
export interface MetaGraphError {
    code: number;
    message: string;
    type?: string;
    error_subcode?: number;
    fbtrace_id?: string;
}
export interface FacebookConfig {
    facebookPageId?: string;
    facebookPageName?: string;
    facebookPageCategory?: string;
    facebookLeadFormId?: string;
    defaultPipelineId?: string;
    defaultStageId?: string;
    defaultLeadOwnerId?: string;
    facebookConnectionStatus?: MetaConnectionStatus;
    facebookLeadAdsSubscribed?: boolean;
    facebookMessagesSubscribed?: boolean;
    lastFacebookTestAt?: string;
    lastFacebookLeadAt?: string;
    lastFacebookMessageAt?: string;
    facebookLastErrorCode?: string;
    facebookLastErrorMessage?: string;
}
export interface InstagramConfig {
    instagramAccountId?: string;
    instagramUsername?: string;
    instagramName?: string;
    instagramProfilePictureUrl?: string;
    instagramConnectedPageId?: string;
    instagramConnectionStatus?: MetaConnectionStatus;
    instagramMessagesSubscribed?: boolean;
    lastInstagramTestAt?: string;
    lastInstagramMessageAt?: string;
    instagramLastErrorCode?: string;
    instagramLastErrorMessage?: string;
}
//# sourceMappingURL=types.d.ts.map