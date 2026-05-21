export interface StationConfig {
    name: string;
    timeCol: number;
    resultCol: number;
}
export declare const STATION_CONFIGS: StationConfig[];
export interface StationOEE {
    station: string;
    totalBoards: number;
    producedQty: number;
    passBoards: number;
    failBoards: number;
    testedBoards: number;
    firstTimestamp: string | null;
    lastTimestamp: string | null;
    spanHours: number;
    actualRunHours: number;
    plannedHours: number;
    availableHours: number;
    stoppageCount: number;
    stoppageHours: number;
    microStopCount: number;
    microStopHours: number;
    tackTimeSec: number;
    availability: number;
    performance: number;
    quality: number;
    oee: number;
    mttr: number;
    mtbf: number;
    idealCycleTimeSec: number;
    detectedCycleTimeSec: number;
    actualCycleTimeSec: number;
    timeCol: number;
    elVariant: string;
}
export interface LineOEEResult {
    line: string;
    weekNumber: number;
    year: number;
    filename: string;
    stations: StationOEE[];
    availability: number;
    performance: number;
    quality: number;
    oee: number;
    totalBoardsProduced: number;
    plannedHours: number;
    firstTimestamp: string | null;
    lastTimestamp: string | null;
}
export declare function parseLineOEEFile(filePath: string, originalFilename: string, overrideLine?: string, overrideWeek?: number, overrideYear?: number, manualQcRates?: Record<string, number>): LineOEEResult;
//# sourceMappingURL=line-oee-parser.d.ts.map