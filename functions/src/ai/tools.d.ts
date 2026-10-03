export interface ToolContext {
    uid: string;
    role: string;
    userName: string;
}
/**
 * Executes a tool by name, enforcing role-based permissions and data validation.
 */
export declare function executeTool(toolName: string, args: any, context: ToolContext): Promise<any>;
//# sourceMappingURL=tools.d.ts.map