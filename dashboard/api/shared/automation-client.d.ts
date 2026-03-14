export interface AutomationJob {
    id: string;
    jobId: string;
    runbookName: string;
    status: string;
    statusDetails: string;
    startTime: string | null;
    endTime: string | null;
    creationTime: string;
    lastModifiedTime: string;
    parameters: Record<string, string>;
}
export interface AutomationVariable {
    name: string;
    value: string;
    isEncrypted: boolean;
    description: string;
}
export declare function triggerRunbook(runbookName: string, params: Record<string, string>): Promise<string>;
export declare function getJob(jobId: string): Promise<AutomationJob>;
export declare function listJobs(filter?: string): Promise<AutomationJob[]>;
export declare function getVariable(variableName: string): Promise<AutomationVariable | null>;
export declare function setVariable(variableName: string, value: string, description?: string): Promise<void>;
//# sourceMappingURL=automation-client.d.ts.map