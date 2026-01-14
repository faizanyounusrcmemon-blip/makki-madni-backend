const express = require("express");
const router = express.Router();
const pool = require("../db");

/* ================= SUPPLIER LEDGER ================= */
router.get("/", async (req, res) => {
  try {
    const sql = `
      -- ALL SUPPLIERS AND ENTRIES
      WITH all_entries AS (
        
        -- SUPPLIER PAYMENTS
        SELECT
          sp.id,
          sp.payment_date AS txn_date,
          'Supplier Payment - ' || COALESCE(s.supplier_name,'') || ' (Ref: ' || sp.id || ')' AS description,
          NULL::numeric AS credit,
          sp.amount AS debit,
          'supplier' AS source
        FROM supplier_payments sp
        LEFT JOIN suppliers s ON s.id = sp.supplier_id
        WHERE sp.type != 'adjustment'

        UNION ALL

        -- EXPENSES
        SELECT
          e.id,
          e.expense_date AS txn_date,
          'Expense: ' || e.title AS description,
          NULL::numeric AS credit,
          e.amount AS debit,
          'expense' AS source
        FROM expense_ledger e
        WHERE e.payment_method='Cash'

        UNION ALL

        -- MANUAL ENTRIES
        SELECT
          ct.id,
          ct.txn_date,
          ct.comment AS description,
          CASE WHEN ct.type='deposit' THEN ct.amount END AS credit,
          CASE WHEN ct.type='withdraw' THEN ct.amount END AS debit,
          'manual' AS source
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
    console.error("SUPPLIER LEDGER ERROR:", e);
    res.json({ success: false, error: e.message });
  }
});

/* ================= SAVE MANUAL ENTRY ================= */
router.post("/transaction", async (req, res) => {
  try {
    const { txn_date, type, amount, comment } = req.body;
    if (!txn_date || !amount || !type)
      return res.json({ success: false, error: "Missing fields" });

    await pool.query(
      `INSERT INTO cash_transactions (txn_date,type,amount,comment)
       VALUES ($1,$2,$3,$4)`,
      [txn_date, type, amount, comment || ""]
    );

    res.json({ success: true, message: "Manual transaction saved" });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

/* ================= DELETE MANUAL ENTRY ================= */
router.delete("/transaction/:id", async (req, res) => {
  const { password } = req.body;
  if (password !== "786")
    return res.json({ success: false, error: "Wrong password" });

  await pool.query("DELETE FROM cash_transactions WHERE id=$1", [req.params.id]);
  res.json({ success: true, message: "Transaction deleted" });
});

module.exports = router;
