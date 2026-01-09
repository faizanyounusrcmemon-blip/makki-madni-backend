const express = require("express");
const router = express.Router();
const db = require("../db");

// ==================================
// ALL REPORTS (PKR BASED)
// ==================================
router.get("/all", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT 'Packages' AS type, id, ref_no, customer_name, booking_date, total_pkr
      FROM bookings WHERE is_deleted = false
      UNION ALL
      SELECT 'Ticketing' AS type, id, ref_no, customer_name, booking_date, total_pkr
      FROM ticketing WHERE is_deleted = false
      UNION ALL
      SELECT 'Hotels' AS type, id, ref_no, customer_name, booking_date, total_pkr
      FROM hotels WHERE is_deleted = false
      UNION ALL
      SELECT 'Visa' AS type, id, ref_no, customer_name, booking_date, total_pkr
      FROM visa WHERE is_deleted = false
      UNION ALL
      SELECT 'Transport' AS type, id, ref_no, customer_name, booking_date, total_pkr
      FROM transport WHERE is_deleted = false
      ORDER BY booking_date DESC
    `);
    res.json(q.rows);
  } catch (err) {
    console.error("REPORTS ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================================
// PURCHASE ADJUSTMENTS REPORT
// ==================================
router.get("/purchase-adjustments", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT 
        pa.id,
        pa.ref_no,
        pa.amount,
        pa.payment_method,
        pa.date,
        p.customer_name
      FROM purchase_adjustments pa
      LEFT JOIN purchases p ON p.id = pa.purchase_id
      WHERE pa.is_deleted = false
      ORDER BY pa.date DESC
    `);
    res.json({ rows: q.rows });
  } catch (err) {
    console.error("PURCHASE ADJUSTMENTS ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================================
// SALE ADJUSTMENTS REPORT
// ==================================
router.get("/sale-adjustments", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT 
        sa.id,
        sa.ref_no,
        sa.amount,
        sa.payment_method,
        sa.date,
        b.customer_name
      FROM sale_adjustments sa
      LEFT JOIN bookings b ON b.id = sa.booking_id
      WHERE sa.is_deleted = false
      ORDER BY sa.date DESC
    `);
    res.json({ rows: q.rows });
  } catch (err) {
    console.error("SALE ADJUSTMENTS ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
