import type { MetaGraphError } from './types.js';
export declare function safeMetaError(error: MetaGraphError): {
    code: string;
    message: string;
};
export declare function extractSafeError(err: unknown): {
    code: string;
    message: string;
};
//# sourceMappingURL=errors.d.ts.map