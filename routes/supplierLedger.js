const express = require("express");
const router = express.Router();
const db = require("../db");

/* ======================================
   SUPPLIER LEDGER
====================================== */
router.get("/:supplier_code", async (req, res) => {
  try {
    const { supplier_code } = req.params;
    const { from, to } = req.query;

    let where = `
      WHERE is_deleted = false
      AND supplier_code = $1
    `;

    const params = [supplier_code];

    if (from) {
      params.push(from);
      where += ` AND entry_date >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      where += ` AND entry_date <= $${params.length}`;
    }

    const q = `
      SELECT *
      FROM supplier_ledger
      ${where}
      ORDER BY entry_date ASC, id ASC
    `;

    const { rows } = await db.query(q, params);

    /* ===== RUNNING BALANCE ===== */
    let balance = 0;
    const ledger = rows.map((r) => {
      balance += Number(r.debit || 0);
      balance -= Number(r.credit || 0);

      return {
        ...r,
        balance,
      };
    });

    /* ===== PENDING / PARTIAL ===== */
    const pending = ledger.filter(
      (r) => r.type === "PURCHASE" && r.credit === 0
    );

    res.json({
      success: true,
      ledger,
      pending,
    });
  } catch (err) {
    console.error("SUPPLIER LEDGER ERROR:", err);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

module.exports = router;
