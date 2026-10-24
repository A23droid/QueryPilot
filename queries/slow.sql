-- slow.sql
--
-- Example of a query that QueryPilot should flag as slow.
--
-- Teaching note — why is this slow?
--   1. We join orders to users with no index on orders.user_id
--      → PostgreSQL will do a Seq Scan on orders for every user row
--   2. We filter on orders.created_at with a function call (DATE())
--      → Function-wrapped columns can't use a B-tree index
--   3. ORDER BY total without an index forces an in-memory Sort step
--
-- Run:  qp optimize ./queries/slow.sql
-- Fix:  CREATE INDEX ON orders(user_id);
--       CREATE INDEX ON orders(created_at);
--       CREATE INDEX ON orders(total DESC);

SELECT
    u.id,
    u.email,
    SUM(o.total) AS lifetime_value,
    COUNT(o.id)  AS order_count
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE DATE(o.created_at) >= '2024-01-01'
GROUP BY u.id, u.email
ORDER BY lifetime_value DESC
LIMIT 100;
