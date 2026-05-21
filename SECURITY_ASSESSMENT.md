# Enphase AI Ops Hub — Enterprise Security Assessment

**Classification:** Internal — Confidential  
**Date:** April 2026  
**Prepared by:** Enphase AI Ops Hub Engineering Team  
**Applications in scope:**
- **ASN Automation** — Automated Advance Ship Notice processing (Flask 3.1 / Python 3.11)
- **MatchFlow (AP 3-Way Match)** — Accounts Payable invoice matching (Next.js 14 / TypeScript)

**Assessment framework:** OWASP ASVS 4.0 · NIST SP 800-115 · CIS Controls v8

---

## Executive Summary

Both applications handle sensitive Enphase financial and procurement data and are accessible exclusively to authenticated `@enphaseenergy.com` employees over the internal network. This assessment covers eight security domains: SAST, DAST, vulnerability assessment, penetration testing, threat modeling, IAM review, policy alignment, and implementation plan review.

**Overall findings: both applications are suitable for internal production deployment after remediating the items flagged as Critical and High.**

| Domain | ASN Automation | MatchFlow (AP 3-Way) |
|--------|:--------------:|:--------------------:|
| SAST | B+ | A- |
| DAST | B | A |
| Vulnerability Assessment | A | A |
| Penetration Testing Readiness | B+ | A- |
| Threat Modeling | A- | A- |
| IAM Review | A | A |
| Policy Alignment | B+ | A |
| Implementation Plan | A- | A |
| **Overall** | **B+** | **A-** |

### Open Findings Summary

| Severity | Count (ASN) | Count (MatchFlow) | Total |
|----------|:-----------:|:-----------------:|:-----:|
| Critical | 1 | 0 | 1 |
| High | 2 | 1 | 3 |
| Medium | 4 | 4 | 8 |
| Low | 3 | 3 | 6 |
| Informational | 2 | 2 | 4 |

---

## 1. SAST — Static Application Security Testing

Static analysis of all source code for injection flaws, cryptographic misuse, insecure defaults, hardcoded secrets, and dangerous function usage.

### 1.1 ASN Automation (Flask / Python)

#### Authentication & Session Management

| Finding | Severity | File | Detail |
|---------|----------|------|--------|
| Demo credentials hardcoded | **High** | `app.py` L408-411 | `Admin@2026`, `Lead@2026`, `User@2026` seeded when `DEMO_MODE=true`. If accidentally enabled in production these become known credentials. **Fix:** Add `DEMO_MODE=false` assertion in `ProductionConfig.validate()`. |
| Password reset URL logged in demo mode | Low | `routes/auth.py` L169 | Reset URL printed to server log in demo mode. Acceptable in dev; ensure logs are not accessible to untrusted parties in staging. |
| Rate limiter uses in-memory storage | Medium | `config.py` L69-74 | Default `RATELIMIT_STORAGE_URI` is in-memory — does not share state across Gunicorn workers. Rate limits effectively per-worker, not per-IP. **Fix:** Set `RATELIMIT_STORAGE_URI=redis://localhost:6379` in production `.env`. |

#### Cryptography

| Finding | Severity | File | Detail |
|---------|----------|------|--------|
| AES-256-GCM encryption — correct | ✅ Pass | `services/encryption_service.py` | Authenticated encryption with random 16-byte IV per operation. Key loaded from env, validated against dev-fallback sentinel string. |
| bcrypt password hashing — correct | ✅ Pass | `models/user.py` L88-98 | 12 rounds bcrypt. Plaintext never persisted. |
| Random tokens use `secrets` module | ✅ Pass | `routes/auth.py` L138 | `secrets.token_urlsafe(32)` for password reset — 256+ bits entropy. |
| Encryption plaintext file deletion | Low | `services/encryption_service.py` L35-57 | Plaintext deleted in `finally` block. If encryption raises after file write begins, partial state possible. **Fix:** Write encrypted content to temp file first, then `os.replace()` atomically. |

#### Input Validation & Injection

| Finding | Severity | File | Detail |
|---------|----------|------|--------|
| ORM-only DB access | ✅ Pass | All routes | SQLAlchemy ORM used throughout — no raw SQL string interpolation. Parameterized queries prevent SQL injection. |
| Magic-byte file validation | ✅ Pass | `routes/upload.py` L27-50 | PDF, JPEG, PNG, TIFF signatures validated. Extension spoofing blocked. |
| UUID storage filenames | ✅ Pass | `routes/upload.py` L127 | Disk filenames are UUIDs — original filenames never used for path construction. Directory traversal not possible. |
| CSRF protection on all forms | ✅ Pass | `app.py` / Flask-WTF | CSRF token required on all POST/PUT/DELETE via Flask-WTF. Token rotates per-session. |
| Open redirect prevention | ✅ Pass | `routes/auth.py` L18-29 | `_is_safe_redirect()` validates same-origin; blocks `//evil.com` protocol-relative URLs. |

#### Security Headers

| Header | ASN Value | Assessment |
|--------|-----------|------------|
| `X-Frame-Options` | `SAMEORIGIN` | ⚠️ Should be `DENY` for internal app |
| `X-Content-Type-Options` | `nosniff` | ✅ |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | ✅ (only effective with HTTPS — see DAST) |
| `Content-Security-Policy` | `script-src 'self' 'nonce-{nonce}' 'strict-dynamic'` | ✅ Excellent — per-request nonce |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ |
| `Permissions-Policy` | Not set | ⚠️ Add to restrict camera, mic, geolocation |

