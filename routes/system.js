const express = require("express");
const router = express.Router();
const db = require("../db");

const DB_LIMIT_MB = 500;

router.get("/capacity-rows", async (req, res) => {
  try {
    /* ================= DATABASE SIZE ================= */
    const dbQ = await db.query(`
      SELECT pg_database_size(current_database()) AS size
    `);

    const usedMB = Number(dbQ.rows[0].size) / 1024 / 1024;
    const remainingMB = DB_LIMIT_MB - usedMB;

    /* ================= TABLE STATS (SAFE) ================= */
    const tablesQ = await db.query(`
      SELECT
        relname AS table,
        pg_total_relation_size(relid) AS bytes,
        n_live_tup AS rows
      FROM pg_stat_user_tables
      ORDER BY bytes DESC
    `);

    const rows = tablesQ.rows.map(t => {
      const tableMB = Number(t.bytes) / 1024 / 1024;
      const totalRows = Math.max(Number(t.rows), 1);

      const avgRowMB = tableMB / totalRows;
      const possibleRows =
        avgRowMB > 0
          ? Math.floor(remainingMB / avgRowMB)
          : 0;

      return {
        table: t.table,
        totalRows,
        tableMB: +tableMB.toFixed(2),
        avgRowKB: +(avgRowMB * 1024).toFixed(2),
        possibleRows
      };
    });

    res.json({
      success: true,
      dbLimitMB: DB_LIMIT_MB,
      usedMB: +usedMB.toFixed(2),
      remainingMB: +remainingMB.toFixed(2),
      rows
    });

  } catch (err) {
    console.error("CAPACITY ROWS ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
