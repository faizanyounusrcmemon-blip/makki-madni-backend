const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   GET ALL DELETED RECORDS (SALES + PURCHASE + SUPPLIERS)
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
      SELECT 'CARD' AS type, ref_no, customer_name, booking_date, total_pkr
      FROM card WHERE is_deleted = true

      UNION ALL
      SELECT 'TRANSPORT' AS type, ref_no, customer_name, booking_date, total_pkr
      FROM transport WHERE is_deleted = true

      UNION ALL
      SELECT 'ZIYARAT' AS type, ref_no, customer_name, booking_date, total_pkr
      FROM ziyarat WHERE is_deleted = true

      /* PURCHASE - get customer_name from any sales table */
      UNION ALL
      SELECT
        'PURCHASE' AS type,
        pe.ref_no,
        COALESCE(
          b.customer_name,
          h.customer_name,
          t.customer_name,
          v.customer_name,
          c.customer_name,
          tr.customer_name,
          z.customer_name,
          '-'
        ) AS customer_name,
        MIN(pe.created_at)::date AS booking_date,
        SUM(pe.purchase_pkr) AS amount
      FROM purchase_entries pe
      LEFT JOIN bookings b ON b.ref_no = pe.ref_no
      LEFT JOIN hotels h ON h.ref_no = pe.ref_no
      LEFT JOIN ticketing t ON t.ref_no = pe.ref_no
      LEFT JOIN visa v ON v.ref_no = pe.ref_no
      LEFT JOIN card v ON v.ref_no = pe.ref_no
      LEFT JOIN transport tr ON tr.ref_no = pe.ref_no
      LEFT JOIN ziyarat z ON z.ref_no = pe.ref_no
      WHERE pe.is_deleted = true
      GROUP BY pe.ref_no, b.customer_name, h.customer_name, t.customer_name, v.customer_name, c.customer_name, tr.customer_name, z.customer_name

      /* SUPPLIERS */
      UNION ALL
      SELECT
        'SUPPLIER' AS type,
        supplier_code AS ref_no,
        supplier_name AS customer_name,
        NULL::date AS booking_date,
        NULL::numeric AS amount
      FROM suppliers
      WHERE is_deleted = true

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
    else if (type === "CARD") table = "card";
    else if (type === "TRANSPORT") table = "transport";
    else if (type === "ZIYARAT") table = "ziyarat";
    else if (type === "PURCHASE") table = "purchase_entries";
    else if (type === "SUPPLIER") table = "suppliers";
    else return res.json({ success: false, error: "Invalid type" });

    const q = await db.query(
      `
      UPDATE ${table}
      SET is_deleted = false
      WHERE ${type === "SUPPLIER" ? "supplier_code" : "ref_no"} = $1
        AND is_deleted = true
      RETURNING ${type === "SUPPLIER" ? "supplier_code" : "ref_no"} AS ref_no
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
   PERMANENT DELETE (🔥 SAFE)
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
    else if (type === "CARD") table = "card";
    else if (type === "TRANSPORT") table = "transport";
    else if (type === "ZIYARAT") table = "ziyarat";
    else if (type === "PURCHASE") table = "purchase_entries";
    else if (type === "SUPPLIER") table = "suppliers";
    else return res.json({ success: false, error: "Invalid type" });

    const q = await db.query(
      `
      DELETE FROM ${table}
      WHERE ${type === "SUPPLIER" ? "supplier_code" : "ref_no"} = $1
        AND is_deleted = true
      RETURNING ${type === "SUPPLIER" ? "supplier_code" : "ref_no"} AS ref_no
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
