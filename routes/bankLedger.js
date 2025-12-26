const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ======================================================
   GET BANK LEDGER  ✅ FINAL FIX
====================================================== */
router.get("/", async (req, res) => {
  try {
    const sql = `
      WITH all_entries AS (

        /* ================= CUSTOMER PAYMENTS ================= */
        SELECT
          cp.id,
          cp.payment_date AS txn_date,
          'Customer Payment (Ref: ' || cp.ref_no || ')' AS description,
          cp.amount AS credit,
          NULL::numeric AS debit,
          'customer' AS source
        FROM customer_payments cp
        WHERE LOWER(cp.payment_method) = 'bank'
          AND COALESCE(cp.is_deleted, false) = false

        UNION ALL

        /* ================= PURCHASE PAYMENTS ================= */
        SELECT
          pp.id,
          pp.payment_date AS txn_date,
          'Supplier Payment (Ref: ' || pp.ref_no || ')' AS description,
          NULL::numeric AS credit,
          pp.amount AS debit,
          'purchase' AS source
        FROM purchase_payments pp
        WHERE LOWER(pp.payment_method) = 'bank'
          AND COALESCE(pp.is_deleted, false) = false

        UNION ALL

        /* ================= BANK TRANSACTIONS (MANUAL + EXPENSE) ================= */
        SELECT
          bt.id,
          bt.txn_date,
          bt.comment AS description,
          CASE WHEN bt.type = 'deposit' THEN bt.amount END AS credit,
          CASE WHEN bt.type = 'withdraw' THEN bt.amount END AS debit,
          bt.source
        FROM bank_transactions bt
      )

      SELECT *,
        SUM(COALESCE(credit,0) - COALESCE(debit,0))
          OVER (ORDER BY txn_date, id) AS balance
      FROM all_entries
      ORDER BY txn_date, id;
    `;

    const { rows } = await pool.query(sql);
    res.json({ success: true, rows });

  } catch (err) {
    console.error("BANK LEDGER ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* ======================================================
   SAVE MANUAL BANK ENTRY
====================================================== */
router.post("/transaction", async (req, res) => {
  try {
    const { txn_date, type, amount, comment } = req.body;

    if (!txn_date || !amount || !type)
      return res.json({ success: false, error: "Required fields missing" });

    await pool.query(
      `
      INSERT INTO bank_transactions
      (txn_date, type, amount, comment, source)
      VALUES ($1,$2,$3,$4,'manual')
      `,
      [txn_date, type, amount, comment || ""]
    );

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ======================================================
   DELETE MANUAL ENTRY (PASSWORD = 786)
====================================================== */
router.delete("/transaction/:id", async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== "786")
      return res.json({ success: false, error: "Wrong password" });

    await pool.query(
      "DELETE FROM bank_transactions WHERE id=$1 AND source='manual'",
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
