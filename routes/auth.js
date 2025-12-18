const express = require("express");
const router = express.Router();
const db = require("../db");

/* ================================
   LOGIN
   POST /api/auth/login
================================ */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.json({ success: false, error: "Missing credentials" });

    const result = await db.query(
      `SELECT id, name, username, role
       FROM users
       WHERE username=$1 AND password=$2`,
      [username, password]
    );

    if (result.rows.length === 0)
      return res.json({ success: false, error: "Invalid login" });

    res.json({
      success: true,
      user: result.rows[0]
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
