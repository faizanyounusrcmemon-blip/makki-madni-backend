const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Server alive",
    time: new Date()
  });
});

module.exports = router;
