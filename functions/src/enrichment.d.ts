export declare const onLeadCreatedEnrich: import("firebase-functions").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    leadId: string;
}>>;
export declare const enrichCompanyManual: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    status: string;
    data: any;
}>, unknown>;
//# sourceMappingURL=enrichment.d.ts.map