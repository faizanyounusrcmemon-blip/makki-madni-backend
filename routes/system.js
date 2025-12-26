const express = require("express");
const router = express.Router();
const db = require("../db");

// safe estimate (Supabase free / normal usage)
const MAX_ROWS = 500000;

// helper: detect date column
async function getStats(table) {
  // check possible date columns
  const cols = await db.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = $1
      AND column_name IN ('created_at','at')
    `,
    [table]
  );

  const dateCol = cols.rows[0]?.column_name;

  let q;
  if (dateCol) {
    q = await db.query(
      `
      SELECT
        COUNT(*) AS total,
        MIN(${dateCol}) AS first_row
      FROM ${table}
      `
    );
  } else {
    q = await db.query(
      `SELECT COUNT(*) AS total FROM ${table}`
    );
  }

  return {
    total: Number(q.rows[0].total),
    first: q.rows[0].first_row || null
  };
}

router.get("/capacity", async (req, res) => {
  try {
    const tables = [
      "users",
      "bookings",
      "hotels",
      "purchase_entries",
      "purchase_payments",
      "customer_payments",
      "bank_transactions",
      "ticketing",
      "transport",
      "visa"
    ];

    const rows = [];

    for (const table of tables) {
      const { total, first } = await getStats(table);

      let avg = 0;
      let daysLeft = null;

      if (first) {
        const days =
          Math.max(
            (Date.now() - new Date(first)) / (1000 * 60 * 60 * 24),
            1
          );

        avg = +(total / days).toFixed(2);
        daysLeft = avg > 0
          ? Math.round((MAX_ROWS - total) / avg)
          : null;
      }

      rows.push({
        table,
        total,
        avg,
        remaining: MAX_ROWS - total,
        daysLeft
      });
    }

    res.json({ success: true, rows });
  } catch (err) {
    console.error("CAPACITY ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
