const express = require("express");
const router = express.Router();
const db = require("../db");

// ============================================
// AUTO REF NO GENERATOR (ONLY FOR NEW)
// ============================================
async function generateRefNo() {
  const result = await db.query("SELECT COUNT(*) FROM bookings");
  const count = Number(result.rows[0].count) + 1;
  return "PKG-" + String(count).padStart(5, "0");
}

// ============================================
// SAVE / UPDATE BOOKING
// ============================================
router.post("/save", async (req, res) => {
  try {
    const d = req.body;

    // ============================
    // CHECK EXIST BY REF NO (EDIT MODE)
    // ============================
    let exists = null;

    if (d.ref_no) {
      const q = await db.query(
        "SELECT id FROM bookings WHERE ref_no = $1 AND is_deleted = false",
        [d.ref_no]
      );
      if (q.rows.length > 0) exists = q.rows[0];
    }

    // ============================
    // UPDATE (EDIT)
    // ============================
    if (exists) {
      await db.query(
        `
        UPDATE bookings SET
          customer_name = $1,
          booking_date = $2,

          adult_count = $3,
          adult_rate = $4,
          child_count = $5,
          child_rate = $6,
          infant_count = $7,
          infant_rate = $8,
          flight_total = $9,

          flights = $10::jsonb,

          hotels = $11::jsonb,
          hotels_total = $12,

          visa_persons = $13,
          visa_rate = $14,
          visa_total = $15,

          transport = $16::jsonb,
          transport_total = $17,

          flight_sar_total = $18,
          hotel_sar_total = $19,
          visa_sar_total = $20,
          transport_sar_total = $21,

          flight_sar_rate = $22,
          hotel_sar_rate = $23,
          visa_sar_rate = $24,
          transport_sar_rate = $25,

          flight_pkr_total = $26,
          hotel_pkr_total = $27,
          visa_pkr_total = $28,
          transport_pkr_total = $29,

          net_pkr_total = $30,

          total_sar = $31,
          total_pkr = $32,
          per_person_qty = $33,
          per_person_final = $34,

          updated_at = NOW()
        WHERE ref_no = $35
        `,
        [
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
          d.per_person_final,

          d.ref_no, // 🔑 SAME REF
        ]
      );

      return res.json({ success: true, ref_no: d.ref_no });
    }

    // ============================
    // INSERT (NEW BOOKING)
    // ============================
    const ref_no = await generateRefNo();

    await db.query(
      `
      INSERT INTO bookings (
        ref_no, customer_name, booking_date,

        adult_count, adult_rate,
        child_count, child_rate,
        infant_count, infant_rate,
        flight_total,

        flights,

        hotels, hotels_total,

        visa_persons, visa_rate, visa_total,

        transport, transport_total,

        flight_sar_total, hotel_sar_total,
        visa_sar_total, transport_sar_total,

        flight_sar_rate, hotel_sar_rate,
        visa_sar_rate, transport_sar_rate,

        flight_pkr_total, hotel_pkr_total,
        visa_pkr_total, transport_pkr_total,

        net_pkr_total,

        total_sar, total_pkr,
        per_person_qty, per_person_final
      )
      VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,$8,$9,$10,
        $11::jsonb,
        $12::jsonb,$13,
        $14,$15,$16,
        $17::jsonb,$18,
        $19,$20,$21,$22,
        $23,$24,$25,$26,
        $27,$28,$29,$30,
        $31,
        $32,$33,$34,$35
      )
      `,
      [
        ref_no,
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

    res.json({ success: true, ref_no });

  } catch (err) {
    console.error("BOOKING SAVE ERROR:", err);
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
// GET BOOKING BY REF NO (EDIT / VIEW)
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
// GET HOTEL VOUCHER BY REF
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

module.exports = router;
