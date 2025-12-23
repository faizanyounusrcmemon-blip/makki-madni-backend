const express = require("express");
const router = express.Router();
const db = require("../db");

// ==================================
// ALL REPORTS (SAFE & STABLE)
// ==================================
router.get("/all", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT 
        'Packages' AS type,
        ref_no,
        customer_name,
        booking_date,
        total_pkr
      FROM bookings
      WHERE is_deleted = false

      UNION ALL
      SELECT 
        'Ticketing' AS type,
        ref_no,
        customer_name,
        booking_date,
        total_pkr
      FROM ticketing
      WHERE is_deleted = false

      UNION ALL
      SELECT 
        'Hotels' AS type,
        ref_no,
        customer_name,
        booking_date,
        total_pkr
      FROM hotels
      WHERE is_deleted = false

      UNION ALL
      SELECT 
        'Visa' AS type,
        ref_no,
        customer_name,
        booking_date,
        total_pkr
      FROM visa
      WHERE is_deleted = false

      UNION ALL
      SELECT 
        'Transport' AS type,
        ref_no,
        customer_name,
        booking_date,
        total_pkr
      FROM transport
      WHERE is_deleted = false

      ORDER BY booking_date DESC
    `);

    // ✅ ALWAYS ARRAY
    res.json(q.rows || []);

  } catch (err) {
    console.error("REPORTS ERROR:", err.message);

    // 🔥 IMPORTANT FIX
    res.json([]); // frontend crash se bachao
  }
});

module.exports = router;
