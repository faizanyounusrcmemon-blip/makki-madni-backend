const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   PROFIT REPORT (MONTHLY / YEARLY)
===================================================== */
router.get("/", async (req, res) => {
  try {
    const { year, month } = req.query;

    let dateFilter = "";
    let params = [];
    let idx = 1;

    if (year) {
      dateFilter += ` AND EXTRACT(YEAR FROM created_at) = $${idx}`;
      params.push(year);
      idx++;
    }

    if (month) {
      dateFilter += ` AND EXTRACT(MONTH FROM created_at) = $${idx}`;
      params.push(month);
      idx++;
    }

    /* ===============================
       TOTAL SALES
    =============================== */
    const sales = await db.query(
      `
      SELECT COALESCE(SUM(total_pkr),0) AS total
      FROM (
        SELECT total_pkr, created_at FROM bookings
        UNION ALL
        SELECT total_pkr, created_at FROM ticketing
        UNION ALL
        SELECT total_pkr, created_at FROM visa
        UNION ALL
        SELECT total_pkr, created_at FROM hotels
        UNION ALL
        SELECT total_pkr, created_at FROM transport
      ) x
      WHERE 1=1 ${dateFilter}
      `,
      params
    );

    /* ===============================
       TOTAL PURCHASE
    =============================== */
    const purchase = await db.query(
      `
      SELECT COALESCE(SUM(purchase_pkr),0) AS total
      FROM purchase_entries
      WHERE 1=1 ${dateFilter.replace(/created_at/g, "created_at")}
      `,
      params
    );

    /* ===============================
       PURCHASE ADJUSTMENT (+)
    =============================== */
    const purchaseAdj = await db.query(
      `
      SELECT COALESCE(SUM(amount),0) AS total
      FROM purchase_payments
      WHERE type = 'adjustment' ${dateFilter.replace(/created_at/g, "payment_date")}
      `,
      params
    );

    /* ===============================
       CUSTOMER ADJUSTMENT (-)
    =============================== */
    const customerAdj = await db.query(
      `
      SELECT COALESCE(SUM(amount),0) AS total
      FROM customer_payments
      WHERE type = 'adjustment' ${dateFilter.replace(/created_at/g, "payment_date")}
      `,
      params
    );

    const totalSales = Number(sales.rows[0].total);
    const totalPurchase = Number(purchase.rows[0].total);
    const plusAdj = Number(purchaseAdj.rows[0].total);
    const minusAdj = Number(customerAdj.rows[0].total);

    const profit =
      totalSales -
      totalPurchase +
      plusAdj -
      minusAdj;

    return res.json({
      success: true,
      report: {
        total_sales: totalSales,
        total_purchase: totalPurchase,
        purchase_adjustment: plusAdj,
        customer_adjustment: minusAdj,
        profit
      }
    });

  } catch (err) {
    console.error("PROFIT REPORT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
