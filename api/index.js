const express = require("express");
const cors = require("cors");

require("dotenv").config();
require("../db");

const app = express();
app.use(cors());
app.use(express.json());

// ROUTES
// SALES
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/hotels", require("./routes/hotels"));
app.use("/api/ticketing", require("./routes/ticketing"));
app.use("/api/visa", require("./routes/visa"));
app.use("/api/transport", require("./routes/transport"));
app.use("/api/reports", require("./routes/reports"));

// LEDGERS
app.use("/api/customer-ledger", require("./routes/customerLedger"));
app.use("/api/purchase-ledger", require("./routes/purchaseLedger"));
app.use("/api/bank-ledger", require("./routes/bankLedger"));
app.use("/api/ledger-delete", require("./routes/ledgerDelete"));
app.use("/api/balance-sheet", require("./routes/balanceSheet"));
app.use("/api/profit-report", require("./routes/profitReport"));

// PURCHASE
app.use("/api/purchase", require("./routes/purchase"));

// 🔐 AUTH + USERS
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));

app.get("/", (req, res) => {
  res.json({ ok: true });
});

module.exports = app;
