const express = require("express");
const router = express.Router();

const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const AdmZip = require("adm-zip");
const cron = require("node-cron");
const db = require("../db");

const { stringify } = require("csv-stringify/sync");
const { parse } = require("csv-parse/sync");

const { createClient } = require("@supabase/supabase-js");

/* ================= CONFIG ================= */

const BACKUP_PASSWORD = "8515";          // 🔐 manual backup
const ACTION_PASSWORD = "faisalyounus";  // 🔐 restore / delete / download

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = "mmtbackups";
const TMP = "/tmp"; // ✅ vercel safe

/* ================= TABLES ================= */

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

/* ================= SAFE CSV PARSER ================= */

function parseCSVSafe(csvText) {
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  });
}

/* ================= CREATE CSV BACKUP ================= */

async function createBackupCSV() {
  await fs.ensureDir(TMP);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipName = `backup-${stamp}.zip`;
  const zipPath = path.join(TMP, zipName);

  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);

  for (const table of TABLES) {
    const { rows } = await db.query(`SELECT * FROM ${table}`);
    const csv = stringify(rows, { header: true });
    archive.append(csv, { name: `${table}.csv` });
  }

  archive.append(
    JSON.stringify(
      { created_at: new Date().toISOString(), tables: TABLES },
      null,
      2
    ),
    { name: "meta.json" }
  );

  await archive.finalize();
  await new Promise((r) => output.on("close", r));

  const buffer = await fs.readFile(zipPath);
  await supabase.storage.from(BUCKET).upload(zipName, buffer, {
    upsert: true,
    contentType: "application/zip",
  });

  await fs.remove(zipPath);
  return zipName;
}

/* ================= AUTO BACKUP (DAILY 11PM) ================= */

cron.schedule("0 23 * * *", async () => {
  try {
    await createBackupCSV();
    console.log("✅ Auto backup completed");
  } catch (e) {
    console.error("❌ Auto backup error:", e.message);
  }
});

/* ================= MANUAL BACKUP ================= */

router.post("/manual", async (req, res) => {
  if (req.body.password !== BACKUP_PASSWORD) {
    return res.json({ success: false, error: "Wrong password" });
  }

  try {
    const file = await createBackupCSV();
    res.json({ success: true, file });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

/* ================= LIST BACKUPS ================= */

router.get("/list", async (req, res) => {
  const { data, error } = await supabase.storage.from(BUCKET).list("", {
    sortBy: { column: "name", order: "desc" },
  });

  if (error)
    return res.json({ success: false, error: error.message });

  res.json({ success: true, files: data || [] });
});

/* ================= DOWNLOAD (PASSWORD PROTECTED) ================= */

router.post("/download", async (req, res) => {
  const { file, password } = req.body;

  if (password !== ACTION_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  const { data, error } = await supabase.storage.from(BUCKET).download(file);
  if (error)
    return res.json({ success: false, error: "File not found" });

  const buffer = Buffer.from(await data.arrayBuffer());

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${file}"`
  );
  res.send(buffer);
});

/* ================= DELETE BACKUP ================= */

router.post("/delete", async (req, res) => {
  if (req.body.password !== ACTION_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  await supabase.storage.from(BUCKET).remove([req.body.file]);
  res.json({ success: true });
});

/* ================= FULL RESTORE (CSV SAFE) ================= */

router.post("/restore/full", async (req, res) => {
  const { file, password } = req.body;

  if (password !== ACTION_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  const { data, error } = await supabase.storage.from(BUCKET).download(file);
  if (error)
    return res.json({ success: false, error: error.message });

  const zip = new AdmZip(Buffer.from(await data.arrayBuffer()));
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    for (const table of TABLES) {
      const entry = zip.getEntry(`${table}.csv`);
      if (!entry) continue;

      const rows = parseCSVSafe(entry.getData().toString("utf8"));

      await client.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);

      for (const row of rows) {
        await client.query(
          `INSERT INTO ${table}
           SELECT * FROM json_populate_record(NULL::${table}, $1)`,
          [row]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ success: true });

  } catch (e) {
    await client.query("ROLLBACK");
    console.error("RESTORE ERROR:", e);
    res.json({ success: false, error: e.message });
  } finally {
    client.release();
  }
});

/* ================= SINGLE TABLE RESTORE ================= */

router.post("/restore/table", async (req, res) => {
  const { file, table, password } = req.body;

  if (password !== ACTION_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  if (!TABLES.includes(table))
    return res.json({ success: false, error: "Invalid table" });

  const { data, error } = await supabase.storage.from(BUCKET).download(file);
  if (error)
    return res.json({ success: false, error: error.message });

  const zip = new AdmZip(Buffer.from(await data.arrayBuffer()));
  const entry = zip.getEntry(`${table}.csv`);

  if (!entry)
    return res.json({ success: false, error: "Table not found in backup" });

  const rows = parseCSVSafe(entry.getData().toString("utf8"));
  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);

    for (const row of rows) {
      await client.query(
        `INSERT INTO ${table}
         SELECT * FROM json_populate_record(NULL::${table}, $1)`,
        [row]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });

  } catch (e) {
    await client.query("ROLLBACK");
    res.json({ success: false, error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
