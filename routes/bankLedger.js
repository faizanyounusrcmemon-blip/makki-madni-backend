const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ======================================================
   GET BANK LEDGER (AUTO + MANUAL)
====================================================== */
router.get("/", async (req, res) => {
  try {
    const sql = `
      WITH all_entries AS (

        /* CUSTOMER PAYMENTS → BANK IN */
        SELECT
          payment_date AS txn_date,
          'Customer Payment' AS description,
          amount AS credit,
          NULL::numeric AS debit
        FROM customer_payments
        WHERE payment_method = 'Bank'

        UNION ALL

        /* PURCHASE PAYMENTS → BANK OUT */
        SELECT
          payment_date AS txn_date,
          'Supplier Payment' AS description,
          NULL::numeric AS credit,
          amount AS debit
        FROM purchase_payments
        WHERE payment_method = 'Bank'

        UNION ALL

        /* MANUAL BANK TRANSACTIONS */
        SELECT
          txn_date,
          comment AS description,
          CASE WHEN type = 'deposit' THEN amount END AS credit,
          CASE WHEN type = 'withdraw' THEN amount END AS debit
        FROM bank_transactions
      )

      SELECT *,
        SUM(
          COALESCE(credit,0) - COALESCE(debit,0)
        ) OVER (ORDER BY txn_date, description) AS balance
      FROM all_entries
      ORDER BY txn_date;
    `;

    const { rows } = await pool.query(sql);
    res.json({ success: true, rows });

  } catch (err) {
    console.error("BANK LEDGER ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* ======================================================
   SAVE MANUAL BANK TRANSACTION (DEPOSIT / WITHDRAW)
====================================================== */
router.post("/transaction", async (req, res) => {
  try {
    const { txn_date, type, amount, comment } = req.body;

    if (!txn_date || !amount || !type) {
      return res.json({ success: false, error: "Date, Amount & Type required" });
    }

    await pool.query(
      `INSERT INTO bank_transactions (txn_date, type, amount, comment)
       VALUES ($1,$2,$3,$4)`,
      [txn_date, type, amount, comment || ""]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("BANK TXN ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
