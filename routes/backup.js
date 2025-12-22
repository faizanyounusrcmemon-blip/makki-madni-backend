const express = require("express");
const router = express.Router();

const fs = require("fs-extra");
const path = require("path");
const archiver = require("archiver");
const AdmZip = require("adm-zip");
const cron = require("node-cron");
const db = require("../db");
const { createClient } = require("@supabase/supabase-js");

// ================= PASSWORDS =================
const BACKUP_PASSWORD = "8515";          // 🔄 Backup only
const ADMIN_PASSWORD = "faisalyounus";   // ♻️ Restore / ⬇️ Download / ❌ Delete

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
    try {
      const { rows } = await db.query(`SELECT * FROM ${table}`);
      archive.append(JSON.stringify(rows), { name: `${table}.json` });
    } catch (e) {
      console.error("⏭️ Skipped table:", table);
    }
  }

  archive.append(
    JSON.stringify({ created_at: new Date(), tables: TABLES }),
    { name: "meta.json" }
  );

  await archive.finalize();

  const buffer = await fs.readFile(zipPath);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(zipName, buffer, { upsert: true });

  if (error) throw error;

  await fs.remove(zipPath);
  return zipName;
}

// ================= AUTO BACKUP (DAILY 11 PM) =================
cron.schedule("0 23 * * *", async () => {
  try {
    await createBackup();
    console.log("✅ Auto backup created");
  } catch (e) {
    console.error("❌ Auto backup failed:", e.message);
  }
});

// ================= MANUAL BACKUP =================
router.post("/backup", async (req, res) => {
  if (req.body.password !== BACKUP_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  try {
    const file = await createBackup();
    res.json({ success: true, file });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ================= LIST BACKUPS =================
router.get("/list", async (req, res) => {
  const { data } = await supabase.storage.from(BUCKET).list("", {
    sortBy: { column: "name", order: "desc" },
  });

  res.json({ success: true, files: data || [] });
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

// ================= DELETE BACKUP =================
router.post("/delete", async (req, res) => {
  const { file, password } = req.body;
  if (password !== ADMIN_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  await supabase.storage.from(BUCKET).remove([file]);
  res.json({ success: true });
});

// ================= FULL RESTORE =================
router.post("/restore/full", async (req, res) => {
  const { file, password } = req.body;
  if (password !== ADMIN_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  const { data } = await supabase.storage.from(BUCKET).download(file);
  const zip = new AdmZip(Buffer.from(await data.arrayBuffer()));

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const table of TABLES) {
      const entry = zip.getEntry(`${table}.json`);
      if (!entry) continue;

      const rows = JSON.parse(entry.getData().toString("utf8"));
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
    res.json({ success: false, error: e.message });
  } finally {
    client.release();
  }
});

// ================= SINGLE TABLE RESTORE =================
router.post("/restore/table", async (req, res) => {
  const { file, table, password } = req.body;
  if (password !== ADMIN_PASSWORD)
    return res.json({ success: false, error: "Wrong password" });

  if (!TABLES.includes(table))
    return res.json({ success: false, error: "Invalid table" });

  const { data } = await supabase.storage.from(BUCKET).download(file);
  const zip = new AdmZip(Buffer.from(await data.arrayBuffer()));
  const entry = zip.getEntry(`${table}.json`);
  if (!entry)
    return res.json({ success: false, error: "Table not found" });

  const rows = JSON.parse(entry.getData().toString("utf8"));

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

// ================= LAST BACKUP =================
router.get("/last", async (req, res) => {
  const { data } = await supabase.storage.from(BUCKET).list("", {
    limit: 1,
    sortBy: { column: "name", order: "desc" },
  });

  res.json({
    success: true,
    last_backup: data?.[0]
      ? new Date(data[0].created_at).toLocaleString()
      : "",
  });
});

module.exports = router;
