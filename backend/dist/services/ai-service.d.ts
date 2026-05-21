import { AnalysisContext } from '../types';
import { Response } from 'express';
export type AnalysisType = 'weekly_summary' | 'root_cause' | 'action_plan' | 'predictive_risk' | 'benchmark_gap' | 'maintenance_strategy' | 'team_performance' | 'correlation_explanation';
export declare function streamAIAnalysis(analysisType: AnalysisType, context: AnalysisContext, res: Response, extra?: Record<string, unknown>): Promise<string>;
export declare function runAIAnalysis(analysisType: AnalysisType, context: AnalysisContext, extra?: Record<string, unknown>): Promise<string>;
//# sourceMappingURL=ai-service.d.ts.map