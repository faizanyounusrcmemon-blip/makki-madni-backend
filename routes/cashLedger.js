const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ======================================================
   GET CASH LEDGER (LIVE VIEW, CASH ONLY, EXCLUDE ADJUSTMENTS)
   - Customer/Supplier cash payments
   - Expenses paid by cash only
   - Manual cash transactions
   - Rounded amounts, no -0
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
        SELECT ref_no, customer_name FROM card
        UNION ALL
        SELECT ref_no, customer_name FROM ticketing
        UNION ALL
        SELECT ref_no, customer_name FROM transport
        UNION ALL
        SELECT ref_no, customer_name FROM ziyarat
      ),
      all_entries AS (

        /* ================= CUSTOMER CASH PAYMENTS ================= */
        SELECT 
          cp.id,
          cp.payment_date AS txn_date,
          'Customer Payment - ' || COALESCE(c.customer_name,'') || ' (Ref: ' || cp.ref_no || ')' AS description,
          ROUND(cp.amount::numeric, 0) AS credit,
          NULL::numeric AS debit,
          'customer' AS source
        FROM customer_payments cp
        LEFT JOIN customers c ON c.ref_no = cp.ref_no
        WHERE LOWER(COALESCE(cp.type, '')) != 'adjustment'
          AND LOWER(COALESCE(cp.payment_method,'')) = 'cash'

        UNION ALL

        /* ================= SUPPLIER CASH PAYMENTS ================= */
        SELECT 
          sp.id,
          sp.payment_date AS txn_date,
          'Supplier Payment - ' || COALESCE(s.supplier_name,'') || ' (Ref: ' || sp.id || ')' AS description,
          NULL::numeric AS credit,
          ROUND(sp.amount::numeric, 0) AS debit,
          'supplier' AS source
        FROM supplier_payments sp
        LEFT JOIN suppliers s ON s.id = sp.supplier_id
        WHERE LOWER(COALESCE(sp.type, '')) != 'adjustment'
          AND LOWER(COALESCE(sp.payment_method,'')) = 'cash'

        UNION ALL

        /* ================= EXPENSES PAID BY CASH ================= */
        SELECT 
          e.id,
          e.expense_date AS txn_date,
          'Expense: ' || e.title AS description,
          NULL::numeric AS credit,
          ROUND(e.amount::numeric, 0) AS debit,
          'expense' AS source
        FROM expense_ledger e
        WHERE LOWER(COALESCE(e.payment_method,'')) = 'cash'

        UNION ALL

        /* ================= MANUAL CASH TRANSACTIONS ================= */
        SELECT 
          bt.id,
          bt.txn_date,
          bt.comment AS description,
          CASE WHEN bt.type='deposit' THEN ROUND(bt.amount::numeric, 0) END AS credit,
          CASE WHEN bt.type='withdraw' THEN ROUND(bt.amount::numeric, 0) END AS debit,
          'manual' AS source
        FROM cash_transactions bt
      )
      SELECT *,
        /* Running balance, rounded and -0 fixed */
        ROUND(SUM(COALESCE(credit,0) - COALESCE(debit,0)) OVER (ORDER BY txn_date, id)) AS balance
      FROM all_entries
      ORDER BY txn_date, id;
    `;

    const { rows } = await pool.query(sql);

    // Extra safety in JS: normalize -0 to 0
    const normalized = rows.map(r => ({
      ...r,
      credit: r.credit === -0 ? 0 : r.credit,
      debit: r.debit === -0 ? 0 : r.debit,
      balance: r.balance === -0 ? 0 : r.balance
    }));

    res.json({ success: true, rows: normalized });
  } catch (err) {
    console.error("CASH LEDGER ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* ================= SAVE MANUAL CASH ENTRY ================= */
router.post("/transaction", async (req, res) => {
  try {
    const { txn_date, type, amount, comment } = req.body;
    if (!txn_date || !amount || !type) 
      return res.json({ success: false, error: "Missing fields" });

    await pool.query(
      `INSERT INTO cash_transactions (txn_date, type, amount, comment) VALUES ($1,$2,$3,$4)`,
      [txn_date, type, amount, comment || ""]
    );

    res.json({ success: true, message: "Transaction saved" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ================= DELETE MANUAL CASH ENTRY ================= */
router.delete("/transaction/:id", async (req, res) => {
  const { password } = req.body;
  if (password !== "786") 
    return res.json({ success: false, error: "Wrong password" });

  await pool.query("DELETE FROM cash_transactions WHERE id=$1", [req.params.id]);
  res.json({ success: true, message: "Transaction deleted" });
});

module.exports = router;
