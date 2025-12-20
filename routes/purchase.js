const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   UNIVERSAL PURCHASE LOAD
===================================================== */
router.get("/load/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;
    let rows = [];

    // ================= PACKAGES =================
    if (ref_no.startsWith("PKG-")) {
      const q = await db.query(
        `
        SELECT
          flight_sar_total, flight_sar_rate, flight_pkr_total,
          hotel_sar_total, hotel_sar_rate, hotel_pkr_total,
          visa_sar_total, visa_sar_rate, visa_pkr_total,
          transport_sar_total, transport_sar_rate, transport_pkr_total
        FROM bookings
        WHERE ref_no = $1 AND is_deleted = false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Package not found" });

      const r = q.rows[0];

      rows = [
        { item: "Flight", sale_sar: r.flight_sar_total || 0, sale_rate: r.flight_sar_rate || 0, sale_pkr: r.flight_pkr_total || 0 },
        { item: "Hotels", sale_sar: r.hotel_sar_total || 0, sale_rate: r.hotel_sar_rate || 0, sale_pkr: r.hotel_pkr_total || 0 },
        { item: "Visa", sale_sar: r.visa_sar_total || 0, sale_rate: r.visa_sar_rate || 0, sale_pkr: r.visa_pkr_total || 0 },
        { item: "Transport", sale_sar: r.transport_sar_total || 0, sale_rate: r.transport_sar_rate || 0, sale_pkr: r.transport_pkr_total || 0 }
      ];
    }

    // ================= TICKETING =================
    else if (ref_no.startsWith("TKT-")) {
      const q = await db.query(
        `SELECT total_sar, pkr_rate, total_pkr
         FROM ticketing
         WHERE ref_no = $1 AND is_deleted = false`,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Ticketing not found" });

      const r = q.rows[0];
      rows = [{
        item: "Ticketing",
        sale_sar: r.total_sar || 0,
        sale_rate: r.pkr_rate || 0,
        sale_pkr: r.total_pkr || 0
      }];
    }

    // ================= VISA =================
    else if (ref_no.startsWith("VISA-")) {
      const q = await db.query(
        `SELECT total_sar, pkr_rate, total_pkr
         FROM visa
         WHERE ref_no = $1 AND is_deleted = false`,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Visa not found" });

      const r = q.rows[0];
      rows = [{
        item: "Visa",
        sale_sar: r.total_sar || 0,
        sale_rate: r.pkr_rate || 0,
        sale_pkr: r.total_pkr || 0
      }];
    }

    // ================= HOTELS =================
    else if (ref_no.startsWith("HOT-")) {
      const q = await db.query(
        `SELECT hotels_total, total_pkr
         FROM hotels
         WHERE ref_no = $1 AND is_deleted = false`,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Hotel not found" });

      const r = q.rows[0];
      rows = [{
        item: "Hotels",
        sale_sar: r.hotels_total || 0,
        sale_rate: 1,
        sale_pkr: r.total_pkr || 0
      }];
    }

    // ================= TRANSPORT =================
    else if (ref_no.startsWith("TRN-")) {
      const q = await db.query(
        `SELECT total_sar, pkr_rate, total_pkr
         FROM transport
         WHERE ref_no = $1 AND is_deleted = false`,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Transport not found" });

      const r = q.rows[0];
      rows = [{
        item: "Transport",
        sale_sar: r.total_sar || 0,
        sale_rate: r.pkr_rate || 0,
        sale_pkr: r.total_pkr || 0
      }];
    }

    else {
      return res.json({ success: false, error: "Invalid Ref No" });
    }

    res.json({ success: true, rows });

  } catch (err) {
    console.error("PURCHASE LOAD ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});


/* =====================================================
   PURCHASE SAVE
===================================================== */
router.post("/save", async (req, res) => {
  try {
    const { ref_no, items } = req.body;

    if (!ref_no || !Array.isArray(items) || !items.length)
      return res.json({ success: false, error: "Invalid payload" });

    // re-save
    await db.query(`DELETE FROM purchase_entries WHERE ref_no = $1`, [ref_no]);

    for (const r of items) {
      await db.query(
        `
        INSERT INTO purchase_entries
        (ref_no, item, sale_sar, sale_rate, sale_pkr,
         purchase_sar, purchase_rate, purchase_pkr, profit)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          ref_no,
          r.item,
          r.sale_sar || 0,
          r.sale_rate || 0,
          r.sale_pkr || 0,
          r.purchase_sar || 0,
          r.purchase_rate || 0,
          r.purchase_pkr || 0,
          r.profit || 0
        ]
      );
    }

    res.json({ success: true });

  } catch (err) {
    console.error("PURCHASE SAVE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});


/* =====================================================
   PURCHASE LIST (DATE FILTER + SEARCH)
===================================================== */
router.get("/list", async (req, res) => {
  try {
    const { from, to, ref } = req.query;

    let where = `WHERE is_deleted = false`;
    let params = [];
    let i = 1;

    if (from && to) {
      where += ` AND DATE(created_at) BETWEEN $${i} AND $${i + 1}`;
      params.push(from, to);
      i += 2;
    }

    if (ref) {
      where += ` AND ref_no ILIKE $${i}`;
      params.push(`%${ref}%`);
    }

    const q = await db.query(
      `
      SELECT
        ref_no,
        SUM(sale_pkr)     AS sale_pkr,
        SUM(purchase_pkr) AS purchase_pkr,
        SUM(profit)       AS profit,
        MIN(created_at)   AS created_at
      FROM purchase_entries
      ${where}
      GROUP BY ref_no
      ORDER BY created_at DESC
      `,
      params
    );

    res.json({ success: true, rows: q.rows });

  } catch (err) {
    console.error("PURCHASE LIST ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});


/* =====================================================
   PURCHASE SOFT DELETE
===================================================== */
router.delete("/delete/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;

    const q = await db.query(
      `
      UPDATE purchase_entries
      SET is_deleted = true
      WHERE ref_no = $1
      RETURNING ref_no
      `,
      [ref_no]
    );

    if (!q.rows.length)
      return res.json({ success: false, error: "Purchase not found" });

    res.json({ success: true });

  } catch (err) {
    console.error("PURCHASE DELETE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});
/* =====================================================
   PENDING PURCHASE LIST (SALE DONE BUT NO PURCHASE)
===================================================== */
router.get("/pending", async (req, res) => {
  try {
    const q = await db.query(`
      SELECT ref_no, MIN(created_at) AS created_at
      FROM (
        -- PACKAGES
        SELECT ref_no, created_at FROM bookings
        WHERE is_deleted = false

        UNION ALL
        -- TICKETING
        SELECT ref_no, created_at FROM ticketing
        WHERE is_deleted = false

        UNION ALL
        -- HOTELS
        SELECT ref_no, created_at FROM hotels
        WHERE is_deleted = false

        UNION ALL
        -- VISA
        SELECT ref_no, created_at FROM visa
        WHERE is_deleted = false

        UNION ALL
        -- TRANSPORT
        SELECT ref_no, created_at FROM transport
        WHERE is_deleted = false
      ) s
      WHERE ref_no NOT IN (
        SELECT DISTINCT ref_no
        FROM purchase_entries
        WHERE is_deleted = false
      )
      GROUP BY ref_no
      ORDER BY created_at DESC
    `);

    res.json({ success: true, rows: q.rows });

  } catch (err) {
    console.error("PENDING PURCHASE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});


module.exports = router;