#### Code Quality Security Indicators

| Item | Status |
|------|--------|
| No `eval()` or `exec()` with user input | ✅ Pass |
| No `subprocess` with user-controlled strings | ✅ Pass |
| No `pickle` deserialization | ✅ Pass |
| No YAML `load()` (uses `safe_load`) | ✅ Pass |
| Debug mode disabled in production | ✅ Pass (`ProductionConfig.DEBUG = False`) |
| Stack traces not exposed to users | ✅ Pass (generic error handlers) |

---

### 1.2 MatchFlow — AP 3-Way Match (Next.js / TypeScript)

#### Authentication & Session Management

| Finding | Severity | File | Detail |
|---------|----------|------|--------|
| Health endpoint was auth-gated | **High** | `middleware.ts` | `/api/health` was returning 401 — load balancer probes and ECS health checks would fail. **Remediated:** `/api/health` added to `PUBLIC_PATHS`. |
| `NEXTAUTH_SECRET` fallback | Medium | `lib/startup.ts` | Startup validation correctly catches missing `NEXTAUTH_SECRET` in production. Dev fallback rejection implemented. ✅ |
| Session duration 8 hours | ✅ Pass | `lib/auth.config.ts` L50 | `maxAge: 8 * 60 * 60` — appropriate for business hours. |
| Session cookie security | ✅ Pass | `lib/auth.config.ts` L129-137 | `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in production. |
| MFA available but not enforced | Medium | `app/api/auth/mfa/` | TOTP MFA is opt-in. Admin and Lead roles should have MFA enforced. **Fix:** Add MFA check in `middleware.ts` for `Admin` and `Lead` roles. |

#### Cryptography

| Finding | Severity | File | Detail |
|---------|----------|------|--------|
| AES-256-GCM encryption — correct | ✅ Pass | `lib/encryption.ts` | 12-byte random IV, 16-byte auth tag, base64-encoded output. |
| ENCRYPTION_KEY dev fallback detection | ✅ Pass | `lib/startup.ts` L36-39 | Checks for `dev-fallback` string in key value. Throws on production. |
| Sensitive SystemConfig values encrypted | ✅ Pass | `prisma/schema.prisma` L57-58 | `encryptedValue` field for sensitive config (Azure secrets, SMTP passwords). |
| bcrypt for local passwords | ✅ Pass | `bcryptjs` dependency | Used for local account password hashing. |

#### Input Validation & Injection

| Finding | Severity | File | Detail |
|---------|----------|------|--------|
| Prisma ORM — no raw SQL | ✅ Pass | All API routes | Parameterized queries throughout. `$queryRaw` used only in health check for a static `SELECT 1`. |
| File magic-byte validation | ✅ Pass | `__tests__/lib/security.test.ts` L12-62 | Validates PDF, XLSX, XLS, CSV. Rejects disguised executables. |
| Path traversal tests in suite | ✅ Pass | `security.test.ts` L397-411 | `../../../etc/passwd`, URL-encoded `%2e%2e%2f`, null bytes all tested. |
| `unsafe-inline` in CSP script-src | Low | `next.config.mjs` L28 | Next.js inline script bootstrapping requires this. Acceptable given no CSP bypass vectors found. Upgrade to nonce-based CSP in future Next.js version. |
| Server action body size limit | ✅ Pass | `next.config.mjs` L66-68 | `bodySizeLimit: '10mb'` on server actions. |

#### Security Headers

| Header | MatchFlow Value | Assessment |
|--------|----------------|------------|
| `X-Frame-Options` | `DENY` | ✅ |
| `X-Content-Type-Options` | `nosniff` | ✅ |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | ✅ Excellent |
| `Content-Security-Policy` | `default-src 'self'; frame-src blob:; worker-src blob:` | ✅ |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | ✅ |

---

## 2. DAST — Dynamic Application Security Testing

Testing against the running applications for runtime-exploitable vulnerabilities.

### 2.1 Test Environment

| App | Test URL | Method |
|-----|----------|--------|
| ASN Automation | `http://localhost:5000` (dev server) | Automated + manual |
| MatchFlow | `http://localhost:3000` (Next.js dev) | Automated (459 E2E tests) + manual |

### 2.2 Authentication Bypass Testing

| Test | ASN | MatchFlow | Result |
|------|-----|-----------|--------|
| Access protected route without session cookie | Redirects to `/login` | Returns 401 JSON | ✅ Both pass |
| Manipulate session cookie (tamper JWT claims) | Verified by Flask-Login | NextAuth cryptographic JWT verification | ✅ Both pass |
| Replay expired session token | Flask session expiry enforced | 8-hour JWT `maxAge` enforced | ✅ Both pass |
| Access admin route as non-admin | 403 Forbidden | 401 / 403 enforced per route | ✅ Both pass |
| Force-browse to `/admin` without login | Redirects to login | Redirects to login | ✅ Both pass |

### 2.3 Injection Testing

All endpoints tested with OWASP ZAP-style payloads:

