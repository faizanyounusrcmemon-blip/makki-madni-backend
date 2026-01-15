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
  UNION ALL
  SELECT ref_no, customer_name FROM ziyarat
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
        UNION ALL
        SELECT ref_no, total_pkr FROM ziyarat WHERE is_deleted=false
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
        UNION ALL
        SELECT ref_no, customer_name FROM ziyarat
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

/* =========================================
   SUPPLIER ADJUSTMENT (SAFE + FINAL)
========================================= */
router.get("/supplier-adjustment-only", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT
        s.id AS supplier_id,
        s.supplier_code,
        s.supplier_name,

        SUM(sp.amount) AS adjustment_amount

      FROM suppliers s
      JOIN supplier_payments sp
        ON sp.supplier_id = s.id

      WHERE LOWER(sp.payment_method) = 'adjustment'
         OR LOWER(sp.type) = 'adjustment'

      GROUP BY s.id, s.supplier_code, s.supplier_name
      HAVING SUM(sp.amount) > 0
      ORDER BY s.supplier_name
    `);

    res.json({
      success: true,
      rows: q.rows
    });

  } catch (err) {
    console.error("SUPPLIER ADJUSTMENT ERROR:", err);
    res.status(500).json({ success:false, error: err.message });
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

      UNION ALL
      SELECT 'Ziyarat', id, ref_no, customer_name, booking_date, total_pkr
      FROM ziyarat WHERE is_deleted=false

      ORDER BY booking_date DESC
    `);

    res.json(q.rows);
  } catch (err) {
    console.error("REPORTS ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =====================================================
   🔹 SUPPLIER WISE PURCHASE REPORT
   - Fetch from purchase_entries
   - Supplier list from suppliers table
===================================================== */
router.get("/supplier-purchase", async (req, res) => {
  try {
    // 1️⃣ Purchase data (purchase > 0 only)
    const purchaseQuery = `
      SELECT
        p.id,
        p.ref_no,
        p.item,
        p.sale_pkr,
        p.purchase_pkr,
        (p.sale_pkr - p.purchase_pkr) AS profit,
        p.created_at AS booking_date,
        s.supplier_name
      FROM purchase_entries p
      LEFT JOIN suppliers s
        ON s.supplier_code = p.supplier_code
      WHERE p.is_deleted = false
        AND p.purchase_pkr > 0
      ORDER BY s.supplier_name, p.created_at DESC
    `;
    const { rows: purchases } = await db.query(purchaseQuery);

    // 2️⃣ Supplier list
    const supplierQuery = `
      SELECT supplier_name
      FROM suppliers
      WHERE is_deleted = false
      ORDER BY supplier_name
    `;
    const { rows: supplierRows } = await db.query(supplierQuery);

    const suppliers = ["ALL", ...supplierRows.map((s) => s.supplier_name)];

    res.json({
      success: true,
      rows: purchases,
      suppliers,
    });
  } catch (err) {
    console.error("SUPPLIER PURCHASE REPORT ERROR:", err);
    res
      .status(500)
      .json({ success: false, error: err.message || "Server error" });
  }
});


module.exports = router;




















