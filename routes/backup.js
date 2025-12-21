const express = require("express");
const router = express.Router();
const db = require("../db");
const { createClient } = require("@supabase/supabase-js");

// SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = "mmtbackups";

// TABLES
const TABLES = [
  "bookings",
  "hotels",
  "ticketing",
  "visa",
  "transport",
  "purchase_entries",
  "customer_payments",
];

// CSV helper
function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]).join(",");
  const body = rows.map(r =>
    Object.values(r)
      .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  ).join("\n");
  return headers + "\n" + body;
}

// ================= MANUAL BACKUP ONLY =================
router.post("/manual", async (req, res) => {
  if (req.body.password !== "8515") {
    return res.json({ success: false, error: "Wrong password" });
  }

  try {
    let content = {};

    for (const table of TABLES) {
      const { rows } = await db.query(`SELECT * FROM ${table}`);
      content[table] = toCSV(rows);
    }

    const name = `backup-${Date.now()}.json`;

    await supabase.storage.from(BUCKET).upload(
      name,
      Buffer.from(JSON.stringify(content)),
      { upsert: true }
    );

    res.json({ success: true, file: name });

  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ================= LIST =================
router.get("/list", async (req, res) => {
  const { data } = await supabase.storage.from(BUCKET).list("", {
    sortBy: { column: "name", order: "desc" },
  });

  res.json({
    success: true,
    files: (data || []).map(f => ({
      name: f.name,
      time: f.created_at || null,
    })),
  });
});

module.exports = router;
