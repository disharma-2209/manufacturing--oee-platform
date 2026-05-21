import { Request, Response, NextFunction } from 'express';
export declare function requireRole(...roles: string[]): (req: Request, res: Response, next: NextFunction) => void;
export declare function requireAdmin(req: Request, res: Response, next: NextFunction): void;
export declare function requireAnalystOrAbove(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=rbac.d.ts.map