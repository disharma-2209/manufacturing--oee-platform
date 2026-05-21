import { RawIncident } from '../types';
export interface ParsedExcelData {
    incidents: Omit<RawIncident, 'id' | 'upload_id' | 'is_repeat_failure' | 'is_cascade'>[];
    metadata: {
        recordCount: number;
        linesDetected: string[];
        dateRangeStart: string | null;
        dateRangeEnd: string | null;
        weekNumber: number;
        year: number;
        sheets: string[];
    };
}
export declare function deriveRootCauseCategory(causeCategory: string, cause: string, remarks: string, repairDescription: string): {
    category: string;
    cause: string;
};
export declare function parseExcelFile(filePath: string): ParsedExcelData;
export declare function generateMockData(): ParsedExcelData;
//# sourceMappingURL=excel-parser.d.ts.map