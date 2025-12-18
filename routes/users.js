const express = require("express");
const router = express.Router();
const db = require("../db");

/* ================= CREATE USER ================= */
router.post("/create", async (req, res) => {
  try {
    const { name, username, password, role } = req.body;

    if (!name || !username || !password)
      return res.json({ success: false, error: "Missing fields" });

    const check = await db.query(
      "SELECT id FROM users WHERE username=$1",
      [username]
    );

    if (check.rows.length > 0)
      return res.json({ success: false, error: "Username already exists" });

    await db.query(
      `INSERT INTO users (name, username, password, role)
       VALUES ($1,$2,$3,$4)`,
      [name, username, password, role || "user"]
    );

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ================= LIST USERS ================= */
router.get("/list", async (req, res) => {
  try {
    const r = await db.query(
      "SELECT id, name, username, password, role FROM users ORDER BY id DESC"
    );
    res.json({ success: true, rows: r.rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/* ================= UPDATE PASSWORD ================= */
router.post("/update-password", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.json({ success: false, error: "Missing data" });

    await db.query(
      "UPDATE users SET password=$1 WHERE username=$2",
      [password, username]
    );

    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
