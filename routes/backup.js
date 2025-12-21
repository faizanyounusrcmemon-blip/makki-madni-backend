const express = require("express");
const router = express.Router();

const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const AdmZip = require("adm-zip");
const cron = require("node-cron");
const db = require("../db");
const { createClient } = require("@supabase/supabase-js");

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

// ================= CSV =================
function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]).join(",");
  const body = rows
    .map(r =>
      Object.values(r)
        .map(v =>
          v === null ? "" : `"${String(v).replace(/"/g, '""')}"`
        )
        .join(",")
    )
    .join("\n");

  return headers + "\n" + body;
}

// ================= CREATE BACKUP =================
async function createBackup() {
  await fs.ensureDir(TMP);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipName = `backup-${stamp}.zip`;
  const zipPath = path.join(TMP, zipName);

  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);

  for (const table of TABLES) {
    const { rows } = await db.query(`SELECT * FROM ${table}`);
    if (!rows.length) continue;

    archive.append(toCSV(rows), { name: `${table}.csv` });
  }

  await archive.finalize();

  const buffer = await fs.readFile(zipPath);
  await supabase.storage.from(BUCKET).upload(zipName, buffer, { upsert: true });
  await fs.remove(zipPath);

  return zipName;
}

// ================= AUTO BACKUP =================
cron.schedule("0 22 * * *", createBackup);

// ================= MANUAL BACKUP =================
router.post("/manual", async (req, res) => {
  if (req.body.password !== "8515") {
    return res.json({ success: false, error: "Wrong password" });
  }

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

  res.json({
    success: true,
    files: (data || []).map(f => ({
      name: f.name,
      time: f.created_at || null,
    })),
  });
});

// ================= DOWNLOAD =================
router.get("/download/:file", async (req, res) => {
  const { data } = await supabase.storage.from(BUCKET).download(req.params.file);
  const buffer = Buffer.from(await data.arrayBuffer());

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${req.params.file}"`);
  res.send(buffer);
});

// ================= RESTORE FULL =================
router.post("/restore/full", async (req, res) => {
  if (req.body.password !== "faisalyounus")
    return res.json({ success: false });

  try {
    const { data } = await supabase.storage.from(BUCKET).download(req.body.file);
    const zip = new AdmZip(Buffer.from(await data.arrayBuffer()));

    for (const entry of zip.getEntries()) {
      const table = entry.entryName.replace(".csv", "");
      if (!TABLES.includes(table)) continue;

      const lines = entry.getData().toString("utf8").split("\n");
      const headers = lines.shift().split(",");

      await db.query(`DELETE FROM ${table}`);

      for (const l of lines) {
        if (!l.trim()) continue;
        const values = l.split(",").map(v => v.replace(/"/g, ""));
        const obj = {};
        headers.forEach((h, i) => (obj[h] = values[i]));

        await db.query(
          `INSERT INTO ${table} SELECT * FROM json_populate_record(NULL::${table}, $1)`,
          [obj]
        );
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.json({ success: false });
  }
});

// ================= RESTORE SINGLE =================
router.post("/restore/table", async (req, res) => {
  const { file, table, password } = req.body;
  if (password !== "faisalyounus")
    return res.json({ success: false });

  try {
    const { data } = await supabase.storage.from(BUCKET).download(file);
    const zip = new AdmZip(Buffer.from(await data.arrayBuffer()));
    const entry = zip.getEntry(`${table}.csv`);
    if (!entry) return res.json({ success: false });

    const lines = entry.getData().toString("utf8").split("\n");
    const headers = lines.shift().split(",");

    await db.query(`DELETE FROM ${table}`);

    for (const l of lines) {
      if (!l.trim()) continue;
      const values = l.split(",").map(v => v.replace(/"/g, ""));
      const obj = {};
      headers.forEach((h, i) => (obj[h] = values[i]));

      await db.query(
        `INSERT INTO ${table} SELECT * FROM json_populate_record(NULL::${table}, $1)`,
        [obj]
      );
    }

    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// ================= LAST =================
router.get("/last", async (req, res) => {
  const { data } = await supabase.storage.from(BUCKET).list("", { limit: 1 });
  res.json({
    success: true,
    last_backup: data?.[0]
      ? new Date(data[0].created_at).toLocaleString()
      : "",
  });
});

module.exports = router;
