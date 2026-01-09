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
   ✅ SALE ADJUSTMENT REPORT (BANK + CASH)
===================================================== */
router.get("/sale-adjustments", async (req, res) => {
  try {
    const sql = `
      SELECT
        cp.id,
        cp.payment_date AS date,
        cp.ref_no,
        c.customer_name,
        cp.payment_method,
        cp.amount
      FROM customer_payments cp
      LEFT JOIN (${CUSTOMER_SQL}) c
        ON c.ref_no = cp.ref_no
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
   ✅ PURCHASE ADJUSTMENT REPORT (BANK + CASH)
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
        pp.amount
      FROM purchase_payments pp
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
   🔹 EXISTING ALL REPORT (UNCHANGED)
===================================================== */
router.get("/all", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT 'Packages' AS type, id, ref_no, customer_name, booking_date, total_pkr
      FROM bookings WHERE is_deleted = false

      UNION ALL
      SELECT 'Ticketing', id, ref_no, customer_name, booking_date, total_pkr
      FROM ticketing WHERE is_deleted = false

      UNION ALL
      SELECT 'Hotels', id, ref_no, customer_name, booking_date, total_pkr
      FROM hotels WHERE is_deleted = false

      UNION ALL
      SELECT 'Visa', id, ref_no, customer_name, booking_date, total_pkr
      FROM visa WHERE is_deleted = false

      UNION ALL
      SELECT 'Transport', id, ref_no, customer_name, booking_date, total_pkr
      FROM transport WHERE is_deleted = false

      ORDER BY booking_date DESC
    `);

    res.json(q.rows);
  } catch (err) {
    console.error("REPORTS ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
