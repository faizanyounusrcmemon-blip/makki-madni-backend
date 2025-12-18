const express = require("express");
const router = express.Router();
const db = require("../db");

// AUTO REF NO
async function generateRefNo() {
  const result = await db.query("SELECT COUNT(*) FROM ticketing");
  const count = Number(result.rows[0].count) + 1;
  return "TIC-" + count.toString().padStart(5, "0");
}

// ========================
// SAVE TICKETING
// ========================
router.post("/save", async (req, res) => {
  try {
    const {
      customer_name,
      booking_date,

      flights, // [{from,to,date}]

      adultQty,
      adultRate,
      childQty,
      childRate,
      infantQty,
      infantRate,

      total_sar,
      pkr_rate,
      total_pkr
    } = req.body;

    const ref_no = await generateRefNo();

    await db.query(
      `INSERT INTO ticketing
      (
        ref_no,
        customer_name,
        booking_date,

        flight_from,
        flight_to,
        flight_date,

        adult_qty,
        adult_rate,
        child_qty,
        child_rate,
        infant_qty,
        infant_rate,

        total_sar,
        pkr_rate,
        total_pkr
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `,
      [
        ref_no,
        customer_name,
        booking_date,

        JSON.stringify(flights.map(f => f.from)),
        JSON.stringify(flights.map(f => f.to)),
        JSON.stringify(flights.map(f => f.date)),

        adultQty,
        adultRate,
        childQty,
        childRate,
        infantQty,
        infantRate,

        total_sar,
        pkr_rate,
        total_pkr
      ]
    );

    res.json({ success: true, ref_no });

  } catch (err) {
    console.log("TICKETING SAVE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========================
// LIST ALL
// ========================
router.get("/list", async (req, res) => {
  const q = await db.query(
    "SELECT * FROM ticketing WHERE is_deleted = false ORDER BY id DESC"
  );
  res.json(q.rows);
});

// ========================
// GET ONE
// ========================
router.get("/get/:id", async (req, res) => {
  const q = await db.query("SELECT * FROM ticketing WHERE id = $1", [
    req.params.id,
  ]);
  res.json(q.rows[0]);
});

// ========================
// DELETE
// ========================
router.delete("/delete/:id", async (req, res) => {
  await db.query("UPDATE ticketing SET is_deleted = true WHERE id = $1", [
    req.params.id,
  ]);
  res.json({ success: true });
});

module.exports = router;