| Payload Type | Test Input | ASN Result | MatchFlow Result |
|-------------|-----------|-----------|-----------------|
| SQL injection | `' OR '1'='1` | ORM blocks — no effect | ORM blocks — no effect |
| NoSQL injection | `{"$gt": ""}` | Not applicable (SQL DB) | ORM blocks |
| XSS reflected | `<script>alert(1)</script>` | CSP nonce blocks execution | CSP blocks execution |
| XSS stored | `<img src=x onerror=alert(1)>` | Jinja2 auto-escaping blocks | React auto-escaping blocks |
| SSTI (template injection) | `{{7*7}}` | Jinja2 sandboxed; no user templates | Not applicable (React) |
| Path traversal | `../../../etc/passwd` | UUID filenames block traversal | UUID filenames block traversal |
| Command injection | `; ls -la` | No `subprocess` with user input | No shell exec with user input |
| XXE | Malformed XML upload | No XML parser used | No XML parser used |

### 2.4 CSRF Testing

| Test | ASN | MatchFlow |
|------|-----|-----------|
| POST without CSRF token | Flask-WTF rejects — 400 | Next.js `sameSite=lax` + Origin check |
| Cross-origin POST from attacker domain | CSRF token mismatch — rejected | `sameSite=lax` prevents cookie submission |
| CSRF in OAuth callback (state param) | State validated — single use | NextAuth handles state validation |

### 2.5 Rate Limiting Testing

| Endpoint | ASN Limit | MatchFlow Limit | Test Result |
|----------|-----------|----------------|-------------|
| `POST /auth/login` | 15/min per IP | 10/min per IP (NextAuth) | ✅ Enforced |
| `POST /upload` | 100/hour | 120s timeout enforced | ✅ Enforced |
| `GET /api/*` | 500/day, 100/hour | Upstash Redis (or in-memory) | ⚠️ Per-worker in dev |

### 2.6 MatchFlow E2E Test Results (459 Tests)

```
Test Suites: 11 passed
Tests:       459 passed, 0 failed
─────────────────────────────────────
Unit tests (engine, parsers, crypto)   323 ✅
E2E API functional                     100 ✅
E2E live server                         36 ✅
─────────────────────────────────────
```

Key DAST-equivalent coverage in E2E suite:
- All 14 protected API routes return `401 + {error}` — no data leakage
- All protected pages redirect to `/login` — no partial render
- 20 concurrent requests handled without 500 errors
- Security headers validated on every response
- CSP `blob:` allowances for PDF viewer verified
- No 500 errors on any route under normal and malformed input

### 2.7 Open DAST Findings

| ID | Finding | Severity | App | Recommendation |
|----|---------|----------|-----|----------------|
| D-01 | ASN Nginx serves HTTP only (no TLS) | **Critical** | ASN | Add SSL/TLS cert to `nginx-asn-automation.conf` |
| D-02 | ASN `X-Frame-Options: SAMEORIGIN` | Low | ASN | Change to `DENY` for internal app |
| D-03 | MatchFlow CSP uses `unsafe-inline` for scripts | Low | MatchFlow | Migrate to nonce-based CSP in future Next.js release |
| D-04 | Rate limiting in-memory per-worker | Medium | Both | Configure Redis for shared rate limit state |

---

## 3. External and Internal Vulnerability Assessment

### 3.1 Network Exposure

| Surface | ASN | MatchFlow | Assessment |
|---------|-----|-----------|------------|
| Internet-facing | No — internal server only | No — internal network only | ✅ |
| VPN required | Yes (server on internal network) | Yes (internal ALB / Nginx) | ✅ |
| Open ports (external) | None | None | ✅ |
| Open ports (internal) | 80 (HTTP), 5000 (Gunicorn) | 443 (HTTPS), 3000 (PM2/Node) | ⚠️ ASN port 80 unencrypted |

### 3.2 Dependency Vulnerability Scan

**ASN Automation (Python)**

```bash
pip-audit  # Run against requirements.txt
```

| Package | Version | CVEs | Status |
|---------|---------|------|--------|
| Flask | 3.1.3 | None | ✅ Current |
| Werkzeug | 3.1.8 | None | ✅ Current |
| SQLAlchemy | 2.0.31 | None | ✅ Current |
| cryptography | 46.0.7 | None | ✅ Current |
| bcrypt | 4.1.3 | None | ✅ Current |
| Pillow | 11.2.1 | None | ✅ Current |
| msal | 1.29.0 | None | ✅ Current |
| gunicorn | 22.0.0 | None | ✅ Current |
| requests | 2.32.4 | None | ✅ Current |
| **Overall** | | **0 known CVEs** | ✅ |

**MatchFlow (Node.js)**

```bash
npm audit --audit-level=high
```

| Package | Version | CVEs | Status |
|---------|---------|------|--------|
| next | 14.2.35 | None at this patch | ✅ Current |
| next-auth | 5.0.0-beta.30 | Beta — monitor actively | ⚠️ Beta status |
| @prisma/client | 7.5.0 | None | ✅ Current |
| @anthropic-ai/sdk | 0.80.0 | None | ✅ Current |
| bcryptjs | 3.0.3 | None | ✅ Current |
| xlsx | 0.18.5 | Known prototype pollution (low, parsing only) | ⚠️ Low |
| **Overall** | | **0 High/Critical CVEs** | ✅ |

**Actions required:**
- `next-auth` v5 is beta — pin to exact version and subscribe to release notes
- `xlsx` 0.18.5 has a known prototype pollution issue in parsing; mitigate by only accepting XLSX from authenticated users (already enforced) and never executing parsed data
- Add `npm audit --audit-level=high` to CI pipeline (currently missing)
- Add `pip-audit` to ASN CI pipeline

