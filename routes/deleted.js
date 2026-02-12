const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   GET ALL DELETED RECORDS (SALES + PURCHASE)
===================================================== */
router.get("/list", async (req, res) => {
  try {
    const q = await db.query(`

      /* BOOKINGS */
      SELECT 'PACKAGE' AS type, ref_no, customer_name, booking_date, total_pkr AS amount
      FROM bookings WHERE is_deleted = true

      UNION ALL
      SELECT 'HOTEL' AS type, ref_no, customer_name, booking_date, total_pkr
      FROM hotels WHERE is_deleted = true

      UNION ALL
      SELECT 'TICKETING' AS type, ref_no, customer_name, booking_date, total_pkr
      FROM ticketing WHERE is_deleted = true

      UNION ALL
      SELECT 'VISA' AS type, ref_no, customer_name, booking_date, total_pkr
      FROM visa WHERE is_deleted = true

      UNION ALL
      SELECT 'TRANSPORT' AS type, ref_no, customer_name, booking_date, total_pkr
      FROM transport WHERE is_deleted = true

      UNION ALL
      SELECT 'ZIYARAT' AS type, ref_no, customer_name, booking_date, total_pkr
      FROM ziyarat WHERE is_deleted = true

      /* PURCHASE - GROUP BY REF WITH CUSTOMER NAME */
      UNION ALL
      SELECT 
        'PURCHASE' AS type,
        pe.ref_no,
        MAX(pe.customer_name) AS customer_name,  -- correct customer name
        MIN(pe.created_at)::date AS booking_date,
        SUM(pe.purchase_pkr) AS amount
      FROM purchase_entries pe
      WHERE pe.is_deleted = true
      GROUP BY pe.ref_no

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



