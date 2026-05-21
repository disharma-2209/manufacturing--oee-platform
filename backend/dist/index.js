"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDb = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const init_1 = require("./db/init");
Object.defineProperty(exports, "initDb", { enumerable: true, get: function () { return init_1.initDb; } });
const logger_1 = require("./utils/logger");
const auth_1 = __importDefault(require("./routes/auth"));
const upload_1 = __importDefault(require("./routes/upload"));
const analyze_1 = __importDefault(require("./routes/analyze"));
const ai_1 = __importDefault(require("./routes/ai"));
const actions_1 = __importDefault(require("./routes/actions"));
const settings_1 = __importDefault(require("./routes/settings"));
const line_upload_1 = __importDefault(require("./routes/line-upload"));
const users_1 = __importDefault(require("./routes/users"));
const usage_1 = __importDefault(require("./routes/usage"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const app = (0, express_1.default)();
exports.app = app;
const PORT = parseInt(process.env.PORT || '3001', 10);
app.set('trust proxy', 1);
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", 'https://api.anthropic.com', '*'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));
const allowedOrigins = [
    process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5178',
    'http://localhost:3000',
    // Additional origins from env (comma-separated)
    ...(process.env.EXTRA_CORS_ORIGINS ? process.env.EXTRA_CORS_ORIGINS.split(',').map(s => s.trim()) : []),
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (process.env.NODE_ENV === 'development')
            return callback(null, true);
        if (allowedOrigins.includes(origin))
            return callback(null, true);
        const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (isLocal)
            return callback(null, true);
        // Allow Vercel preview URLs
        if (origin && /\.vercel\.app$/.test(origin))
            return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
const globalLimiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX || '200'),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});
const aiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'AI rate limit exceeded. Please wait before making more AI requests.' },
});
app.use(globalLimiter);
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/auth', auth_1.default);
app.use('/api/upload', upload_1.default);
app.use('/api/analyze', analyze_1.default);
app.use('/api/ai', aiLimiter, ai_1.default);
app.use('/api/actions', actions_1.default);
app.use('/api/settings', settings_1.default);
app.use('/api/line-upload', line_upload_1.default);
app.use('/api/users', users_1.default);
app.use('/api/usage', usage_1.default);
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ── Serve frontend static build (for production / Railway deployment) ────
const frontendDist = process.env.FRONTEND_DIST || path_1.default.resolve(__dirname, '../../frontend/dist');
if (fs_1.default.existsSync(frontendDist)) {
    app.use(express_1.default.static(frontendDist));
    // SPA fallback: any non-API route serves index.html
    app.get('*', (_req, res) => {
        if (!_req.path.startsWith('/api')) {
            res.sendFile(path_1.default.join(frontendDist, 'index.html'));
        }
    });
    logger_1.logger.info(`Serving frontend from ${frontendDist}`);
}
app.use((err, _req, res, _next) => {
    logger_1.logger.error('Unhandled error', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
});
// Only start the server when running directly (not imported by Vercel)
if (!process.env.VERCEL) {
    (async () => {
        try {
            await (0, init_1.initDb)();
            app.listen(PORT, () => {
                logger_1.logger.info(`Server running on port ${PORT}`);
                logger_1.logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            });
        }
        catch (err) {
            logger_1.logger.error('Failed to start server', { err });
            process.exit(1);
        }
    })();
}
//# sourceMappingURL=index.js.map