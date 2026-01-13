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

    /* ===== PURCHASES (DEBIT) ===== */
    const purchaseQ = `
      SELECT
        purchase_date AS date,
        'PURCHASE' AS type,
        '-' AS payment_method,
        purchase_pkr AS debit,
        0 AS credit
      FROM purchases
      WHERE supplier_code = $1
    `;

    /* ===== PAYMENTS (CREDIT) ===== */
    const paymentQ = `
      SELECT
        payment_date AS date,
        'PAYMENT' AS type,
        payment_method,
        0 AS debit,
        amount AS credit
      FROM supplier_payments
      WHERE supplier_code = $1
    `;

    const q = `
      SELECT * FROM (
        ${purchaseQ}
        UNION ALL
        ${paymentQ}
      ) t
      ORDER BY date ASC
    `;

    const { rows } = await db.query(q, [supplier_code]);

    /* ===== RUNNING BALANCE ===== */
    let balance = 0;
    const ledger = rows.map((r) => {
      balance += Number(r.debit);
      balance -= Number(r.credit);
      return { ...r, balance };
    });

    /* ===== PENDING / PARTIAL ===== */
    const pendingQ = `
      SELECT ref_no, supplier_name, status
      FROM purchases
      WHERE supplier_code = $1
      AND status IN ('PENDING','PARTIAL')
    `;
    const pending = (await db.query(pendingQ, [supplier_code])).rows;

    res.json({
      success: true,
      ledger,
      pending,
    });
  } catch (e) {
    console.error(e);
    res.json({ success: false, error: "Server error" });
  }
});

module.exports = router;
