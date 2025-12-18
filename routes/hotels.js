const express = require("express");
const router = express.Router();
const db = require("../db");

// ===================================
// AUTO REF
// ===================================
async function generateRef() {
  const r = await db.query("SELECT COUNT(*) FROM hotels");
  return "HOT-" + (Number(r.rows[0].count) + 1).toString().padStart(5, "0");
}

// ===================================
// SAVE HOTEL BOOKING
// ===================================
router.post("/save", async (req, res) => {
  try {
    const {
      customer_name,
      booking_date,
      hotels,          // array of rows
      hotels_total,    // SAR
      total_pkr        // PKR
    } = req.body;

    const ref_no = await generateRef();

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
        total_pkr
      ]
    );

    res.json({ success: true, ref_no });

  } catch (err) {
    console.error("HOTEL SAVE ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===================================
// GET SINGLE HOTEL (DETAIL VIEW) ✅ FIXED
// ===================================
router.get("/get/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const q = await db.query(
      "SELECT * FROM hotels WHERE id = $1 AND is_deleted = false",
      [id]
    );

    if (q.rows.length === 0) {
      return res.status(404).json({ error: "Hotel record not found" });
    }

    // 🔥 IMPORTANT FIX
    // Frontend direct object expect karta hai
    res.json(q.rows[0]);

  } catch (err) {
    console.error("HOTEL GET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
