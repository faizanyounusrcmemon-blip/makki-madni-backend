const express = require("express");
const router = express.Router();
const db = require("../db");

// ===================================
// AUTO REF GENERATOR
// ===================================
async function generateRef() {
  const r = await db.query("SELECT COUNT(*) FROM hotels");
  return "HOT-" + (Number(r.rows[0].count) + 1).toString().padStart(5, "0");
}

// ===================================
// SAVE / UPDATE HOTEL
// ===================================
router.post("/save", async (req, res) => {
  try {
    const {
      ref_no,
      customer_name,
      booking_date,
      hotels,
      hotels_total,
      total_pkr,
    } = req.body;

    // =========================
    // EDIT MODE (UPDATE)
    // =========================
    if (ref_no) {
      await db.query(
        `
        UPDATE hotels SET
          customer_name=$2,
          booking_date=$3,
          hotel_checkin=$4,
          hotel_checkout=$5,
          hotel_nights=$6,
          hotel_location=$7,
          hotel_name=$8,
          hotel_rooms=$9,
          hotel_type=$10,
          hotel_rate=$11,
          hotel_total=$12,
          hotels_total=$13,
          total_pkr=$14
        WHERE ref_no=$1
        `,
        [
          ref_no,
          customer_name,
          booking_date,
          JSON.stringify(hotels.map(h => h.checkIn)),
          JSON.stringify(hotels.map(h => h.checkOut)),
          JSON.stringify(hotels.map(h => h.nights)),
          JSON.stringify(hotels.map(h => h.location)),
          JSON.stringify(hotels.map(h => h.hotel)),
          JSON.stringify(hotels.map(h => h.rooms)),
          JSON.stringify(hotels.map(h => h.type)),
          JSON.stringify(hotels.map(h => h.rate)),
          JSON.stringify(hotels.map(h => h.total)),
          hotels_total,
          total_pkr,
        ]
      );

      return res.json({ success: true, ref_no });
    }

    // =========================
    // NEW MODE (INSERT)
    // =========================
    const newRef = await generateRef();

    await db.query(
      `
      INSERT INTO hotels
      (
        ref_no,
        customer_name,
        booking_date,
        hotel_checkin,
        hotel_checkout,
        hotel_nights,
        hotel_location,
        hotel_name,
        hotel_rooms,
        hotel_type,
        hotel_rate,
        hotel_total,
        hotels_total,
        total_pkr
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `,
      [
        newRef,
        customer_name,
        booking_date,
        JSON.stringify(hotels.map(h => h.checkIn)),
        JSON.stringify(hotels.map(h => h.checkOut)),
        JSON.stringify(hotels.map(h => h.nights)),
        JSON.stringify(hotels.map(h => h.location)),
        JSON.stringify(hotels.map(h => h.hotel)),
        JSON.stringify(hotels.map(h => h.rooms)),
        JSON.stringify(hotels.map(h => h.type)),
        JSON.stringify(hotels.map(h => h.rate)),
        JSON.stringify(hotels.map(h => h.total)),
        hotels_total,
        total_pkr,
      ]
    );

    res.json({ success: true, ref_no: newRef });

  } catch (err) {
    console.error("HOTEL SAVE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===================================
// GET HOTEL BY REF (EDIT MODE)
// ===================================
router.get("/get/:ref", async (req, res) => {
  const q = await db.query(
    "SELECT * FROM hotels WHERE ref_no=$1 AND is_deleted=false",
    [req.params.ref]
  );

  if (q.rows.length === 0) return res.json({ success: false });

  const r = q.rows[0];

  const hotels = r.hotel_name.map((_, i) => ({
    hotel: r.hotel_name[i],
    location: r.hotel_location[i],
    checkIn: r.hotel_checkin[i],
    checkOut: r.hotel_checkout[i],
    nights: r.hotel_nights[i],
    rooms: r.hotel_rooms[i],
    type: r.hotel_type[i],
    rate: r.hotel_rate[i],
    total: r.hotel_total[i],
  }));

  res.json({
    success: true,
    row: {
      ref_no: r.ref_no,
      customer_name: r.customer_name,
      booking_date: r.booking_date,
      hotels,
      hotels_total: r.hotels_total,
      total_pkr: r.total_pkr,
    },
  });
});

router.delete("/delete/:ref_no", async (req, res) => {
  try {
    const { ref_no } = req.params;

    const q = await db.query(
      `UPDATE hotels
       SET is_deleted = true
       WHERE ref_no = $1
       RETURNING ref_no`,
      [ref_no]
    );

    if (!q.rows.length)
      return res.json({ success: false, error: "hotels not found" });

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