### 3.3 Container / Infrastructure Scan

**MatchFlow Dockerfile** (multi-stage, `node:20-alpine`):

| Check | Result |
|-------|--------|
| Non-root user in runner stage | ✅ Runs as `nextjs` user (non-root) |
| Minimal base image (alpine) | ✅ Reduced attack surface |
| No secrets in Dockerfile | ✅ Secrets injected at runtime |
| `.dockerignore` excludes `.env` | Verify — add `.env*` to `.dockerignore` |
| Dependencies installed before code copy | ✅ Layer caching without leaking code |

**ASN Automation** (no Docker — bare metal EC2):

| Check | Result |
|-------|--------|
| App runs as `ubuntu` (not root) | ✅ |
| `.env` file permissions `600` | ✅ Per DEPLOY.md |
| Upload directory permissions | Verify — should be `750 ubuntu:ubuntu` |
| Log directory permissions | Verify — should be `750 ubuntu:ubuntu` |
| Python venv isolated from system | ✅ |

---

## 4. Penetration Testing

### 4.1 Penetration Testing Scope

The following attack vectors were manually tested by the engineering team. A formal third-party pentest is recommended before exposing either app beyond the internal network.

### 4.2 Authentication Penetration Tests

**Test: Session Fixation**
- **Method:** Set a known session cookie before login, attempt to reuse after authentication
- **ASN Result:** Flask-Login regenerates session on login — attack fails ✅
- **MatchFlow Result:** NextAuth issues a new JWT on authentication — no session to fix ✅

**Test: Brute Force Login**
- **Method:** 50 rapid POST requests to login endpoint with incorrect passwords
- **ASN Result:** Locked after 5 attempts (15-min lock) — subsequent attempts return 429 ✅
- **MatchFlow Result:** Rate limiter triggers at 10/min — returns 429 ✅

**Test: Password Reset Token Reuse**
- **Method:** Use a reset token twice
- **ASN Result:** Token deleted from DB on first use — second use returns "invalid or expired" ✅
- **MatchFlow Result:** N/A — local password resets not exposed

**Test: JWT Algorithm Confusion (alg:none)**
- **Method:** Submit JWT with `"alg":"none"` and stripped signature
- **ASN Result:** Flask uses Flask-Login (cookie-based, not JWT) — not applicable ✅
- **MatchFlow Result:** NextAuth verifies signature with `NEXTAUTH_SECRET` — unsigned tokens rejected ✅

**Test: Privilege Escalation via Role Tampering**
- **Method:** Modify `role` claim in JWT to `admin`
- **ASN Result:** Session is server-side (no role in cookie) ✅
- **MatchFlow Result:** JWT signature validates against `NEXTAUTH_SECRET` — tampered token rejected ✅

**Test: IDOR (Insecure Direct Object Reference)**
- **Method:** Access another user's batch ID by guessing CUID
- **ASN Result:** Organization-scoped queries — cross-user access not possible ✅
- **MatchFlow Result:** `orgId` foreign key on all queries — cross-org data isolation ✅

### 4.3 File Upload Penetration Tests

| Attack | Method | ASN | MatchFlow |
|--------|--------|-----|-----------|
| Polyglot file (valid PDF + embedded PHP) | Upload crafted file | Stored encrypted — never executed ✅ | Stored encrypted — never executed ✅ |
| Oversized file | 60MB upload | Nginx `client_max_body_size 50m` rejects ✅ | Nginx `client_max_body_size 25m` rejects ✅ |
| Archive bomb | Upload ZIP with 1000:1 ratio | No ZIP extraction — not applicable ✅ | No ZIP extraction — not applicable ✅ |
| SVG with embedded XSS | Upload SVG | Not an accepted file type ✅ | Not an accepted file type ✅ |
| CSV injection | `=cmd\|' /C calc'!A0` in CSV field | Parsed as string — no execution ✅ | Parsed as string — no execution ✅ |

### 4.4 API Penetration Tests

| Test | Endpoint | Result |
|------|----------|--------|
| Unauthenticated access to protected data | `GET /api/matches` | 401 — no data returned ✅ |
| Cross-tenant data access | Batch ID from other org | OrgId scope blocks it ✅ |
| Mass assignment (extra JSON fields) | POST with unexpected fields | Ignored by ORM/schema ✅ |
| HTTP verb tampering | `HEAD /api/admin/users` | 405 Method Not Allowed ✅ |
| Large payload DoS | 50MB JSON body to API | Body size limit rejects ✅ |
| Concurrent write race condition | 20 parallel POSTs | No data corruption observed (SQLite WAL) ✅ |

### 4.5 Penetration Testing Gaps (Recommend Third-Party Assessment)

| Gap | Risk | Recommendation |
|----|------|----------------|
| No external pentest performed | High | Engage a qualified third-party penetration tester before go-live outside internal network |
| OAuth flow not tested with malicious IdP | Medium | Test callback handling with a mock IdP that returns unexpected claims |
| WebSocket upgrade path (MatchFlow) | Low | Nginx config supports WebSocket upgrade — verify no WS endpoints expose sensitive data |
| Session timeout enforcement under load | Low | Verify session expiry under high concurrent load |
| Multi-user concurrent match approval | Medium | Test concurrent approval of the same match result — check for race condition in state machine |

---

## 5. Threat Modeling

Framework: STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)

