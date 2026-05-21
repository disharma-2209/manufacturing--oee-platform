import { Request, Response, NextFunction } from 'express';
export declare function trackUsage(eventType: string, getDetail?: (req: Request) => object): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=usageTracker.d.ts.map