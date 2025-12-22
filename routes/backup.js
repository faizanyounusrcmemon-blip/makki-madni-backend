const express = require("express");
const router = express.Router();

const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const AdmZip = require("adm-zip");
const cron = require("node-cron");
const db = require("../db");
const { Parser } = require("json2csv");
const { createClient } = require("@supabase/supabase-js");

// ================= PASSWORDS =================
const BACKUP_PASSWORD = "8515";
const ADMIN_PASSWORD = "faisalyounus";

// ================= SUPABASE =================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = "mmtbackups";
const TMP = path.join(__dirname, "../tmp");

// ================= TABLES =================
const TABLES = [
  "bookings",
  "hotels",
  "ticketing",
  "visa",
  "transport",
  "purchase_entries",
  "users",
  "bank_transactions",
  "customer_payments",
  "purchase_payments",
];

// ================= CREATE CSV BACKUP =================
async function createBackup() {
  await fs.ensureDir(TMP);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipName = `backup-${stamp}.zip`;
  const zipPath = path.join(TMP, zipName);

  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);

  for (const table of TABLES) {
    try {
      const { rows } = await db.query(`SELECT * FROM ${table}`);
      if (!rows || rows.length === 0) continue;

      const parser = new Parser();
      const csv = parser.parse(rows);

      archive.append(csv, { name: `${table}.csv` });
    } catch (e) {
      console.error("⏭️ Skipped table:", table);
    }
  }

  await archive.finalize();

  const buffer = await fs.readFile(zipPath);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(zipName, buffer, { upsert: true });

  if (error) throw error;

  await fs.remove(zipPath);
  return zipName;
}

// ================= AUTO BACKUP (11 PM) =================
cron.schedule("0 23 * * *", async () => {
  try {
    await createBackup();
    console.log("✅ Auto CSV backup created");
  } catch (e) {
    console.error("❌ Auto backup failed:", e.message);
  }
});

// ================= MANUAL BACKUP =================
router.post("/manual", async (req, res) => {
  if (req.body.password !== BACKUP_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  try {
    const file = await createBackup();
    res.json({ success: true, file });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ================= LIST =================
router.get("/list", async (req, res) => {
  const { data } = await supabase.storage.from(BUCKET).list("", {
    sortBy: { column: "name", order: "desc" },
  });
  res.json({ success: true, files: data || [] });
});

// ================= LAST =================
router.get("/last", async (req, res) => {
  const { data } = await supabase.storage.from(BUCKET).list("", {
    limit: 1,
    sortBy: { column: "name", order: "desc" },
  });

  res.json({
    success: true,
    last_backup: data?.[0]?.created_at || null,
  });
});

// ================= DOWNLOAD =================
router.post("/download", async (req, res) => {
  const { file, password } = req.body;
  if (password !== ADMIN_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  const { data } = await supabase.storage.from(BUCKET).download(file);
  const buffer = Buffer.from(await data.arrayBuffer());

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
  res.send(buffer);
});

// ================= DELETE =================
router.post("/delete", async (req, res) => {
  const { file, password } = req.body;
  if (password !== ADMIN_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  await supabase.storage.from(BUCKET).remove([file]);
  res.json({ success: true });
});

module.exports = router;