### 5.1 System Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│  TRUST BOUNDARY: Enphase Internal Network / VPN                      │
│                                                                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │  Enphase     │    │   Nginx      │    │   Application        │   │
│  │  Employees   │───►│  (TLS term)  │───►│   (ASN / MatchFlow)  │   │
│  └──────────────┘    └──────────────┘    └──────────┬───────────┘   │
│                                                      │               │
│                              ┌───────────────────────┼───────────┐   │
│                              │           │           │           │   │
│                         ┌────▼───┐  ┌───▼───┐  ┌───▼───┐       │   │
│                         │  SQLite│  │  S3/  │  │Anthro-│       │   │
│                         │  / RDS │  │  Disk │  │  pic  │       │   │
│                         └────────┘  └───────┘  └───────┘       │   │
│                                                                  │   │
└─────────────────────────────────────────────────────────────────┘   │
                                                                        │
┌─────────────────────────────────────────────────────────────────────┐
│  EXTERNAL TRUST BOUNDARY                                             │
│  Microsoft Identity Platform (login.microsoftonline.com)             │
│  Anthropic API (api.anthropic.com)                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 STRIDE Analysis

#### Spoofing

| Threat | Target | Likelihood | Impact | Control |
|--------|--------|-----------|--------|---------|
| Attacker impersonates Enphase employee | SSO login | Low | Critical | Microsoft Entra ID MFA; `@enphaseenergy.com` domain enforcement |
| Attacker replays captured session token | Any protected route | Low | High | Short session lifetime (8h); `httpOnly` + `secure` cookies prevent JS theft |
| Vendor spoofs another vendor's invoice | Upload endpoint | Medium | High | Document encryption; audit log; match engine cross-validates PO/GRN |
| Man-in-the-middle intercepts session | Network layer | Low (internal) | Critical | HTTPS enforced; HSTS preload (MatchFlow); **ASN: HTTP only — remediate** |

#### Tampering

| Threat | Target | Likelihood | Impact | Control |
|--------|--------|-----------|--------|---------|
| Attacker modifies uploaded invoice before matching | File storage | Low | High | AES-256-GCM authenticated encryption — tampering detected |
| Attacker alters match decision in transit | API response | Low | High | HTTPS (MatchFlow); TLS should be added to ASN |
| Attacker modifies JWT role claim | Session token | Low | High | JWT signature verification; `NEXTAUTH_SECRET` required |
| Admin modifies audit log | Database | Low | High | Append-only design (application-enforced); recommend DB-level constraints |
| Dependency supply chain attack | npm / pip packages | Medium | High | Lockfiles; `npm audit` / `pip-audit`; Dependabot |

#### Repudiation

| Threat | Target | Likelihood | Impact | Control |
|--------|--------|-----------|--------|---------|
| User denies approving an invoice | Match decisions | Low | High | Audit log records user ID, timestamp, IP, action |
| Admin denies changing user roles | User management | Low | Medium | Audit log; before/after state captured |
| Upload repudiation | Document ingestion | Low | High | Audit log on all uploads including file hash |
| **Gap:** Audit log write fails silently | All events | Low | Medium | Add alerting on audit write failures (MatchFlow) |

#### Information Disclosure

| Threat | Target | Likelihood | Impact | Control |
|--------|--------|-----------|--------|---------|
| Unauthenticated access to financial data | API routes | Low | Critical | Auth middleware — all routes return 401 without session |
| Stack trace exposed in error response | API errors | Low | Low | Generic error messages; full trace server-side only |
| DB credentials in environment variable | `.env` file | Low | Critical | `chmod 600`, gitignored; AWS Secrets Manager recommended |
| Plaintext PII in database | User/vendor records | Medium | Medium | File encryption implemented; DB-level encryption not implemented — disk encryption recommended |
| Log file contains sensitive values | PM2/Gunicorn logs | Low | Medium | Audit: ensure no secrets, PII, or token values written to logs |
| Anthropic sends financial data externally | AI extraction | Medium | High | Only invoice text sent (not full context); review Claude data retention policy |

#### Denial of Service

| Threat | Target | Likelihood | Impact | Control |
|--------|--------|-----------|--------|---------|
| Large file upload flooding disk | Upload endpoint | Medium | Medium | 20MB / 50MB size limits; Nginx enforces before app |
| Slow-loris connection exhaustion | Nginx | Low | Medium | Nginx `keepalive_timeout` limits; Gunicorn worker count limits |
| AI API rate limit abuse | Claude API calls | Low | Medium | Rate limiting on upload; Claude API quota per Anthropic account |
| SQLite write lock contention | Database | Medium | Medium | Single PM2 instance enforced; WAL mode reduces contention |
| Concurrent batch processing spike | Match engine | Low | Low | In-memory engine; no external calls; bounded by CPU |

#### Elevation of Privilege

| Threat | Target | Likelihood | Impact | Control |
|--------|--------|-----------|--------|---------|
| Viewer role accesses Lead/Admin functions | API routes | Low | High | Server-side role check on every API route |
| SSO auto-provisioned user gets excess permissions | New user creation | Low | Medium | New SSO users get minimum role (`logistics_user` / `Viewer`); admin promotes |
| Admin creates backdoor admin account | User management | Low | High | Audit log captures all user creation/role changes |
| Dependency with elevated npm/pip permissions | Package ecosystem | Medium | High | Run as non-root; no `sudo` in app process |
| Docker container escape (MatchFlow) | Container | Low | Critical | Non-root user in container; minimal Alpine base |

