const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ======================================================
   GET BANK LEDGER (AUTO + MANUAL + REF NO)
====================================================== */
router.get("/", async (req, res) => {
  try {
    const sql = `
      WITH all_entries AS (

        /* CUSTOMER PAYMENTS → BANK IN */
        SELECT
          cp.id,
          cp.payment_date AS txn_date,
          'Customer Payment (Ref: ' || cp.ref_no || ')' AS description,
          cp.amount AS credit,
          NULL::numeric AS debit,
          'customer' AS source
        FROM customer_payments cp
        WHERE cp.payment_method = 'Bank'

        UNION ALL

        /* PURCHASE PAYMENTS → BANK OUT */
        SELECT
          pp.id,
          pp.payment_date AS txn_date,
          'Supplier Payment (Ref: ' || pp.ref_no || ')' AS description,
          NULL::numeric AS credit,
          pp.amount AS debit,
          'purchase' AS source
        FROM purchase_payments pp
        WHERE pp.payment_method = 'Bank'

        UNION ALL

        /* MANUAL BANK TRANSACTIONS */
        SELECT
          bt.id,
          bt.txn_date,
          bt.comment AS description,
          CASE WHEN bt.type = 'deposit' THEN bt.amount END AS credit,
          CASE WHEN bt.type = 'withdraw' THEN bt.amount END AS debit,
          'manual' AS source
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
    res.json({ success: false, error: err.message });
  }
});

/* ======================================================
   SAVE MANUAL TRANSACTION
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
    res.json({ success: false, error: err.message });
  }
});

/* ======================================================
   DELETE MANUAL TRANSACTION (PASSWORD = 786)
====================================================== */
router.delete("/transaction/:id", async (req, res) => {
  try {
    const { password } = req.body;

    if (password !== "786") {
      return res.json({ success: false, error: "Wrong password" });
    }

    await pool.query(
      "DELETE FROM bank_transactions WHERE id=$1",
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
