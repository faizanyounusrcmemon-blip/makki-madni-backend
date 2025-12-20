const express = require("express");
const router = express.Router();
const db = require("../db");

// AUTO REF NO
async function generateRefNo() {
  const r = await db.query("SELECT COUNT(*) FROM ticketing");
  return "TIC-" + (Number(r.rows[0].count) + 1).toString().padStart(5, "0");
}

// ========================
// SAVE / UPDATE
// ========================
router.post("/save", async (req, res) => {
  try {
    const {
      ref_no,
      customer_name,
      booking_date,
      flights,
      adultQty,
      adultRate,
      childQty,
      childRate,
      infantQty,
      infantRate,
      total_sar,
      pkr_rate,
      total_pkr,
    } = req.body;

    let finalRef = ref_no;

    if (!finalRef) {
      finalRef = await generateRefNo();

      await db.query(
        `
        INSERT INTO ticketing
        (ref_no, customer_name, booking_date,
         flight_from, flight_to, flight_date,
         adult_qty, adult_rate,
         child_qty, child_rate,
         infant_qty, infant_rate,
         total_sar, pkr_rate, total_pkr)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `,
        [
          finalRef,
          customer_name,
          booking_date,
          JSON.stringify(flights.map(f => f.from)),
          JSON.stringify(flights.map(f => f.to)),
          JSON.stringify(flights.map(f => f.date)),
          adultQty, adultRate,
          childQty, childRate,
          infantQty, infantRate,
          total_sar, pkr_rate, total_pkr,
        ]
      );
    } else {
      await db.query(
        `
        UPDATE ticketing SET
          customer_name=$1,
          booking_date=$2,
          flight_from=$3,
          flight_to=$4,
          flight_date=$5,
          adult_qty=$6,
          adult_rate=$7,
          child_qty=$8,
          child_rate=$9,
          infant_qty=$10,
          infant_rate=$11,
          total_sar=$12,
          pkr_rate=$13,
          total_pkr=$14
        WHERE ref_no=$15
        `,
        [
          customer_name,
          booking_date,
          JSON.stringify(flights.map(f => f.from)),
          JSON.stringify(flights.map(f => f.to)),
          JSON.stringify(flights.map(f => f.date)),
          adultQty, adultRate,
          childQty, childRate,
          infantQty, infantRate,
          total_sar, pkr_rate, total_pkr,
          finalRef,
        ]
      );
    }

    res.json({ success: true, ref_no: finalRef });

  } catch (err) {
    console.error("TICKETING SAVE ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

// ========================
// GET BY REF (EDIT / VIEW)
// ========================
router.get("/get/:ref", async (req, res) => {
  const q = await db.query(
    "SELECT * FROM ticketing WHERE ref_no=$1 AND is_deleted=false",
    [req.params.ref]
  );

  if (q.rows.length === 0)
    return res.json({ success: false });

  res.json({ success: true, row: q.rows[0] });
});

router.delete("/delete/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;

    const q = await db.query(
      `UPDATE ticketing
       SET is_deleted = true
       WHERE ref_no = $1
       RETURNING ref_no`,
      [ref_no]
    );

    if (!q.rows.length)
      return res.json({ success: false, error: "Ticketing not found" });

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});


module.exports = router;
