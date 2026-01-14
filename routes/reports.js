const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   🔹 COMMON CUSTOMER SOURCE (ALL MODULES)
===================================================== */
const CUSTOMER_SQL = `
  SELECT ref_no, customer_name FROM bookings
  UNION ALL
  SELECT ref_no, customer_name FROM hotels
  UNION ALL
  SELECT ref_no, customer_name FROM visa
  UNION ALL
  SELECT ref_no, customer_name FROM ticketing
  UNION ALL
  SELECT ref_no, customer_name FROM transport
`;


/* =====================================================
   ✅ SALE ADJUSTMENT REPORT (FINAL FIX)
===================================================== */
router.get("/sale-adjustments", async (req, res) => {
  try {
    const sql = `
      WITH sales AS (
        SELECT ref_no, total_pkr FROM bookings WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, total_pkr FROM hotels WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, total_pkr FROM visa WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, total_pkr FROM ticketing WHERE is_deleted=false
        UNION ALL
        SELECT ref_no, total_pkr FROM transport WHERE is_deleted=false
      ),
      sale_sum AS (
        SELECT ref_no, SUM(total_pkr) AS amount
        FROM sales
        GROUP BY ref_no
      )
      SELECT
        cp.id,
        cp.payment_date AS date,
        cp.ref_no,
        c.customer_name,
        cp.payment_method,
        COALESCE(ss.amount, 0)        AS amount,
        COALESCE(cp.amount, 0)        AS adjustment_amount,
        COALESCE(ss.amount, 0) - COALESCE(cp.amount, 0) AS net_amount
      FROM customer_payments cp

      LEFT JOIN sale_sum ss
        ON ss.ref_no = cp.ref_no

      LEFT JOIN (
        SELECT ref_no, customer_name FROM bookings
        UNION ALL
        SELECT ref_no, customer_name FROM hotels
        UNION ALL
        SELECT ref_no, customer_name FROM visa
        UNION ALL
        SELECT ref_no, customer_name FROM ticketing
        UNION ALL
        SELECT ref_no, customer_name FROM transport
      ) c ON c.ref_no = cp.ref_no

      WHERE cp.type = 'adjustment'
      ORDER BY cp.payment_date DESC, cp.id DESC
    `;

    const { rows } = await db.query(sql);
    res.json({ success: true, rows });

  } catch (err) {
    console.error("SALE ADJUSTMENT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   ✅ PURCHASE ADJUSTMENT REPORT
   🔹 amount = SUM(purchase_entries.purchase_pkr)
   🔹 adjustment_amount = purchase_payments.amount
===================================================== */
router.get("/purchase-adjustments", async (req, res) => {
  try {
    const sql = `
      SELECT
        pp.id,
        pp.payment_date AS date,
        pp.ref_no,
        c.customer_name,
        pp.payment_method,
        p.purchase_pkr AS amount,
        pp.amount AS adjustment_amount
      FROM purchase_payments pp

      LEFT JOIN (
        SELECT ref_no, SUM(purchase_pkr) AS purchase_pkr
        FROM purchase_entries
        WHERE is_deleted=false
        GROUP BY ref_no
      ) p ON p.ref_no = pp.ref_no

      LEFT JOIN (${CUSTOMER_SQL}) c
        ON c.ref_no = pp.ref_no

      WHERE pp.type = 'adjustment'
      ORDER BY pp.payment_date DESC, pp.id DESC
    `;

    const { rows } = await db.query(sql);
    res.json({ success: true, rows });

  } catch (err) {
    console.error("PURCHASE ADJUSTMENT ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   🔹 ALL REPORTS (UNCHANGED)
===================================================== */
router.get("/all", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT 'Packages' AS type, id, ref_no, customer_name, booking_date, total_pkr
      FROM bookings WHERE is_deleted=false

      UNION ALL
      SELECT 'Ticketing', id, ref_no, customer_name, booking_date, total_pkr
      FROM ticketing WHERE is_deleted=false

      UNION ALL
      SELECT 'Hotels', id, ref_no, customer_name, booking_date, total_pkr
      FROM hotels WHERE is_deleted=false

      UNION ALL
      SELECT 'Visa', id, ref_no, customer_name, booking_date, total_pkr
      FROM visa WHERE is_deleted=false

      UNION ALL
      SELECT 'Transport', id, ref_no, customer_name, booking_date, total_pkr
      FROM transport WHERE is_deleted=false

      ORDER BY booking_date DESC
    `);

    res.json(q.rows);
  } catch (err) {
    console.error("REPORTS ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================================
   SUPPLIER WISE PURCHASE REPORT
========================================= */
router.get("/supplier-purchase", async (req, res) => {
  try {
    const q = `
      SELECT 
        p.ref_no,
        p.item,
        p.supplier_name,
        p.purchase_pkr,
        p.sale_pkr,
        (p.sale_pkr - p.purchase_pkr) AS profit,
        b.booking_date
      FROM purchases p
      JOIN bookings b ON b.ref_no = p.ref_no
      WHERE p.is_deleted = false
      ORDER BY p.supplier_name, b.booking_date DESC
    `;

    const { rows } = await db.query(q);

    /* ================= SUPPLIER LIST ================= */
    const suppliers = [
      ...new Set(
        rows
          .map((r) => r.supplier_name)
          .filter(Boolean)
      ),
    ];

    res.json({
      success: true,
      rows,
      suppliers,
    });
  } catch (err) {
    console.error("SUPPLIER PURCHASE REPORT ERROR:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;






