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

const BACKUP_PASSWORD = "8515";
const ACTION_PASSWORD = "faisalyounus";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = "mmtbackups";
const TMP = "/tmp";

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

/* ================= HELPERS ================= */

const isJSON = (v) => {
  if (typeof v !== "string") return false;
  try {
    JSON.parse(v);
    return true;
  } catch {
    return false;
  }
};

const normalize = (v) => {
  if (v === "" || v === undefined) return null;

  // timestamp ms
  if (/^\d{13}$/.test(v)) {
    return new Date(Number(v))
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
  }

  if (isJSON(v)) return JSON.parse(v);

  if (!isNaN(v) && v !== "") return Number(v);

  return v;
};

/* ================= CREATE BACKUP ================= */

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

/* ================= AUTO BACKUP ================= */

cron.schedule("0 23 * * *", async () => {
  try {
    await createBackupCSV();
    console.log("✅ Auto backup done");
  } catch (e) {
    console.error("❌ Auto backup error", e.message);
  }
});

/* ================= MANUAL BACKUP ================= */

router.post("/manual", async (req, res) => {
  if (req.body.password !== BACKUP_PASSWORD)
    return res.json({ success: false });

  try {
    const file = await createBackupCSV();
    res.json({ success: true, file });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

/* ================= LIST ================= */

router.get("/list", async (_, res) => {
  const { data } = await supabase.storage.from(BUCKET).list("", {
    sortBy: { column: "name", order: "desc" },
  });
  res.json({ success: true, files: data || [] });
});

/* ================= DOWNLOAD ================= */

router.post("/download", async (req, res) => {
  const { file, password } = req.body;
  if (password !== ACTION_PASSWORD)
    return res.json({ success: false });

  const { data } = await supabase.storage.from(BUCKET).download(file);
  const buffer = Buffer.from(await data.arrayBuffer());

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename=${file}`);
  res.send(buffer);
});

/* ================= DELETE ================= */

router.post("/delete", async (req, res) => {
  if (req.body.password !== ACTION_PASSWORD)
    return res.json({ success: false });

  await supabase.storage.from(BUCKET).remove([req.body.file]);
  res.json({ success: true });
});

/* ================= RESTORE CORE ================= */

async function restoreTable(client, table, csv) {
  const records = parse(csv, { columns: true, skip_empty_lines: true });

  await client.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);

  for (const r of records) {
    const cols = Object.keys(r);
    const vals = cols.map((k) => normalize(r[k]));
    const params = cols.map((_, i) => `$${i + 1}`).join(",");

    await client.query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${params})`,
      vals
    );
  }
}

/* ================= FULL RESTORE ================= */

router.post("/restore/full", async (req, res) => {
  if (req.body.password !== ACTION_PASSWORD)
    return res.json({ success: false });

  const zipData = await supabase.storage.from(BUCKET).download(req.body.file);
  const zip = new AdmZip(Buffer.from(await zipData.data.arrayBuffer()));

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const table of TABLES) {
      const entry = zip.getEntry(`${table}.csv`);
      if (!entry) continue;
      await restoreTable(client, table, entry.getData().toString("utf8"));
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

/* ================= SINGLE TABLE ================= */

router.post("/restore/table", async (req, res) => {
  const { file, table, password } = req.body;
  if (password !== ACTION_PASSWORD || !TABLES.includes(table))
    return res.json({ success: false });

  const zipData = await supabase.storage.from(BUCKET).download(file);
  const zip = new AdmZip(Buffer.from(await zipData.data.arrayBuffer()));
  const entry = zip.getEntry(`${table}.csv`);
  if (!entry) return res.json({ success: false });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await restoreTable(client, table, entry.getData().toString("utf8"));
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
