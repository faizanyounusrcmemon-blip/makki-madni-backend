const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   LOAD PURCHASE (SAVE + EDIT AUTO)
===================================================== */
router.get("/load/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;
    let rows = [];

    // 🔥 CHECK EDIT MODE
    const chk = await db.query(
      `SELECT COUNT(*) FROM purchase_entries WHERE ref_no=$1 AND is_deleted=false`,
      [ref_no]
    );
    const isEdit = Number(chk.rows[0].count) > 0;

    /* =========================
       PACKAGE (PKG-)
    ========================= */
    if (ref_no.startsWith("PKG-")) {
      const q = await db.query(
        `
        SELECT *
        FROM bookings
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Package not found" });

      const r = q.rows[0];

      // ---- TICKETS ----
      if (r.adult_count > 0)
        rows.push({
          item: "Ticket – Adult",
          sale_sar: r.adult_count * r.adult_rate,
          sale_rate: r.flight_sar_rate || 0,
          sale_pkr: r.adult_count * r.adult_rate * (r.flight_sar_rate || 0),
        });

      if (r.child_count > 0)
        rows.push({
          item: "Ticket – Child",
          sale_sar: r.child_count * r.child_rate,
          sale_rate: r.flight_sar_rate || 0,
          sale_pkr: r.child_count * r.child_rate * (r.flight_sar_rate || 0),
        });

      if (r.infant_count > 0)
        rows.push({
          item: "Ticket – Infant",
          sale_sar: r.infant_count * r.infant_rate,
          sale_rate: r.flight_sar_rate || 0,
          sale_pkr: r.infant_count * r.infant_rate * (r.flight_sar_rate || 0),
        });

      // ---- HOTELS ----
      if (Array.isArray(r.hotels))
        r.hotels.forEach((h, i) =>
          rows.push({
            item: `Hotel ${i + 1} - ${h.hotel || ""}`,
            sale_sar: Number(h.total) || 0,
            sale_rate: r.hotel_sar_rate || 0,
            sale_pkr: (Number(h.total) || 0) * (r.hotel_sar_rate || 0),
          })
        );

      // ---- VISA ----
      if (r.visa_persons > 0) {
        const sar = r.visa_total || r.visa_persons * r.visa_rate;
        rows.push({
          item: "Visa",
          sale_sar: sar,
          sale_rate: r.visa_sar_rate || 0,
          sale_pkr: sar * (r.visa_sar_rate || 0),
        });
      }

      // ---- TRANSPORT ----
      if (Array.isArray(r.transport))
        r.transport.forEach((t, i) =>
          rows.push({
            item: `Transport ${i + 1}`,
            sale_sar: Number(t.amount) || 0,
            sale_rate: r.transport_sar_rate || 0,
            sale_pkr:
              (Number(t.amount) || 0) *
              (r.transport_sar_rate || 0),
          })
        );
    }

    /* =========================
       HOTEL ONLY (HOT-)
    ========================= */
    else if (ref_no.startsWith("HOT-")) {
      const q = await db.query(
        `
        SELECT hotel_name, hotel_total, sar_rate
        FROM hotels
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Hotel not found" });

      const r = q.rows[0];

      (r.hotel_name || []).forEach((name, i) => {
        rows.push({
          item: `Hotel ${i + 1} - ${name}`,
          sale_sar: Number(r.hotel_total[i]) || 0,
          sale_rate: r.sar_rate || 0,
          sale_pkr: (Number(r.hotel_total[i]) || 0) * (r.sar_rate || 0),
        });
      });
    }

    /* =========================
       VISA ONLY (VISA-)
    ========================= */
    else if (ref_no.startsWith("VISA-")) {
      const q = await db.query(
        `
        SELECT total_sar, pkr_rate
        FROM visa
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Visa not found" });

      const r = q.rows[0];

      rows.push({
        item: "Visa",
        sale_sar: Number(r.total_sar) || 0,
        sale_rate: r.pkr_rate || 0,
        sale_pkr: (Number(r.total_sar) || 0) * (r.pkr_rate || 0),
      });
    }

    /* =========================
       TRANSPORT ONLY (TRN-)
    ========================= */
    else if (ref_no.startsWith("TRN-")) {
      const q = await db.query(
        `
        SELECT total_sar, pkr_rate
        FROM transport
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Transport not found" });

      const r = q.rows[0];

      rows.push({
        item: "Transport",
        sale_sar: Number(r.total_sar) || 0,
        sale_rate: r.pkr_rate || 0,
        sale_pkr: (Number(r.total_sar) || 0) * (r.pkr_rate || 0),
      });
    }

    /* =========================
       TICKETING ONLY (TIC-)
    ========================= */
    else if (ref_no.startsWith("TIC-")) {
      const q = await db.query(
        `
        SELECT adult_qty, adult_rate,
               child_qty, child_rate,
               infant_qty, infant_rate,
               pkr_rate
        FROM ticketing
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Ticket not found" });

      const r = q.rows[0];

      if (r.adult_qty > 0)
        rows.push({
          item: "Ticket – Adult",
          sale_sar: r.adult_qty * r.adult_rate,
          sale_rate: r.pkr_rate,
          sale_pkr: r.adult_qty * r.adult_rate * r.pkr_rate,
        });

      if (r.child_qty > 0)
        rows.push({
          item: "Ticket – Child",
          sale_sar: r.child_qty * r.child_rate,
          sale_rate: r.pkr_rate,
          sale_pkr: r.child_qty * r.child_rate * r.pkr_rate,
        });

      if (r.infant_qty > 0)
        rows.push({
          item: "Ticket – Infant",
          sale_sar: r.infant_qty * r.infant_rate,
          sale_rate: r.pkr_rate,
          sale_pkr: r.infant_qty * r.infant_rate * r.pkr_rate,
        });
    } else {
      return res.json({ success: false, error: "Invalid Ref No" });
    }

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
     


    /* =========================
       MERGE PURCHASE (EDIT)
    ========================= */
    const p = await db.query(
      `
      SELECT item, purchase_sar, purchase_rate, purchase_pkr, profit
      FROM purchase_entries
      WHERE ref_no=$1 AND is_deleted=false
      `,
      [ref_no]
    );

    rows = rows.map(r => {
      const x = p.rows.find(p => p.item === r.item);
      return {
        ...r,
        purchase_sar: x?.purchase_sar || 0,
        purchase_rate: x?.purchase_rate || 0,
        purchase_pkr: x?.purchase_pkr || 0,
        profit: x?.profit || 0,
      };
    });

    res.json({ success: true, is_edit: isEdit, rows });

  } catch (err) {
    console.error("PURCHASE LOAD ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

/* =====================================================
   SAVE PURCHASE (SAVE + EDIT)
===================================================== */
router.post("/save", async (req, res) => {
  try {
    const { ref_no, items } = req.body;
    if (!ref_no || !Array.isArray(items))
      return res.json({ success: false });

    await db.query(`DELETE FROM purchase_entries WHERE ref_no=$1`, [ref_no]);

    for (const r of items) {
      await db.query(
        `
        INSERT INTO purchase_entries
        (ref_no, item,
         sale_sar, sale_rate, sale_pkr,
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
          r.profit || 0,
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
   PENDING PURCHASE
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


