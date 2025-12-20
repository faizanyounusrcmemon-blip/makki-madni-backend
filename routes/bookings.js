const express = require("express");
const router = express.Router();
const db = require("../db");

// ============================================
// AUTO REF NO GENERATOR
// ============================================
async function generateRefNo() {
  const result = await db.query("SELECT COUNT(*) FROM bookings");
  const count = Number(result.rows[0].count) + 1;
  return "PKG-" + String(count).padStart(5, "0");
}

// ============================================
// SAVE BOOKING
// ============================================
router.post("/save", async (req, res) => {
  try {
    const d = req.body;

    // ===============================
    // EDIT MODE (UPDATE)
    // ===============================
    if (d.ref_no) {
      await db.query(
        `
        UPDATE bookings SET
          customer_name=$2,
          booking_date=$3,
          adult_count=$4,
          adult_rate=$5,
          child_count=$6,
          child_rate=$7,
          infant_count=$8,
          infant_rate=$9,
          flight_total=$10,
          flights=$11::jsonb,
          hotels=$12::jsonb,
          hotels_total=$13,
          visa_persons=$14,
          visa_rate=$15,
          visa_total=$16,
          transport=$17::jsonb,
          transport_total=$18,
          flight_sar_total=$19,
          hotel_sar_total=$20,
          visa_sar_total=$21,
          transport_sar_total=$22,
          flight_sar_rate=$23,
          hotel_sar_rate=$24,
          visa_sar_rate=$25,
          transport_sar_rate=$26,
          flight_pkr_total=$27,
          hotel_pkr_total=$28,
          visa_pkr_total=$29,
          transport_pkr_total=$30,
          net_pkr_total=$31,
          total_sar=$32,
          total_pkr=$33,
          per_person_qty=$34,
          per_person_final=$35
        WHERE ref_no=$1
        `,
        [
          d.ref_no,
          d.customer_name,
          d.booking_date,
          d.adult_count,
          d.adult_rate,
          d.child_count,
          d.child_rate,
          d.infant_count,
          d.infant_rate,
          d.flight_total,
          JSON.stringify(d.flights),
          JSON.stringify(d.hotels),
          d.hotels_total,
          d.visa_persons,
          d.visa_rate,
          d.visa_total,
          JSON.stringify(d.transport),
          d.transport_total,
          d.flight_sar_total,
          d.hotel_sar_total,
          d.visa_sar_total,
          d.transport_sar_total,
          d.flight_sar_rate,
          d.hotel_sar_rate,
          d.visa_sar_rate,
          d.transport_sar_rate,
          d.flight_pkr_total,
          d.hotel_pkr_total,
          d.visa_pkr_total,
          d.transport_pkr_total,
          d.net_pkr_total,
          d.total_sar,
          d.total_pkr,
          d.per_person_qty,
          d.per_person_final
        ]
      );

      return res.json({ success: true, ref_no: d.ref_no });
    }

    // ===============================
    // NEW MODE (INSERT)
    // ===============================
    const ref_no = await generateRefNo();

    await db.query(
      `
      INSERT INTO bookings (ref_no, customer_name, booking_date)
      VALUES ($1,$2,$3)
      `,
      [ref_no, d.customer_name, d.booking_date]
    );

    res.json({ success: true, ref_no });

  } catch (err) {
    console.error("SAVE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// GET ALL BOOKINGS
// ============================================
router.get("/list", async (req, res) => {
  const q = await db.query(
    "SELECT * FROM bookings WHERE is_deleted = false ORDER BY id DESC"
  );
  res.json(q.rows);
});

// =======================================
// GET BOOKING BY REF NO (EDIT MODE)
// =======================================
router.get("/get/:ref", async (req, res) => {
  try {
    const q = await db.query(
      "SELECT * FROM bookings WHERE ref_no = $1 AND is_deleted = false",
      [req.params.ref]
    );

    if (q.rows.length === 0)
      return res.json({ success: false });

    res.json({ success: true, row: q.rows[0] });

  } catch (err) {
    console.error("GET BOOKING ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===================================
// GET BOOKING HOTEL VOUCHER BY REF
// ===================================
router.get("/voucher/:ref", async (req, res) => {
  try {
    const q = await db.query(
      "SELECT * FROM bookings WHERE ref_no = $1 AND is_deleted = false",
      [req.params.ref]
    );

    if (q.rows.length === 0)
      return res.json({ success: false });

    const row = q.rows[0];

    res.json({
      success: true,
      ref_no: row.ref_no,
      customer_name: row.customer_name,
      booking_date: row.booking_date,
      hotels: row.hotels,
    });

  } catch (err) {
    console.error("VOUCHER ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// SOFT DELETE (BY REF)
// ============================================
router.delete("/delete/:ref", async (req, res) => {
  await db.query(
    "UPDATE bookings SET is_deleted = true WHERE ref_no = $1",
    [req.params.ref]
  );
  res.json({ success: true });
});

router.delete("/delete/:ref_no", async (req, res) => {
  const { ref_no } = req.params;

  const q = await db.query(
    `UPDATE bookings
     SET is_deleted = true
     WHERE ref_no = $1
     RETURNING ref_no`,
    [ref_no]
  );

  if (!q.rows.length)
    return res.json({ success: false });

  res.json({ success: true });
});



module.exports = router;
