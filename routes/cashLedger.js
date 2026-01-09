const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ================= CASH LEDGER ================= */
router.get("/", async (req, res) => {
  try {
    const sql = `
      WITH customers AS (
        SELECT ref_no, customer_name FROM bookings
        UNION ALL SELECT ref_no, customer_name FROM hotels
        UNION ALL SELECT ref_no, customer_name FROM visa
        UNION ALL SELECT ref_no, customer_name FROM ticketing
        UNION ALL SELECT ref_no, customer_name FROM transport
      ),

      all_entries AS (

        -- CUSTOMER CASH RECEIVED
        SELECT
          cp.id,
          cp.payment_date AS txn_date,
          'Customer Cash - ' || COALESCE(c.customer_name,'') ||
          ' (Ref: ' || cp.ref_no || ')' AS description,
          cp.amount AS credit,
          NULL::numeric AS debit,
          'customer' AS source
        FROM customer_payments cp
        LEFT JOIN customers c ON c.ref_no = cp.ref_no
        WHERE cp.payment_method='Cash'
          AND cp.type!='adjustment'

        UNION ALL

        -- SUPPLIER CASH PAYMENT
        SELECT
          pp.id,
          pp.payment_date,
          'Supplier Cash - ' || COALESCE(c.customer_name,'') ||
          ' (Ref: ' || pp.ref_no || ')',
          NULL,
          pp.amount,
          'purchase'
        FROM purchase_payments pp
        LEFT JOIN customers c ON c.ref_no = pp.ref_no
        WHERE pp.payment_method='Cash'
          AND pp.type!='adjustment'

        UNION ALL

        -- CASH EXPENSE
        SELECT
          e.id,
          e.expense_date,
          'Expense: ' || e.title,
          NULL,
          e.amount,
          'expense'
        FROM expense_ledger e
        WHERE e.payment_method='Cash'

        UNION ALL

        -- MANUAL CASH
        SELECT
          ct.id,
          ct.txn_date,
          ct.comment,
          CASE WHEN ct.type='deposit' THEN ct.amount END,
          CASE WHEN ct.type='withdraw' THEN ct.amount END,
          'manual'
        FROM cash_transactions ct
      )

      SELECT *,
        SUM(COALESCE(credit,0)-COALESCE(debit,0))
        OVER (ORDER BY txn_date,id) AS balance
      FROM all_entries
      ORDER BY txn_date,id
    `;

    const { rows } = await pool.query(sql);
    res.json({ success: true, rows });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

/* ================= SAVE MANUAL CASH ================= */
router.post("/transaction", async (req, res) => {
  const { txn_date, type, amount, comment } = req.body;
  await pool.query(
    `INSERT INTO cash_transactions (txn_date,type,amount,comment)
     VALUES ($1,$2,$3,$4)`,
    [txn_date, type, amount, comment || ""]
  );
  res.json({ success: true, message: "Cash transaction saved" });
});

/* ================= DELETE ================= */
router.delete("/transaction/:id", async (req, res) => {
  if (req.body.password !== "786")
    return res.json({ success: false, error: "Wrong password" });

  await pool.query("DELETE FROM cash_transactions WHERE id=$1", [
    req.params.id,
  ]);
  res.json({ success: true });
});

module.exports = router;