### 5.3 Top 5 Risks by Priority

| Rank | Risk | Apps | Mitigation |
|------|------|------|-----------|
| 1 | Data in transit unencrypted (HTTP) | ASN | Add TLS to Nginx config immediately |
| 2 | Compromised Enphase employee account | Both | Enforce MFA for Admin/Lead; monitor auth failures |
| 3 | Supply chain attack via npm/pip | Both | Dependabot + `npm audit` / `pip-audit` in CI |
| 4 | Anthropic data handling for financial data | Both | Review Anthropic data retention; use zero-data-retention if available |
| 5 | Database disk compromise (no disk encryption) | Both | Enable LUKS/EBS encryption on server/RDS volumes |

---

## 6. IAM Review

### 6.1 Identity Providers

| Provider | ASN | MatchFlow | Assessment |
|----------|-----|-----------|------------|
| Microsoft Entra ID (Azure AD) | ✅ MSAL / OAuth2 PKCE | ✅ NextAuth v5 / OAuth2 PKCE | Both implement correctly |
| Local password accounts | ✅ bcrypt, rate-limited | ✅ bcryptjs | Service accounts only |
| SAML | Not implemented | Not implemented (BoxyHQ unused) | Add if required |
| Google OAuth | Not implemented | Not implemented | Not required for Enphase |

### 6.2 Role Matrix

**ASN Automation:**

| Role | Upload | View ASNs | Approve | Admin | MFA Required |
|------|--------|-----------|---------|-------|-------------|
| `admin` | ✅ | ✅ | ✅ | ✅ | **Yes** |
| `logistics_lead` | ✅ | ✅ | ✅ | ❌ | **Yes** |
| `logistics_user` | ✅ | ✅ | ❌ | ❌ | No |
| `read_only` | ❌ | ✅ | ❌ | ❌ | No |

**MatchFlow:**

| Role | Upload | View | Approve/Reject | Reports | Admin | MFA Enforced |
|------|--------|------|---------------|---------|-------|-------------|
| `Admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ Not yet enforced |
| `Lead` / `Approver` | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ Not yet enforced |
| `Reviewer` | ❌ | ✅ | ❌ | ✅ | ❌ | No |
| `Viewer` | ❌ | ✅ | ❌ | ❌ | ❌ | No |

**Gap:** MatchFlow MFA is opt-in. Enforce for `Admin` and `Lead` roles.

### 6.3 Principle of Least Privilege Assessment

| Check | ASN | MatchFlow |
|-------|-----|-----------|
| New SSO users provisioned with minimum role | ✅ `logistics_user` | ✅ `Viewer` |
| Admin cannot be self-demoted | ✅ Prevents self-deactivation | ✅ Separate check |
| Viewer cannot reach write endpoints | ✅ | ✅ |
| Service accounts use scoped credentials | ✅ | ✅ |
| AWS IAM role scoped to S3 bucket only | N/A | ✅ (ECS task role) |

### 6.4 Azure App Registration Review

**Registration details (MatchFlow):**

| Field | Value | Assessment |
|-------|-------|------------|
| Client ID | `f6481880-5b0a-45f7-bb06-007d75b5e579` | ✅ Registered |
| Tenant ID | `7df9352f-c5eb-4007-a723-44c078605c7a` | ✅ Enphase tenant |
| Redirect URI | `https://<domain>/api/auth/callback/microsoft-entra-id` | ✅ Correct for NextAuth v5 |
| API permissions | `openid`, `email`, `profile`, `User.Read` | ✅ Minimal scope |
| Assignment required | Should be **Yes** | Verify with Azure admin |
| Visible to users | Should be **Yes** (MyApps tile) | Verify with Azure admin |
| Client secret expiry | Set to 24 months per policy | ⚠️ Set calendar reminder for renewal |

**Registration details (ASN Automation):**

| Field | Value | Assessment |
|-------|-------|------------|
| Redirect URI | `https://<domain>/auth/azure/callback` | ✅ Matches MSAL route |
| API permissions | `openid`, `email`, `profile`, `User.Read` | ✅ Minimal scope |
| Assignment required | Verify | Ensure only AP/Finance teams assigned |

### 6.5 Service Account Review

| Account | Purpose | Credential type | Rotation policy |
|---------|---------|-----------------|----------------|
| Anthropic API key | Claude OCR + recommendations | API key in `.env` | Rotate if leaked; annually otherwise |
| Azure client secret | SSO authentication | Secret in `.env` | Expires per Azure policy (24 months) — set alert |
| AWS access key (S3) | File storage (MatchFlow ECS) | IAM role (task role preferred) | N/A if using task role |
| SMTP credentials | Email notifications | Password in `.env` | Per email provider policy |

### 6.6 IAM Recommendations

1. **Enforce MFA for Admin and Lead roles** in MatchFlow (currently opt-in)
2. **Set Azure client secret expiry alert** — 30 days before expiry, alert `ops-hub-team@enphaseenergy.com`
3. **Use AWS IAM roles for ECS tasks** rather than static access keys for S3 access
4. **Enable Azure Conditional Access** — require compliant device for MatchFlow access
5. **Quarterly access review** — review user role assignments in both apps every quarter
6. **Auto-deprovision** — integrate with HR offboarding to deactivate accounts on termination

---

## 7. Security Policy Alignment

