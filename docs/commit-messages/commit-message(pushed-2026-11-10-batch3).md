fix(backend): switch database connection config to DATABASE_URL exclusively

### Changed / Updated
- [Database Config] Updated `backend/src/configs/database.ts` to consume `DATABASE_URL` directly instead of assembling discrete host, port, user, password, and database environment variables
- [Environment] Updated `backend/.env.example` and active `.env` / `.env.development` to remove individual database connection fields (`DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`) in favor of unified `DATABASE_URL` and `DIRECT_URL`
- [Documentation] Updated `backend/README.md` environment variable sample to reflect `DATABASE_URL`

### Testing & Verification
- Ran full backend test suite (`npm --prefix backend test`): 12 suites passed, 156 tests passed
- Verified Prisma client generation (`npm --prefix backend run build`): generated successfully
