const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   GET ALL DELETED RECORDS (SALES + PURCHASE)
===================================================== */
router.get("/list", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT 'PACKAGE' AS type, ref_no, customer_name, booking_date
      FROM bookings WHERE is_deleted = true

      UNION ALL
      SELECT 'HOTEL' AS type, ref_no, customer_name, booking_date
      FROM hotels WHERE is_deleted = true

      UNION ALL
      SELECT 'TICKETING' AS type, ref_no, customer_name, booking_date
      FROM ticketing WHERE is_deleted = true

      UNION ALL
      SELECT 'VISA' AS type, ref_no, customer_name, booking_date
      FROM visa WHERE is_deleted = true

      UNION ALL
      SELECT 'TRANSPORT' AS type, ref_no, customer_name, booking_date
      FROM transport WHERE is_deleted = true

      UNION ALL
      SELECT 'ZIYARAT' AS type, ref_no, customer_name, booking_date
      FROM ziyarat WHERE is_deleted = true


      UNION ALL
      SELECT 'PURCHASE' AS type, ref_no, '-' AS customer_name, MIN(created_at)::date AS booking_date
      FROM purchase_entries
      WHERE is_deleted = true
      GROUP BY ref_no

      ORDER BY booking_date DESC NULLS LAST
    `);

    res.json({ success: true, rows: q.rows });

  } catch (err) {
    console.error("DELETED LIST ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   RESTORE RECORD
   👉 sirf deleted (is_deleted=true) ko restore kare
===================================================== */
router.post("/restore", async (req, res) => {
  try {
    const { type, ref_no } = req.body;

    let table = "";

    if (type === "PACKAGE") table = "bookings";
    else if (type === "HOTEL") table = "hotels";
    else if (type === "TICKETING") table = "ticketing";
    else if (type === "VISA") table = "visa";
    else if (type === "TRANSPORT") table = "transport";
    else if (type === "ZIYARAT") table = "ziyarat";
    else if (type === "PURCHASE") table = "purchase_entries";
    else return res.json({ success: false, error: "Invalid type" });

    const q = await db.query(
      `
      UPDATE ${table}
      SET is_deleted = false
      WHERE ref_no = $1
        AND is_deleted = true
      RETURNING ref_no
      `,
      [ref_no]
    );

    if (!q.rows.length) {
      return res.json({
        success: false,
        error: "No deleted record found to restore"
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("RESTORE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   PERMANENT DELETE (🔥 FIXED & SAFE)
   👉 sirf is_deleted=true wali rows delete hongi
===================================================== */
router.post("/permanent-delete", async (req, res) => {
  try {
    const { type, ref_no, password } = req.body;

    if (password !== "7865") {
      return res.json({ success: false, error: "Invalid password" });
    }

    let table = "";

    if (type === "PACKAGE") table = "bookings";
    else if (type === "HOTEL") table = "hotels";
    else if (type === "TICKETING") table = "ticketing";
    else if (type === "VISA") table = "visa";
    else if (type === "TRANSPORT") table = "transport";
    else if (type === "ZIYARAT") table = "ziyarat";
    else if (type === "PURCHASE") table = "purchase_entries";
    else return res.json({ success: false, error: "Invalid type" });

    // 🔥 CRITICAL FIX
    // ❌ active rows (is_deleted=false) untouched
    // ✅ sirf deleted rows permanently remove
    const q = await db.query(
      `
      DELETE FROM ${table}
      WHERE ref_no = $1
        AND is_deleted = true
      RETURNING ref_no
      `,
      [ref_no]
    );

    if (!q.rows.length) {
      return res.json({
        success: false,
        error: "No deleted record found to permanently delete"
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("PERMANENT DELETE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;

