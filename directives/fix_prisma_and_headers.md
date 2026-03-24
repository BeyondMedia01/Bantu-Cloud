# Directive: Fix Prisma Singletons & Security Headers

**Goal**: Ensure all backend routes use the shared Prisma instance and replace direct header reads (`x-company-id`) with the validated `req.companyId` from context.
**Inputs**: Source code in `backend/routes/*.js`.
**Tools/Scripts to use**: `execution/fix_prisma_and_headers.py`
**Outputs**: Modified Javascript files.
**Edge Cases**:
- Remove the unused `@prisma/client` import after replacing `new PrismaClient()`.
- Ensure string replacement for headers catches both single and double quotes.
