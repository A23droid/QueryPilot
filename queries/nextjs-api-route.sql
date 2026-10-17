-- Next.js API Route query: app/api/users/route.ts
-- Handler: GET /api/users?search=alex
-- Prisma: prisma.user.findMany({ where: { email: { contains: 'alex' } }, orderBy: { id: 'desc' } })
--
-- Performance anti-pattern:
-- Wrapping email in LOWER() or leading wildcard LIKE '%...' forces a Sequential Scan on users.

SELECT
    u.id,
    u.email
FROM users u
WHERE LOWER(u.email) LIKE '%alex%'
ORDER BY u.id DESC;
