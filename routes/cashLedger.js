const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ======================================================
   GET cash LEDGER (LIVE VIEW WITH CUSTOMER & SUPPLIER)
====================================================== */
router.get("/", async (req, res) => {
  try {
    const sql = `
      WITH customers AS (
        SELECT ref_no, customer_name FROM bookings
        UNION ALL
        SELECT ref_no, customer_name FROM hotels
        UNION ALL
        SELECT ref_no, customer_name FROM visa
        UNION ALL
        SELECT ref_no, customer_name FROM ticketing
        UNION ALL
        SELECT ref_no, customer_name FROM transport
      ),
      all_entries AS (
        /* =============================== CUSTOMER PAYMENTS (cash ONLY) =============================== */
        SELECT 
          cp.id,
          cp.payment_date AS txn_date,
          'Customer Payment - ' || COALESCE(c.customer_name,'') || ' (Ref: ' || cp.ref_no || ')' AS description,
          cp.amount AS credit,
          NULL::numeric AS debit,
          'customer' AS source
        FROM customer_payments cp
        LEFT JOIN customers c ON c.ref_no = cp.ref_no
        WHERE cp.payment_method = 'cash' AND cp.type != 'adjustment'

        UNION ALL

       /* =============================== SUPPLIER PAYMENTS (cash ONLY) =============================== */
        SELECT 
          sp.id,
          sp.payment_date AS txn_date,
          'Supplier Payment - ' || COALESCE(s.supplier_name,'') || ' (Ref: ' || sp.id || ')' AS description,
          NULL::numeric AS credit,
          sp.amount AS debit,
          'supplier' AS source
        FROM supplier_payments sp
        LEFT JOIN suppliers s ON s.id = sp.supplier_id   -- <-- Yahan supplier_code ko id se replace karo
        WHERE sp.payment_method = 'cash'

        UNION ALL

        /* =============================== EXPENSES (cash ONLY) =============================== */
        SELECT 
          e.id,
          e.expense_date AS txn_date,
          'Expense: ' || e.title AS description,
          NULL::numeric AS credit,
          e.amount AS debit,
          'expense' AS source
        FROM expense_ledger e
        WHERE e.payment_method = 'cash'

        UNION ALL

        /* =============================== MANUAL cash TRANSACTIONS =============================== */
        SELECT 
          bt.id,
          bt.txn_date,
          bt.comment AS description,
          CASE WHEN bt.type='deposit' THEN bt.amount END AS credit,
          CASE WHEN bt.type='withdraw' THEN bt.amount END AS debit,
          'manual' AS source
        FROM cash_transactions bt
      )
      SELECT *,
        SUM(COALESCE(credit,0) - COALESCE(debit,0)) OVER (ORDER BY txn_date, id) AS balance
      FROM all_entries
      ORDER BY txn_date, id;
    `;
    const { rows } = await pool.query(sql);
    res.json({ success: true, rows });
  } catch (err) {
    console.error("cash LEDGER ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* ================= SAVE MANUAL ENTRY ================= */
router.post("/transaction", async (req, res) => {
  try {
    const { txn_date, type, amount, comment } = req.body;
    if (!txn_date || !amount || !type) return res.json({ success: false, error: "Missing fields" });

    await pool.query(
      `INSERT INTO cash_transactions (txn_date, type, amount, comment) VALUES ($1,$2,$3,$4)`,
      [txn_date, type, amount, comment || ""]
    );

    res.json({ success: true, message: "Transaction saved" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ================= DELETE MANUAL ================= */
router.delete("/transaction/:id", async (req, res) => {
  const { password } = req.body;
  if (password !== "786") return res.json({ success: false, error: "Wrong password" });

  await pool.query("DELETE FROM cash_transactions WHERE id=$1", [req.params.id]);
  res.json({ success: true, message: "Transaction deleted" });
});

module.exports = router;


