const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {
    const { year, month } = req.query;

    /* ================= FILTER CONDITIONS ================= */
    const yCond = year ? `AND EXTRACT(YEAR FROM created_at) = ${year}` : "";
    const mCond = month ? `AND EXTRACT(MONTH FROM created_at) = ${month}` : "";

    /* ================= TOTAL SALES (6 TABLES) ================= */
    const salesQ = await db.query(`
      SELECT
        COALESCE(SUM(total_pkr),0) AS bookings_total,
        0 AS hotels_total,
        0 AS visa_total,
        0 AS ticketing_total,
        0 AS transport_total,
        0 AS ziyarats_total
    `);

    // Or better: sum from each table individually
    const [
      bookingsQ,
      hotelsQ,
      visaQ,
      ticketingQ,
      transportQ,
      ziyaratQ
    ] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(total_pkr),0) AS total FROM bookings WHERE is_deleted=false ${year ? `AND EXTRACT(YEAR FROM created_at) = ${year}` : ""} ${month ? `AND EXTRACT(MONTH FROM created_at) = ${month}` : ""}`),
      db.query(`SELECT COALESCE(SUM(total_pkr),0) AS total FROM hotels WHERE is_deleted=false ${year ? `AND EXTRACT(YEAR FROM created_at) = ${year}` : ""} ${month ? `AND EXTRACT(MONTH FROM created_at) = ${month}` : ""}`),
      db.query(`SELECT COALESCE(SUM(total_pkr),0) AS total FROM visa WHERE is_deleted=false ${year ? `AND EXTRACT(YEAR FROM created_at) = ${year}` : ""} ${month ? `AND EXTRACT(MONTH FROM created_at) = ${month}` : ""}`),
      db.query(`SELECT COALESCE(SUM(total_pkr),0) AS total FROM ticketing WHERE is_deleted=false ${year ? `AND EXTRACT(YEAR FROM created_at) = ${year}` : ""} ${month ? `AND EXTRACT(MONTH FROM created_at) = ${month}` : ""}`),
      db.query(`SELECT COALESCE(SUM(total_pkr),0) AS total FROM transport WHERE is_deleted=false ${year ? `AND EXTRACT(YEAR FROM created_at) = ${year}` : ""} ${month ? `AND EXTRACT(MONTH FROM created_at) = ${month}` : ""}`),
      db.query(`SELECT COALESCE(SUM(total_pkr),0) AS total FROM ziyarats WHERE is_deleted=false ${year ? `AND EXTRACT(YEAR FROM created_at) = ${year}` : ""} ${month ? `AND EXTRACT(MONTH FROM created_at) = ${month}` : ""}`)
    ]);

    const totalSales = Number(bookingsQ.rows[0].total) +
                       Number(hotelsQ.rows[0].total) +
                       Number(visaQ.rows[0].total) +
                       Number(ticketingQ.rows[0].total) +
                       Number(transportQ.rows[0].total) +
                       Number(ziyaratQ.rows[0].total);

    /* ================= TOTAL PURCHASE ================= */
    const purchaseQ = await db.query(`
      SELECT COALESCE(SUM(purchase_pkr),0) AS total
      FROM purchase_entries
      WHERE is_deleted=false ${yCond} ${mCond}
    `);
    const totalPurchase = Number(purchaseQ.rows[0].total);

    /* ================= BASE PROFIT ================= */
    const profitQ = await db.query(`
      SELECT COALESCE(SUM(profit),0) AS total
      FROM purchase_entries
      WHERE is_deleted=false ${yCond} ${mCond}
    `);
    const baseProfit = Number(profitQ.rows[0].total);

    /* ================= SUPPLIER ADJUSTMENT (+) ================= */
    const supplierAdjQ = await db.query(`
      SELECT COALESCE(SUM(amount),0) AS total
      FROM supplier_payments
      WHERE amount IS NOT NULL
        AND LOWER(type) = 'adjustment'
        ${year ? `AND EXTRACT(YEAR FROM payment_date) = ${year}` : ""}
        ${month ? `AND EXTRACT(MONTH FROM payment_date) = ${month}` : ""}
    `);
    const supplierAdjustment = Number(supplierAdjQ.rows[0].total);

    /* ================= CUSTOMER ADJUSTMENT (–) ================= */
    const custAdjQ = await db.query(`
      SELECT COALESCE(SUM(amount),0) AS total
      FROM customer_payments
      WHERE type = 'adjustment'
        ${year ? `AND EXTRACT(YEAR FROM payment_date) = ${year}` : ""}
        ${month ? `AND EXTRACT(MONTH FROM payment_date) = ${month}` : ""}
    `);
    const customerAdjustment = Number(custAdjQ.rows[0].total);

    /* ================= EXPENSE (–) ================= */
    const expQ = await db.query(`
      SELECT COALESCE(SUM(amount),0) AS total
      FROM expense_ledger
      WHERE 1=1
        ${year ? `AND EXTRACT(YEAR FROM expense_date) = ${year}` : ""}
        ${month ? `AND EXTRACT(MONTH FROM expense_date) = ${month}` : ""}
    `);
    const totalExpense = Number(expQ.rows[0].total);

    /* ================= NET PROFIT ================= */
    const netProfit = baseProfit + supplierAdjustment - customerAdjustment - totalExpense;

    /* ================= RESPONSE ================= */
    res.json({
      success: true,
      report: {
        total_sales: Math.round(totalSales),
        total_purchase: Math.round(totalPurchase),
        base_profit: Math.round(baseProfit),
        supplier_adjustment: Math.round(supplierAdjustment),
        customer_adjustment: Math.round(customerAdjustment),
        total_expense: Math.round(totalExpense),
        net_profit: Math.round(netProfit),
      },
    });

  } catch (err) {
    console.error("PROFIT REPORT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
