const express = require("express");
const router = express.Router();
const db = require("../db");

// ========================
// AUTO REF GENERATOR
// ========================
async function generateRef() {
  const r = await db.query("SELECT COUNT(*) FROM visa WHERE is_deleted=false");
  return "VISA-" + (Number(r.rows[0].count) + 1).toString().padStart(5, "0");
}

// ========================
// NEXT REF NO ENDPOINT
// ========================
router.get("/next-ref", async (req, res) => {
  try {
    const nextRef = await generateRef();
    res.json({ success: true, next_ref_no: nextRef });
  } catch (err) {
    console.error("NEXT REF ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========================
// SAVE / UPDATE
// ========================
router.post("/save", async (req, res) => {
  try {
    const {
      ref_no,
      customer_name,
      booking_date,
      rows,
      persons,
      rate,
      total_sar,
      pkr_rate,
      total_pkr,
    } = req.body;

    let finalRef = ref_no;

    if (!finalRef) {
      finalRef = await generateRef();

      await db.query(
        `
        INSERT INTO visa
        (ref_no, customer_name, booking_date,
         persons, rate, total_sar, pkr_rate, total_pkr, rows)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          finalRef,
          customer_name,
          booking_date,
          persons,
          rate,
          total_sar,
          pkr_rate,
          total_pkr,
          JSON.stringify(rows || []),
        ]
      );
    } else {
      await db.query(
        `
        UPDATE visa SET
          customer_name=$1,
          booking_date=$2,
          persons=$3,
          rate=$4,
          total_sar=$5,
          pkr_rate=$6,
          total_pkr=$7,
          rows=$8
        WHERE ref_no=$9
        `,
        [
          customer_name,
          booking_date,
          persons,
          rate,
          total_sar,
          pkr_rate,
          total_pkr,
          JSON.stringify(rows || []),
          finalRef,
        ]
      );
    }

    res.json({ success: true, ref_no: finalRef });

  } catch (err) {
    console.error("VISA SAVE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========================
// GET BY REF
// ========================
router.get("/get/:ref", async (req, res) => {
  try {
    const q = await db.query(
      "SELECT * FROM visa WHERE ref_no=$1 AND is_deleted=false",
      [req.params.ref]
    );

    if (q.rows.length === 0) return res.json({ success: false });

    res.json({ success: true, row: q.rows[0] });
  } catch (err) {
    console.error("GET VISA ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========================
// DELETE (SOFT DELETE)
// ========================
router.delete("/delete/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;

    const purchaseCheck = await db.query(
      `SELECT SUM(purchase_pkr) AS total
       FROM purchase_entries
       WHERE ref_no = $1 AND is_deleted = false`,
      [ref_no]
    );

    if (purchaseCheck.rows[0].total > 0) {
      return res.json({
        success: false,
        message: "❌ Cannot delete. Purchase entries exist for this ref. Delete purchases first."
      });
    }

    const paymentCheck = await db.query(
      `SELECT SUM(amount) AS total
       FROM customer_payments
       WHERE ref_no = $1 AND type = 'payment'`,
      [ref_no]
    );

    if (paymentCheck.rows[0].total > 0) {
      return res.json({
        success: false,
        message: "❌ Cannot delete. Payment has been received for this ref. Adjust/delete payments first."
      });
    }

    const q = await db.query(
      `UPDATE visa
       SET is_deleted = true
       WHERE ref_no = $1
       RETURNING ref_no`,
      [ref_no]
    );

    if (!q.rows.length) {
      return res.json({ success: false, error: "Visa not found" });
    }

    res.json({ success: true, message: "✅ Soft deleted successfully" });

  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
