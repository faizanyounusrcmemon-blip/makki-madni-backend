const express = require("express");
const router = express.Router();
const db = require("../db");

// AUTO REF GENERATOR
async function generateRef() {
  const r = await db.query("SELECT COUNT(*) FROM transport");
  return "TRN-" + (Number(r.rows[0].count) + 1).toString().padStart(5, "0");
}

// =============================
// SAVE TRANSPORT
// =============================
router.post("/save", async (req, res) => {
  try {
    const {
      customer_name,
      booking_date,
      rows,        // [{ description, sar, rate, pkr }]
      total_sar,
      pkr_rate,
      total_pkr,
    } = req.body;

    const ref_no = await generateRef();

    await db.query(
      `
      INSERT INTO transport
      (
        ref_no,
        customer_name,
        booking_date,
        rows,
        total_sar,
        pkr_rate,
        total_pkr
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        ref_no,
        customer_name,
        booking_date,
        JSON.stringify(rows), // ✅ jsonb FIX
        total_sar,
        pkr_rate,
        total_pkr,
      ]
    );

    res.json({ success: true, ref_no });

  } catch (err) {
    console.error("TRANSPORT SAVE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

// LIST
router.get("/list", async (req, res) => {
  const q = await db.query(
    "SELECT * FROM transport WHERE is_deleted = false ORDER BY id DESC"
  );
  res.json(q.rows);
});

// GET ONE
router.get("/get/:id", async (req, res) => {
  const q = await db.query("SELECT * FROM transport WHERE id = $1", [
    req.params.id,
  ]);
  res.json(q.rows[0]);
});

module.exports = router;
