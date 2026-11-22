export interface ServerLeadAssignmentContext {
    source?: string;
    platform?: string;
    pipelineId?: string;
    requiredQuantity?: string | number;
    value?: number;
    location?: string;
    name?: string;
    company?: string;
    requirement?: string;
    campaign?: string;
}
export interface ServerLeadAssignmentResult {
    assigned: boolean;
    ownerId: string;
    ownerName: string;
    ruleName?: string;
}
export declare function resolveServerLeadAssignment(ctx: ServerLeadAssignmentContext): Promise<ServerLeadAssignmentResult>;
//# sourceMappingURL=leadAssignment.d.ts.map