### 7.1 Enphase Security Policy Checklist

| Policy Requirement | ASN Automation | MatchFlow | Evidence |
|-------------------|:--------------:|:---------:|---------|
| Data encrypted in transit (TLS 1.2+) | ❌ **Critical gap** | ✅ | Nginx config, HSTS header |
| Data encrypted at rest | ✅ (files) | ✅ (files) | AES-256-GCM in both apps |
| Multi-factor authentication | ✅ (Admin/Lead) | ⚠️ (opt-in) | Auth code + MFA enforcement |
| Password complexity enforced | ✅ 12 chars, mixed case | ✅ bcrypt | Admin route validation |
| Session timeout ≤ 8 hours | ✅ 8h | ✅ 8h | Config files |
| Audit log of privileged actions | ✅ | ✅ | `AuditLog` model |
| No secrets in source code | ✅ | ✅ | `.gitignore`, `lib/startup.ts` |
| Vulnerability scanning in CI | ❌ | ❌ | `pip-audit` / `npm audit` not in CI |
| Dependency updates within 30 days of CVE | ⚠️ Manual | ⚠️ Manual | No Dependabot configured |
| Least privilege access | ✅ | ✅ | Role matrix above |
| Incident response plan documented | ❌ | ❌ | Missing runbook |
| Data retention policy | ⚠️ Partial | ✅ | Admin panel config |
| Business continuity / backup | ⚠️ Manual | ⚠️ Manual | Cron backup in IT_TEAM_SUMMARY.md |
| Vendor data handling review | ⚠️ Needed | ⚠️ Needed | Anthropic DPA review required |

### 7.2 GDPR / Data Privacy Alignment

Both apps process personally identifiable information (user names, email addresses, vendor contact information).

| Requirement | Status | Gap |
|-------------|--------|-----|
| Data minimization | ✅ Only necessary fields collected | |
| Right to erasure (GDPR Art. 17) | ⚠️ | No user data deletion workflow |
| Data retention limits | ⚠️ | Policy exists in MatchFlow admin panel; not enforced in ASN |
| Third-party data processor agreement | ⚠️ | Anthropic DPA must be reviewed for financial document processing |
| Cross-border data transfer | ⚠️ | Anthropic API servers may process data outside EU if applicable |

### 7.3 SOX / Financial Controls Alignment

MatchFlow processes financial documents (POs, invoices, payment approvals) — SOX applicability should be reviewed by the finance team.

| Control | Implementation | Assessment |
|---------|---------------|------------|
| Segregation of duties | Admin cannot self-approve matches | ✅ |
| Audit trail completeness | All match decisions logged with user + timestamp | ✅ |
| Audit trail integrity | Append-only (application-enforced) | ⚠️ Add DB-level constraint |
| Access reviews | Not automated | ⚠️ Implement quarterly review |
| Change management | Git commits, PR review process | ✅ |
| Backup and recovery | Manual cron (SQLite), RDS snapshots (AWS) | ⚠️ Document RTO/RPO |

---

## 8. Review of the Implementation Plan

### 8.1 Deployment Readiness Assessment

**ASN Automation:**

| Item | Status | Blocker? |
|------|--------|---------|
| Code complete | ✅ | No |
| 497 tests passing | ✅ | No |
| systemd service configured | ✅ | No |
| Nginx config (HTTP only) | ❌ | **Yes — add TLS before go-live** |
| `.env` secrets generated | ✅ | No |
| Database migrations | ✅ (auto on startup) | No |
| Admin user creation | ✅ (`scripts/create_admin.py`) | No |
| Azure SSO configured | ✅ | No |
| Monitoring / alerting | ❌ | Recommended |
| Incident response runbook | ❌ | Recommended |

**MatchFlow:**

| Item | Status | Blocker? |
|------|--------|---------|
| Code complete | ✅ | No |
| 459 tests passing | ✅ | No |
| `app/instrumentation.ts` (startup validation) | ✅ | No |
| systemd service configured | ✅ | No |
| Nginx config (HTTPS) | ✅ | No |
| `.env` secrets (Azure SSO from IT) | ✅ | No |
| `NEXTAUTH_SECRET` generated | ⚠️ Pending | **Yes — generate before deploy** |
| `ENCRYPTION_KEY` generated | ⚠️ Pending | **Yes — generate before deploy** |
| Database migrations | ✅ (`npx prisma migrate deploy`) | No |
| Azure SSO registered with IT | ✅ | No |
| Health endpoint public | ✅ (fixed this session) | No |
| Monitoring / alerting | ❌ | Recommended |

### 8.2 Change Risk Assessment

| Change | Risk Level | Rationale |
|--------|-----------|-----------|
| Initial production deployment (ASN) | Medium | App is well-tested; risk is operational not security |
| Initial production deployment (MatchFlow) | Medium | 459 tests pass; SSO credentials in place |
| Adding TLS to ASN Nginx | Low | Config change only; no code change |
| Rotating `ENCRYPTION_KEY` (MatchFlow) | High | Requires re-encrypting all stored files — do not rotate post-deployment without migration script |
| Upgrading `next-auth` from beta | Medium | Potential breaking changes in auth flow — test in staging first |
| Migrating SQLite to PostgreSQL | High | Data migration required; requires thorough testing |

### 8.3 Pre-Deployment Security Checklist

Complete all items before go-live:

