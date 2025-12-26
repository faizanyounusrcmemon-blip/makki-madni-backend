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

    /* ================= TABLE LIST ================= */
    const tablesQ = await db.query(`
      SELECT relname
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY relname
    `);

    const rows = [];

    for (const t of tablesQ.rows) {
      const table = t.relname;

      /* EXACT ROW COUNT */
      const countQ = await db.query(
        `SELECT COUNT(*) AS c FROM ${table}`
      );
      const totalRows = Number(countQ.rows[0].c);

      /* TABLE SIZE */
      const sizeQ = await db.query(
        `SELECT pg_total_relation_size($1) AS bytes`,
        [table]
      );
      const tableMB = Number(sizeQ.rows[0].bytes) / 1024 / 1024;

      /* AVERAGE ROW SIZE */
      const avgRowMB =
        totalRows > 0 ? tableMB / totalRows : 0;

      /* POSSIBLE ROWS (ESTIMATE) */
      const possibleRows =
        avgRowMB > 0
          ? Math.floor(remainingMB / avgRowMB)
          : 0;

      rows.push({
        table,
        totalRows,
        tableMB: +tableMB.toFixed(2),
        avgRowKB: +(avgRowMB * 1024).toFixed(2),
        possibleRows
      });
    }

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
