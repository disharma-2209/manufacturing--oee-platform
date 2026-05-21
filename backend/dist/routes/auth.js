"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const init_1 = require("../db/init");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../services/audit");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const registerLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { error: 'Too many registration requests. Please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const loginSchema = zod_1.z.object({
    username: zod_1.z.string().min(1).max(100),
    password: zod_1.z.string().min(1).max(200),
});
const setupSchema = zod_1.z.object({
    username: zod_1.z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
    password: zod_1.z.string().min(8).max(200),
});
const registerSchema = zod_1.z.object({
    username: zod_1.z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
    email: zod_1.z.string().email(),
    full_name: zod_1.z.string().min(2).max(100),
    requested_role: zod_1.z.enum(['analyst', 'viewer']),
    reason: zod_1.z.string().max(500).optional(),
});
function generateToken(userId, username, role) {
    const secret = process.env.JWT_SECRET || 'fallback-secret-change-in-prod';
    const expiry = process.env.JWT_EXPIRY || '8h';
    return jsonwebtoken_1.default.sign({ userId, username, role }, secret, { expiresIn: expiry });
}
router.get('/status', (_req, res) => {
    res.json({ firstRun: (0, init_1.isFirstRun)() });
});
router.post('/setup', async (req, res) => {
    if (!(0, init_1.isFirstRun)()) {
        res.status(400).json({ error: 'Admin account already exists' });
        return;
    }
    const result = setupSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        return;
    }
    try {
        const { username, password } = result.data;
        await (0, init_1.createAdminUser)(username, password);
        const db = (0, init_1.getDb)();
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        const token = generateToken(user.id, user.username, user.role);
        (0, audit_1.logAudit)(user.id, user.username, 'SETUP', 'users', 'Admin account created', req.ip);
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    }
    catch (error) {
        logger_1.logger.error('Setup error', { error });
        res.status(500).json({ error: 'Setup failed' });
    }
});
router.post('/login', loginLimiter, async (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: 'Invalid credentials' });
        return;
    }
    const { username, password } = result.data;
    try {
        const db = (0, init_1.getDb)();
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
        if (!user) {
            res.status(401).json({ error: 'Invalid username or password' });
            return;
        }
        const match = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!match) {
            (0, audit_1.logAudit)(null, username, 'LOGIN_FAILED', 'auth', 'Invalid password', req.ip);
            res.status(401).json({ error: 'Invalid username or password' });
            return;
        }
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
        const token = generateToken(user.id, user.username, user.role);
        (0, audit_1.logAudit)(user.id, user.username, 'LOGIN', 'auth', 'Successful login', req.ip);
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    }
    catch (error) {
        logger_1.logger.error('Login error', { error });
        res.status(500).json({ error: 'Login failed' });
    }
});
router.post('/register', registerLimiter, async (req, res) => {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: 'Invalid input', details: result.error.issues });
        return;
    }
    const { username, email, full_name, requested_role, reason } = result.data;
    try {
        const db = (0, init_1.getDb)();
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existingUser) {
            res.status(409).json({ error: 'Username already exists' });
            return;
        }
        const existingRequest = db.prepare("SELECT id FROM user_requests WHERE username = ? AND status = 'pending'").get(username);
        if (existingRequest) {
            res.status(409).json({ error: 'A pending request for this username already exists' });
            return;
        }
        db.prepare('INSERT INTO user_requests (username, email, full_name, requested_role, reason) VALUES (?, ?, ?, ?, ?)').run(username, email, full_name, requested_role, reason ?? null);
        res.status(201).json({ message: 'Request submitted. An admin will review your access.' });
    }
    catch (error) {
        logger_1.logger.error('Register error', { error });
        res.status(500).json({ error: 'Registration failed' });
    }
});
router.post('/logout', auth_1.authMiddleware, (req, res) => {
    (0, audit_1.logAudit)(req.user.userId, req.user.username, 'LOGOUT', 'auth', 'User logged out', req.ip);
    res.json({ message: 'Logged out successfully' });
});
router.get('/me', auth_1.authMiddleware, (req, res) => {
    const db = (0, init_1.getDb)();
    db.prepare('UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE id = ?').run(req.user.userId);
    const user = db.prepare('SELECT id, username, email, full_name, role, is_active, created_at, last_login, last_activity FROM users WHERE id = ?').get(req.user.userId);
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    res.json(user);
});
exports.default = router;
//# sourceMappingURL=auth.js.map