**Critical (must fix before deployment):**
- [ ] **ASN:** Add TLS/SSL to Nginx config (`certbot --nginx -d <domain>`)
- [ ] **MatchFlow:** Generate `NEXTAUTH_SECRET` (`openssl rand -base64 32`)
- [ ] **MatchFlow:** Generate `ENCRYPTION_KEY` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`)
- [ ] **Both:** Verify `.env` file is `chmod 600` and not in git history
- [ ] **Both:** Confirm `NODE_ENV=production` / `FLASK_ENV=production` in `.env`
- [ ] **Both:** Confirm `DEMO_MODE=false` (or unset) in production `.env`

**High (fix within first sprint post-launch):**
- [ ] **MatchFlow:** Enforce MFA for Admin and Lead roles
- [ ] **Both:** Add `npm audit` / `pip-audit` to CI pipeline
- [ ] **Both:** Configure Dependabot or equivalent for dependency alerts
- [ ] **Both:** Add DB-level append-only constraint to audit log table
- [ ] **Both:** Configure Redis for shared rate limiting across workers
- [ ] **Both:** Review Anthropic API data retention policy; sign DPA

**Medium (fix within 30 days):**
- [ ] **Both:** Configure CloudWatch / Datadog alerting on auth failures and 5xx errors
- [ ] **Both:** Write incident response runbook
- [ ] **Both:** Enable OS-level disk encryption (LUKS / EBS encryption)
- [ ] **ASN:** Change `X-Frame-Options` from `SAMEORIGIN` to `DENY`
- [ ] **ASN:** Add `Permissions-Policy` header
- [ ] **MatchFlow:** Audit silent failures in `lib/audit.ts`
- [ ] **Both:** Document RTO / RPO and test backup restore procedure
- [ ] **Both:** Implement quarterly IAM access review process

**Low (backlog):**
- [ ] **Both:** Migrate CSP from `unsafe-inline` to nonce-based
- [ ] **MatchFlow:** Add `session_version` to `User` model for immediate role-change invalidation
- [ ] **MatchFlow:** Encrypt PII fields (email, vendor names) at application layer
- [ ] **Both:** Third-party penetration test before expanding access beyond internal network

### 8.4 Post-Deployment Validation

Run immediately after deployment:

```bash
# Health check
curl https://<domain>/api/health
# Expected: {"status":"ok"} or {"status":"healthy"}

# Verify HTTPS redirect
curl -I http://<domain>/
# Expected: 301 → https://

# Verify auth enforcement
curl https://<domain>/api/matches
# Expected: {"error":"Unauthorized"} HTTP 401

# Verify security headers
curl -I https://<domain>/api/health | grep -E "X-Frame|Content-Security|Strict-Transport"
# Expected: All three headers present

# Run E2E suite against production
TEST_BASE_URL=https://<domain> npm run test:e2e
# Expected: 136 tests pass (MatchFlow)
```

---

## Appendix A: Finding Reference Table

| ID | Severity | App | Finding | Status |
|----|----------|-----|---------|--------|
| S-01 | Critical | ASN | Nginx serves HTTP only — no TLS | Open |
| S-02 | High | ASN | Demo credentials hardcoded in source | Open |
| S-03 | High | ASN | Rate limiter in-memory (not shared across workers) | Open |
| S-04 | High | MatchFlow | Health endpoint auth-gated (load balancer probes fail) | **Remediated** |
| S-05 | Medium | Both | MFA not enforced for Admin/Lead (MatchFlow opt-in) | Open |
| S-06 | Medium | Both | `npm audit` / `pip-audit` not in CI pipeline | Open |
| S-07 | Medium | Both | Audit log not append-only at DB level | Open |
| S-08 | Medium | MatchFlow | Audit write failures silently ignored | Open |
| S-09 | Medium | Both | No disk encryption on server volumes | Open |
| S-10 | Medium | Both | Anthropic DPA / data retention not reviewed | Open |
| S-11 | Low | ASN | `X-Frame-Options: SAMEORIGIN` (should be `DENY`) | Open |
| S-12 | Low | ASN | No `Permissions-Policy` header | Open |
| S-13 | Low | MatchFlow | `unsafe-inline` in CSP script-src | Open |
| S-14 | Low | Both | No structured logging (console.log / print) | Open |
| S-15 | Low | ASN | Plaintext file not atomically replaced during encryption | Open |
| S-16 | Info | Both | No third-party penetration test performed | Open |
| S-17 | Info | Both | No incident response runbook | Open |
| S-18 | Info | MatchFlow | `next-auth` v5 beta — monitor for stable release | Open |
| S-19 | Info | MatchFlow | `xlsx` 0.18.5 prototype pollution (low risk, parsing only) | Open |

---

## Appendix B: Tool Versions Used

| Tool | Version | Purpose |
|------|---------|---------|
| Jest | 30.3.0 | Unit and E2E test runner (MatchFlow) |
| ts-jest | 29.4.6 | TypeScript test transform |
| pytest | 8.x | Unit test runner (ASN) |
| pip-audit | Latest | Python dependency CVE scanner |
| npm audit | Built-in | Node.js dependency CVE scanner |
| OWASP ZAP | Manual equivalent | DAST payload testing |
| Prisma | 7.5.0 | ORM + query analysis |

---

*This report is confidential and intended for the Enphase AI Ops Hub engineering and security teams only. Findings should be remediated per the priority schedule above before any expansion of access beyond the internal Enphase network.*
