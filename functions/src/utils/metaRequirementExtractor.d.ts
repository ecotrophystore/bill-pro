export interface ExtractedRequirement {
    customer_name?: string;
    required_quantity?: number;
    event_name?: string;
    event_type?: string;
    event_date?: string;
    delivery_date?: string;
    trophy_type?: string;
    trophy_size?: string;
    budget?: string;
    value?: number;
    organization?: string;
    location?: string;
    email?: string;
    phone?: string;
    customer_type?: string;
    urgency?: 'low' | 'medium' | 'high';
    notes?: string;
    confidence: number;
}
/**
 * Extracts structured customer requirement attributes from raw text / Meta enquiry messages.
 * Handles both key-value / Story Builder formats (with bullet points or markers) and natural language text.
 * Leaves fields empty when information is not present (avoids guessing).
 */
export declare function extractMetaRequirements(text: string): ExtractedRequirement;
//# sourceMappingURL=metaRequirementExtractor.d.ts.map