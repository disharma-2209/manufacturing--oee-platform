import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET || 'fallback-secret-change-in-prod';
    const payload = jwt.verify(token, secret) as JWTPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    try {
      const secret = process.env.JWT_SECRET || 'fallback-secret-change-in-prod';
      const payload = jwt.verify(token, secret) as JWTPayload;
      req.user = payload;
    } catch {
      // ignore invalid token for optional auth
    }
  }
  next();
}
