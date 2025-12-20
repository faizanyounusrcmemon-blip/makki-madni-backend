const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   UNIVERSAL PURCHASE LOAD (DETAIL BASED)
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
          flights,
          hotels,
          transport,

          flight_sar_rate,
          hotel_sar_rate,
          transport_sar_rate
        FROM bookings
        WHERE ref_no = $1 AND is_deleted = false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Package not found" });

      const r = q.rows[0];

      // -------- FLIGHTS (per flight row) --------
      (r.flights || []).forEach((f, i) => {
        rows.push({
          item: `Flight ${i + 1} (${f.from || ""} → ${f.to || ""})`,
          sale_sar: 1,
          sale_rate: r.flight_sar_rate || 0,
          sale_pkr: r.flight_sar_rate || 0
        });
      });

      // -------- HOTELS (per hotel row) --------
      (r.hotels || []).forEach((h, i) => {
        rows.push({
          item: `Hotel ${i + 1} - ${h.hotel || ""}`,
          sale_sar: Number(h.total) || 0,
          sale_rate: r.hotel_sar_rate || 0,
          sale_pkr: (Number(h.total) || 0) * (r.hotel_sar_rate || 0)
        });
      });

      // -------- TRANSPORT (per row) --------
      (r.transport || []).forEach((t, i) => {
        rows.push({
          item: `Transport ${i + 1} - ${t.text || ""}`,
          sale_sar: Number(t.amount) || 0,
          sale_rate: r.transport_sar_rate || 0,
          sale_pkr: (Number(t.amount) || 0) * (r.transport_sar_rate || 0)
        });
      });
    }

    // ================= TICKETING =================
    else if (
      ref_no.startsWith("TKT-") ||
      ref_no.startsWith("TK-")
    ) {
      const q = await db.query(
        `
        SELECT total_sar, pkr_rate, total_pkr
        FROM ticketing
        WHERE ref_no = $1 AND is_deleted = false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Ticketing not found" });

      const r = q.rows[0];

      rows.push({
        item: "Ticketing",
        sale_sar: r.total_sar || 0,
        sale_rate: r.pkr_rate || 0,
        sale_pkr: r.total_pkr || 0
      });
    }

    // ================= VISA =================
    else if (ref_no.startsWith("VISA-")) {
      const q = await db.query(
        `
        SELECT total_sar, pkr_rate, total_pkr
        FROM visa
        WHERE ref_no = $1 AND is_deleted = false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Visa not found" });

      const r = q.rows[0];

      rows.push({
        item: "Visa",
        sale_sar: r.total_sar || 0,
        sale_rate: r.pkr_rate || 0,
        sale_pkr: r.total_pkr || 0
      });
    }

    // ================= HOTELS ONLY =================
    else if (ref_no.startsWith("HOT-")) {
      const q = await db.query(
        `
        SELECT hotels
        FROM hotels
        WHERE ref_no = $1 AND is_deleted = false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Hotel not found" });

      (q.rows[0].hotels || []).forEach((h, i) => {
        rows.push({
          item: `Hotel ${i + 1} - ${h.hotel || ""}`,
          sale_sar: Number(h.total) || 0,
          sale_rate: 1,
          sale_pkr: Number(h.total) || 0
        });
      });
    }

    // ================= TRANSPORT ONLY =================
    else if (ref_no.startsWith("TRN-")) {
      const q = await db.query(
        `
        SELECT rows, pkr_rate
        FROM transport
        WHERE ref_no = $1 AND is_deleted = false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Transport not found" });

      const r = q.rows[0];

      (r.rows || []).forEach((t, i) => {
        rows.push({
          item: `Transport ${i + 1} - ${t.text || ""}`,
          sale_sar: Number(t.amount) || 0,
          sale_rate: r.pkr_rate || 0,
          sale_pkr: (Number(t.amount) || 0) * (r.pkr_rate || 0)
        });
      });
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
   PURCHASE SAVE (SAME AS BEFORE)
===================================================== */
router.post("/save", async (req, res) => {
  try {
    const { ref_no, items } = req.body;

    if (!ref_no || !Array.isArray(items) || !items.length)
      return res.json({ success: false, error: "Invalid payload" });

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

module.exports = router;
