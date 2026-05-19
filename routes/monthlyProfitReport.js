const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {
    const { year } = req.query;
    const selectedYear = year || new Date().getFullYear();

    const months = [];

    for (let month = 1; month <= 12; month++) {

      /* ================= SALES ================= */
      const [
        bookingsQ,
        hotelsQ,
        visaQ,
        cardQ,
        ticketingQ,
        transportQ,
        ziyaratQ
      ] = await Promise.all([
        db.query(`
          SELECT COALESCE(SUM(total_pkr),0) AS total
          FROM bookings
          WHERE is_deleted=false
          AND EXTRACT(YEAR FROM created_at) = $1
          AND EXTRACT(MONTH FROM created_at) = $2
        `, [selectedYear, month]),

        db.query(`
          SELECT COALESCE(SUM(total_pkr),0) AS total
          FROM hotels
          WHERE is_deleted=false
          AND EXTRACT(YEAR FROM created_at) = $1
          AND EXTRACT(MONTH FROM created_at) = $2
        `, [selectedYear, month]),

        db.query(`
          SELECT COALESCE(SUM(total_pkr),0) AS total
          FROM visa
          WHERE is_deleted=false
          AND EXTRACT(YEAR FROM created_at) = $1
          AND EXTRACT(MONTH FROM created_at) = $2
        `, [selectedYear, month]),

        db.query(`
          SELECT COALESCE(SUM(total_pkr),0) AS total
          FROM card
          WHERE is_deleted=false
          AND EXTRACT(YEAR FROM created_at) = $1
          AND EXTRACT(MONTH FROM created_at) = $2
        `, [selectedYear, month]),

        db.query(`
          SELECT COALESCE(SUM(total_pkr),0) AS total
          FROM ticketing
          WHERE is_deleted=false
          AND EXTRACT(YEAR FROM created_at) = $1
          AND EXTRACT(MONTH FROM created_at) = $2
        `, [selectedYear, month]),

        db.query(`
          SELECT COALESCE(SUM(total_pkr),0) AS total
          FROM transport
          WHERE is_deleted=false
          AND EXTRACT(YEAR FROM created_at) = $1
          AND EXTRACT(MONTH FROM created_at) = $2
        `, [selectedYear, month]),

        db.query(`
          SELECT COALESCE(SUM(total_pkr),0) AS total
          FROM ziyarat
          WHERE is_deleted=false
          AND EXTRACT(YEAR FROM created_at) = $1
          AND EXTRACT(MONTH FROM created_at) = $2
        `, [selectedYear, month]),
      ]);

      const totalSales =
        Number(bookingsQ.rows[0].total) +
        Number(hotelsQ.rows[0].total) +
        Number(visaQ.rows[0].total) +
        Number(cardQ.rows[0].total) +
        Number(ticketingQ.rows[0].total) +
        Number(transportQ.rows[0].total) +
        Number(ziyaratQ.rows[0].total);

      /* ================= PURCHASE ================= */
      const purchaseQ = await db.query(`
        SELECT
          COALESCE(SUM(purchase_pkr),0) AS purchase,
          COALESCE(SUM(profit),0) AS profit
        FROM purchase_entries
        WHERE is_deleted=false
        AND EXTRACT(YEAR FROM created_at) = $1
        AND EXTRACT(MONTH FROM created_at) = $2
      `, [selectedYear, month]);

      const totalPurchase = Number(purchaseQ.rows[0].purchase);
      const baseProfit = Number(purchaseQ.rows[0].profit);

      /* ================= SUPPLIER ADJUSTMENT ================= */
      const supplierAdjQ = await db.query(`
        SELECT COALESCE(SUM(sp.amount),0) AS total
        FROM supplier_payments sp
        INNER JOIN suppliers s ON s.id = sp.supplier_id
        WHERE LOWER(sp.type)='adjustment'
        AND s.is_deleted=false
        AND EXTRACT(YEAR FROM sp.payment_date) = $1
        AND EXTRACT(MONTH FROM sp.payment_date) = $2
      `, [selectedYear, month]);

      const supplierAdjustment = Number(supplierAdjQ.rows[0].total);

      /* ================= CUSTOMER ADJUSTMENT ================= */
      const customerAdjQ = await db.query(`
        SELECT COALESCE(SUM(amount),0) AS total
        FROM customer_payments
        WHERE LOWER(type)='adjustment'
        AND EXTRACT(YEAR FROM payment_date) = $1
        AND EXTRACT(MONTH FROM payment_date) = $2
      `, [selectedYear, month]);

      const customerAdjustment = Number(customerAdjQ.rows[0].total);

      /* ================= EXPENSE ================= */
      const expenseQ = await db.query(`
        SELECT COALESCE(SUM(amount),0) AS total
        FROM expense_ledger
        WHERE EXTRACT(YEAR FROM expense_date) = $1
        AND EXTRACT(MONTH FROM expense_date) = $2
      `, [selectedYear, month]);

      const totalExpense = Number(expenseQ.rows[0].total);

      /* ================= NET PROFIT ================= */
      const netProfit =
        baseProfit +
        supplierAdjustment -
        customerAdjustment -
        totalExpense;

      months.push({
        month,
        month_name: new Date(0, month - 1).toLocaleString("en", {
          month: "long",
        }),
        total_sales: Math.round(totalSales),
        total_purchase: Math.round(totalPurchase),
        base_profit: Math.round(baseProfit),
        supplier_adjustment: Math.round(supplierAdjustment),
        customer_adjustment: Math.round(customerAdjustment),
        total_expense: Math.round(totalExpense),
        net_profit: Math.round(netProfit),
      });
    }

    res.json({
      success: true,
      year: selectedYear,
      months,
    });

  } catch (err) {
    console.error("MONTHLY PROFIT REPORT ERROR:", err);
    res.json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;