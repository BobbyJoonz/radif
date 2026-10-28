import pg from "pg";
const { Client } = pg;
for (const db of ["radif", "radif_test"]) {
  const c = new Client({ connectionString: `postgresql://radif:radif_dev@127.0.0.1:5433/${db}` });
  try {
    await c.connect();
    const t = await c.query("select count(*)::int as n from information_schema.tables where table_schema='public'");
    let m = -1;
    try {
      const r = await c.query("select count(*)::int as n from _prisma_migrations");
      m = r.rows[0].n;
    } catch {}
    let rows = 0;
    try {
      const r = await c.query('select count(*)::int as n from "Tenant"');
      rows = r.rows[0].n;
    } catch {}
    console.log(db, "tables=", t.rows[0].n, "migrations=", m, "tenants=", rows);
  } catch (e) {
    console.log(db, "ERR", e.message);
  } finally {
    await c.end().catch(() => {});
  }
}
