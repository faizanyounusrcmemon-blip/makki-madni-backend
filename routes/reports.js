const express = require("express");
const router = express.Router();
const db = require("../db");

// ==================================
// ALL REPORTS (PKR BASED)
// ==================================
router.get("/all", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT 
        'Packages' AS type,
        id,
        ref_no,
        customer_name,
        booking_date,
        total_pkr
      FROM bookings
      WHERE is_deleted = false

      UNION ALL

      SELECT 
        'Ticketing' AS type,
        id,
        ref_no,
        customer_name,
        booking_date,
        total_pkr
      FROM ticketing
      WHERE is_deleted = false

      UNION ALL

      SELECT 
        'Hotels' AS type,
        id,
        ref_no,
        customer_name,
        booking_date,
        total_pkr        -- ✅ PKR column
      FROM hotels
      WHERE is_deleted = false

      UNION ALL

      SELECT 
        'Visa' AS type,
        id,
        ref_no,
        customer_name,
        booking_date,
        total_pkr
      FROM visa
      WHERE is_deleted = false

      UNION ALL

      SELECT 
        'Transport' AS type,
        id,
        ref_no,
        customer_name,
        booking_date,
        total_pkr
      FROM transport
      WHERE is_deleted = false

      ORDER BY booking_date DESC
    `);

    res.json(q.rows);

  } catch (err) {
    console.error("REPORTS ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
