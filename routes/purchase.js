const express = require("express");
const router = express.Router();
const db = require("../db");

/* =====================================================
   LOAD PURCHASE (DETAIL BASED – FINAL)
===================================================== */
router.get("/load/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;
    let rows = [];

    /* =========================
       PACKAGES (PKG-)
    ========================= */
    if (ref_no.startsWith("PKG-")) {
      const q = await db.query(
        `
        SELECT
          flights,
          adult_count, adult_rate,
          child_count, child_rate,
          infant_count, infant_rate,

          hotels, sar_rate,

          visa_persons, visa_rate, visa_total,

          transport
        FROM bookings
        WHERE ref_no=$1 AND is_deleted=false
        `,
        [ref_no]
      );

      if (!q.rows.length)
        return res.json({ success: false, error: "Package not found" });

      const r = q.rows[0];

      /* ---------- TICKETING (DETAIL) ---------- */
      if (r.adult_count > 0) {
        rows.push({
          item: "Ticket – Adult",
          sale_sar: r.adult_count * r.adult_rate,
          sale_rate: r.sar_rate,
          sale_pkr: r.adult_count * r.adult_rate * r.sar_rate,
        });
      }

      if (r.child_count > 0) {
        rows.push({
          item: "Ticket – Child",
          sale_sar: r.child_count * r.child_rate,
          sale_rate: r.sar_rate,
          sale_pkr: r.child_count * r.child_rate * r.sar_rate,
        });
      }

      if (r.infant_count > 0) {
        rows.push({
          item: "Ticket – Infant",
          sale_sar: r.infant_count * r.infant_rate,
          sale_rate: r.sar_rate,
          sale_pkr: r.infant_count * r.infant_rate * r.sar_rate,
        });
      }

      /* ---------- HOTELS (PER ROW) ---------- */
      (r.hotels || []).forEach((h, i) => {
        rows.push({
          item: `Hotel ${i + 1} - ${h.hotel || ""}`,
          sale_sar: Number(h.total) || 0,
          sale_rate: r.sar_rate || 0,
          sale_pkr: (Number(h.total) || 0) * (r.sar_rate || 0),
        });
      });

      /* ---------- VISA (FIXED) ---------- */
      if (r.visa_persons > 0) {
        rows.push({
          item: "Visa",
          sale_sar: r.visa_total || (r.visa_persons * r.visa_rate),
          sale_rate: r.sar_rate || 0,
          sale_pkr:
            (r.visa_total || (r.visa_persons * r.visa_rate)) *
            (r.sar_rate || 0),
        });
      }

      /* ---------- TRANSPORT (PER ROW) ---------- */
      (r.transport || []).forEach((t, i) => {
        rows.push({
          item: `Transport ${i + 1} - ${t.text || ""}`,
          sale_sar: Number(t.amount) || 0,
          sale_rate: r.sar_rate || 0,
          sale_pkr: (Number(t.amount) || 0) * (r.sar_rate || 0),
        });
      });
    }

    /* =========================
       TICKETING ONLY (TIC-)
    ========================= */
    else if (ref_no.startsWith("TIC-")) {
      const q = await db.query(
        `
        SELECT
          adult_qty, adult_rate,
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

      if (r.adult_qty > 0) {
        rows.push({
          item: "Ticket – Adult",
          sale_sar: r.adult_qty * r.adult_rate,
          sale_rate: r.pkr_rate,
          sale_pkr: r.adult_qty * r.adult_rate * r.pkr_rate,
        });
      }

      if (r.child_qty > 0) {
        rows.push({
          item: "Ticket – Child",
          sale_sar: r.child_qty * r.child_rate,
          sale_rate: r.pkr_rate,
          sale_pkr: r.child_qty * r.child_rate * r.pkr_rate,
        });
      }

      if (r.infant_qty > 0) {
        rows.push({
          item: "Ticket – Infant",
          sale_sar: r.infant_qty * r.infant_rate,
          sale_rate: r.pkr_rate,
          sale_pkr: r.infant_qty * r.infant_rate * r.pkr_rate,
        });
      }
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
   SAVE PURCHASE (UNCHANGED – SAFE)
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

module.exports = router;
