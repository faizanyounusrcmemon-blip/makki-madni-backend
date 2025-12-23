const express = require("express");
const router = express.Router();

const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const AdmZip = require("adm-zip");
const cron = require("node-cron");
const db = require("../db");
const { stringify } = require("csv-stringify/sync");
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

function normalizeValue(val) {
  if (val === "" || val === undefined) return null;

  // timestamp in ms
  if (/^\d{13}$/.test(String(val))) {
    return new Date(Number(val));
  }

  // number
  if (!isNaN(val) && val !== "") return Number(val);

  // JSON
  if (typeof val === "string") {
    const t = val.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return JSON.parse(t);
      } catch {
        return null;
      }
    }
  }

  return val;
}

/* ================= CSV PARSER ================= */

function parseCSV(csv) {
  const lines = csv.split("\n").filter(Boolean);
  const headers = lines.shift().split(",").map(h => h.replace(/^"|"$/g, ""));

  return lines.map(line => {
    const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
    const obj = {};
    headers.forEach((h, i) => {
      let v = values[i] ?? null;
      if (typeof v === "string") v = v.replace(/^"|"$/g, "");
      obj[h] = normalizeValue(v);
    });
    return obj;
  });
}

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
  await new Promise(r => output.on("close", r));

  const buffer = await fs.readFile(zipPath);
  await supabase.storage.from(BUCKET).upload(zipName, buffer, { upsert: true });

  await fs.remove(zipPath);
  return zipName;
}

/* ================= RESTORE CORE ================= */

async function restoreTable(client, table, rows) {
  await client.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);

  for (const row of rows) {
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
    const values = cols.map(c => row[c]);

    await client.query(
      `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`,
      values
    );
  }
}

/* ================= FULL RESTORE ================= */

router.post("/restore/full", async (req, res) => {
  const { file, password } = req.body;
  if (password !== ACTION_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  const { data } = await supabase.storage.from(BUCKET).download(file);
  const zip = new AdmZip(Buffer.from(await data.arrayBuffer()));

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const table of TABLES) {
      const entry = zip.getEntry(`${table}.csv`);
      if (!entry) continue;

      const rows = parseCSV(entry.getData().toString("utf8"));
      await restoreTable(client, table, rows);
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

  if (password !== ACTION_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  if (!TABLES.includes(table))
    return res.json({ success: false, error: "Invalid table" });

  const { data } = await supabase.storage.from(BUCKET).download(file);
  const zip = new AdmZip(Buffer.from(await data.arrayBuffer()));
  const entry = zip.getEntry(`${table}.csv`);

  if (!entry)
    return res.json({ success: false, error: "Table not found" });

  const rows = parseCSV(entry.getData().toString("utf8"));

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await restoreTable(client, table, rows);
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
