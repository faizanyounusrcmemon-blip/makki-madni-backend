const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ======================================================
   GET BANK LEDGER (LIVE VIEW, BANK ONLY, EXCLUDE ADJUSTMENTS)
   - Customer/Supplier payments filtered by payment_method='bank'
   - Manual bank transactions included
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
        SELECT ref_no, customer_name FROM ticketing
        UNION ALL
        SELECT ref_no, customer_name FROM transport
        UNION ALL
        SELECT ref_no, customer_name FROM ziyarat
      ),
      all_entries AS (

        /* ================= CUSTOMER BANK PAYMENTS ================= */
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
          AND LOWER(COALESCE(cp.payment_method,'')) = 'bank'

        UNION ALL

        /* ================= SUPPLIER BANK PAYMENTS ================= */
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
          AND LOWER(COALESCE(sp.payment_method,'')) = 'bank'

        UNION ALL

        /* ================= EXPENSES PAID BY BANK ================= */
        SELECT 
          e.id,
          e.expense_date AS txn_date,
          'Expense: ' || e.title AS description,
          NULL::numeric AS credit,
          ROUND(e.amount::numeric, 0) AS debit,
          'expense' AS source
        FROM expense_ledger e
        WHERE LOWER(COALESCE(e.payment_method,'')) = 'bank'

        UNION ALL
        /* ================= MANUAL BANK TRANSACTIONS ================= */
        SELECT 
          bt.id,
          bt.txn_date,
          bt.comment AS description,
          CASE WHEN bt.type='deposit' THEN ROUND(bt.amount::numeric, 0) END AS credit,
          CASE WHEN bt.type='withdraw' THEN ROUND(bt.amount::numeric, 0) END AS debit,
          'manual' AS source
        FROM bank_transactions bt
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
    console.error("BANK LEDGER ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* ================= SAVE MANUAL BANK ENTRY ================= */
router.post("/transaction", async (req, res) => {
  try {
    const { txn_date, type, amount, comment } = req.body;
    if (!txn_date || !amount || !type) 
      return res.json({ success: false, error: "Missing fields" });

    await pool.query(
      `INSERT INTO bank_transactions (txn_date, type, amount, comment) VALUES ($1,$2,$3,$4)`,
      [txn_date, type, amount, comment || ""]
    );

    res.json({ success: true, message: "Transaction saved" });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ================= DELETE MANUAL BANK ENTRY ================= */
router.delete("/transaction/:id", async (req, res) => {
  const { password } = req.body;
  if (password !== "786") 
    return res.json({ success: false, error: "Wrong password" });

  await pool.query("DELETE FROM bank_transactions WHERE id=$1", [req.params.id]);
  res.json({ success: true, message: "Transaction deleted" });
});

module.exports = router;

