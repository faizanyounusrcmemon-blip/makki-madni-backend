const express = require("express");
const router = express.Router();
const db = require("../db");

const MAX_MB = 500;

router.get("/storage-report", async (req, res) => {
  try {
    // total database size
    const dbSizeQ = await db.query(`
      SELECT pg_database_size(current_database()) AS size
    `);

    const dbBytes = Number(dbSizeQ.rows[0].size);
    const dbMB = +(dbBytes / 1024 / 1024).toFixed(2);

    // per table size
    const tableQ = await db.query(`
      SELECT
        relname AS table,
        pg_total_relation_size(relid) AS size
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY size DESC
    `);

    const tables = tableQ.rows.map(t => ({
      table: t.table,
      sizeMB: +(Number(t.size) / 1024 / 1024).toFixed(2)
    }));

    const remainingMB = +(MAX_MB - dbMB).toFixed(2);

    res.json({
      success: true,
      limitMB: MAX_MB,
      usedMB: dbMB,
      remainingMB,
      percentUsed: Math.min(100, Math.round((dbMB / MAX_MB) * 100)),
      tables
    });
  } catch (err) {
    console.error("STORAGE REPORT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
