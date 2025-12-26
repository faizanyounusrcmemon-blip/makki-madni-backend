const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {
    const { year, month } = req.query;

    const yCond = year ? `AND EXTRACT(YEAR FROM created_at)=${year}` : "";
    const mCond = month ? `AND EXTRACT(MONTH FROM created_at)=${month}` : "";

    /* ================= SALES (DISPLAY ONLY) ================= */
    const salesQ = await db.query(`
      SELECT COALESCE(SUM(total_pkr),0) AS total
      FROM bookings
      WHERE is_deleted=false ${yCond} ${mCond}
    `);
    const totalSales = Number(salesQ.rows[0].total);

    /* ================= PURCHASE (DISPLAY ONLY) ================= */
    const purchaseQ = await db.query(`
      SELECT COALESCE(SUM(purchase_pkr),0) AS total
      FROM purchase_entries
      WHERE is_deleted=false ${yCond} ${mCond}
    `);
    const totalPurchase = Number(purchaseQ.rows[0].total);

    /* ================= ACTUAL PROFIT SOURCE ================= */
    const profitQ = await db.query(`
      SELECT COALESCE(SUM(profit),0) AS total
      FROM purchase_entries
      WHERE is_deleted=false ${yCond} ${mCond}
    `);
    const baseProfit = Number(profitQ.rows[0].total);

    /* ================= CUSTOMER ADJUSTMENT (-) ================= */
    const custAdjQ = await db.query(`
      SELECT COALESCE(SUM(amount),0) AS total
      FROM customer_payments
      WHERE type='adjustment'
      ${year ? `AND EXTRACT(YEAR FROM payment_date)=${year}` : ""}
      ${month ? `AND EXTRACT(MONTH FROM payment_date)=${month}` : ""}
    `);
    const customerAdj = Number(custAdjQ.rows[0].total);

    /* ================= EXPENSE (-) ================= */
    const expQ = await db.query(`
      SELECT COALESCE(SUM(amount),0) AS total
      FROM expense_ledger
      ${year ? `WHERE EXTRACT(YEAR FROM expense_date)=${year}` : "WHERE 1=1"}
      ${month ? `AND EXTRACT(MONTH FROM expense_date)=${month}` : ""}
    `);
    const totalExpense = Number(expQ.rows[0].total);

    /* ================= FINAL NET PROFIT ================= */
    const netProfit =
      baseProfit -
      customerAdj -
      totalExpense;

    res.json({
      success: true,
      report: {
        total_sales: Math.round(totalSales),
        total_purchase: Math.round(totalPurchase),
        base_profit: Math.round(baseProfit),
        customer_adjustment: Math.round(customerAdj),
        total_expense: Math.round(totalExpense),
        net_profit: Math.round(netProfit)
      }
    });

  } catch (err) {
    console.error("PROFIT REPORT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
