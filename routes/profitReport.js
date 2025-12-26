const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {
    const { year, month } = req.query;

    let where = "WHERE is_deleted = false";
    const params = [];

    if (year) {
      params.push(year);
      where += ` AND EXTRACT(YEAR FROM created_at) = $${params.length}`;
    }

    if (month) {
      params.push(month);
      where += ` AND EXTRACT(MONTH FROM created_at) = $${params.length}`;
    }

    /* ================= PROFIT FROM PURCHASE TABLE ================= */
    const profitQ = await db.query(
      `
      SELECT COALESCE(SUM(profit),0) AS total_profit
      FROM purchase_entries
      ${where}
      `,
      params
    );

    const totalProfit = Number(profitQ.rows[0].total_profit);

    /* ================= TOTAL EXPENSE ================= */
    let expWhere = "WHERE 1=1";
    const expParams = [];

    if (year) {
      expParams.push(year);
      expWhere += ` AND EXTRACT(YEAR FROM expense_date) = $${expParams.length}`;
    }

    if (month) {
      expParams.push(month);
      expWhere += ` AND EXTRACT(MONTH FROM expense_date) = $${expParams.length}`;
    }

    const expenseQ = await db.query(
      `
      SELECT COALESCE(SUM(amount),0) AS total_expense
      FROM expense_ledger
      ${expWhere}
      `,
      expParams
    );

    const totalExpense = Number(expenseQ.rows[0].total_expense);

    /* ================= FINAL NET ================= */
    const finalNetProfit = totalProfit - totalExpense;

    res.json({
      success: true,
      report: {
        purchase_profit: totalProfit,
        total_expense: totalExpense,
        final_profit: finalNetProfit
      }
    });

  } catch (err) {
    console.error("PROFIT REPORT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
