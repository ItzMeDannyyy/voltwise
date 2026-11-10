chore(backend): configure Prisma ORM with Supabase and install agent skills

### Added
- [Skills] Installed Supabase Agent Skills (`supabase/agent-skills`) for enhanced AI assistant tooling
- [Prisma] Configured direct connection fallback (`DIRECT_URL`) for Prisma migrations in `prisma.config.ts`

### Changed / Updated
- [Environment] Configured Supabase development database credentials and connection pooler URLs (`DATABASE_URL` and `DIRECT_URL`) in untracked `.env` and `.env.development`
- [Environment] Updated `backend/.env.example` with Supabase pooler (port 6543) and session/direct (port 5432) templates

### Testing & Verification
- Tested raw PostgreSQL connection to Supabase instance (session pooler on port 5432 and transaction pooler on port 6543)
- Validated Prisma schema (`npx prisma validate`) and verified client generation (`npx prisma generate`)
- Verified live Prisma query connectivity against Supabase (`SELECT 1`, user count query)
- Ran complete backend test suite via Jest (`npm test`): 12 passed, 156 passed, 0 failed
