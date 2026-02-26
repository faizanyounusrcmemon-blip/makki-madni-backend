const express = require("express");
const router = express.Router();

const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const AdmZip = require("adm-zip");
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
  "expense_ledger",
  "hotels",
  "ticketing",
  "visa",
  "card",
  "transport",
  "purchase_entries",
  "users",
  "bank_transactions",
  "cash_transactions",
  "customer_payments",
  "purchase_payments",
  "supplier_payments",
  "suppliers",
  "ziyarat",
];

/* ================= JSON COLUMNS ================= */

const JSON_COLUMNS = {
  bookings: ["flights", "hotels", "transport", "visa"],
  ticketing: ["flight_from", "flight_to", "flight_date", "airline"],
  transport: ["transport"],
  ziyarat: ["ziyarat"],
  visa: ["rows"],
  card: ["rows"],
};

/* ================= HELPERS ================= */

const normalize = (v) => {
  if (v === "" || v === undefined) return null;

  if (/^\d{13}$/.test(String(v))) {
    return new Date(Number(v))
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
  }

  if (v === true || v === false) return v;

  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) {
    return Number(v);
  }

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

    const safeRows = rows.map((r) => {
      const obj = { ...r };

      if (JSON_COLUMNS[table]) {
        JSON_COLUMNS[table].forEach((c) => {
          if (obj[c] && typeof obj[c] === "object") {
            obj[c] = JSON.stringify(obj[c]);
          }
        });
      }

      if ("is_deleted" in obj) {
        obj.is_deleted = obj.is_deleted ? "TRUE" : "FALSE";
      }

      return obj;
    });

    const csv = stringify(safeRows, { header: true });
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

/* ================= MANUAL BACKUP ================= */

router.post("/manual", async (req, res) => {
  if (req.body.password !== BACKUP_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

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

/* ================= RESTORE CORE ================= */

async function restoreTable(client, table, csv) {
  const records = parse(csv, { columns: true, skip_empty_lines: true });

  await client.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);

  for (const r of records) {
    const cols = [];
    const params = [];
    const values = [];

    let i = 1;
    for (const key of Object.keys(r)) {
      cols.push(key);

      if (JSON_COLUMNS[table]?.includes(key)) {
        values.push(r[key] && r[key] !== "" ? r[key] : "{}");
        params.push(`$${i}::jsonb`);
      } else if (key === "is_deleted") {
        values.push(r[key] === "TRUE");
        params.push(`$${i}`);
      } else {
        values.push(normalize(r[key]));
        params.push(`$${i}`);
      }
      i++;
    }

    await client.query(
      `INSERT INTO ${table} (${cols.join(",")})
       VALUES (${params.join(",")})`,
      values
    );
  }
}

/* ================= FULL RESTORE ================= */

router.post("/restore/full", async (req, res) => {
  if (req.body.password !== ACTION_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

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
    res.json({ success: true, progress: 100 });
  } catch (e) {
    await client.query("ROLLBACK");
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

  if (!file || !table)
    return res.json({ success: false, error: "File & table required" });

  try {
    const zipData = await supabase.storage.from(BUCKET).download(file);
    if (!zipData.data)
      return res.json({ success: false, error: "Backup file not found" });

    const zip = new AdmZip(Buffer.from(await zipData.data.arrayBuffer()));
    const entry = zip.getEntry(`${table}.csv`);

    if (!entry)
      return res.json({
        success: false,
        error: `Table ${table} not found in backup`,
      });

    const csv = entry.getData().toString("utf8");

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await restoreTable(client, table, csv);
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (e) {
      await client.query("ROLLBACK");
      res.json({ success: false, error: e.message });
    } finally {
      client.release();
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ================= DOWNLOAD BACKUP ================= */

router.post("/download", async (req, res) => {
  const { file, password } = req.body;

  if (password !== ACTION_PASSWORD)
    return res.status(401).json({ success: false, error: "Wrong password" });

  const { data, error } = await supabase.storage.from(BUCKET).download(file);

  if (error || !data)
    return res.status(404).json({ success: false, error: "File not found" });

  const buffer = Buffer.from(await data.arrayBuffer());

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${file}"`);

  res.end(buffer);
});

/* ================= DELETE BACKUP ================= */

router.post("/delete", async (req, res) => {
  const { file, password } = req.body;

  if (password !== ACTION_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  if (!file)
    return res.json({ success: false, error: "File required" });

  const { error } = await supabase.storage.from(BUCKET).remove([file]);

  if (error)
    return res.json({ success: false, error: error.message });

  res.json({ success: true });
});

/* ================= LAST BACKUP ================= */

router.get("/last", async (_, res) => {
  const { data } = await supabase.storage.from(BUCKET).list("", {
    sortBy: { column: "name", order: "desc" },
    limit: 1,
  });

  if (!data || data.length === 0)
    return res.json({ success: true, last_backup: null });

  res.json({
    success: true,
    last_backup: {
      name: data[0].name,
      created_at: data[0].created_at,
    },
  });
});

/* ================= CLEAN OLD BACKUPS (60 DAYS) ================= */

router.post("/cleanup", async (req, res) => {
  try {
    const { password } = req.body;

    if (password !== ACTION_PASSWORD) {
      return res.json({ success: false, error: "Wrong password" });
    }

    const DAYS = 60;
    const cutoff = Date.now() - DAYS * 24 * 60 * 60 * 1000;

    const { data: files, error } = await supabase
      .storage
      .from(BUCKET)
      .list("");

    if (error) {
      return res.json({ success: false, error: error.message });
    }

    const toDelete = [];

    for (const f of files) {
      if (!f.created_at) continue;

      const created = new Date(f.created_at).getTime();
      if (created < cutoff) {
        toDelete.push(f.name);
      }
    }

    if (toDelete.length) {
      await supabase.storage.from(BUCKET).remove(toDelete);
    }

    res.json({
      success: true,
      deleted: toDelete.length,
      files: toDelete,
    });

  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});


module.exports = router;






