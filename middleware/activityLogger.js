const db = require("../db");

/* =========================================================
   MODULE MAPPING
   ========================================================= */
const moduleMapping = {
  bookings: "Packages",
  hotels: "Hotels",
  ticketing: "Ticketing",
  visa: "Visa",
  card: "Card",
  groups: "Groups",
  transport: "Transport",
  ziyarat: "Ziyarat",
  purchase: "Purchase",
  supplier: "Supplier Ledger",
  suppliers: "Supplier Ledger",
  customer: "Customer Ledger",
  customers: "Customer Ledger",

  "customer-ledger": "Customer Ledger",
  "supplier-ledger": "Supplier Ledger",
  "registered-ledger": "Registered Ledger",
  "purchase-ledger": "Purchase Ledger",
  "bank-ledger": "Bank Ledger",
  "cash-ledger": "Cash Ledger",
  "expense-ledger": "Expense Ledger",
  payments: "Payments & Receipts",
  vouchers: "Vouchers",

  users: "User Management",
  user: "User Management",
  auth: "Authentication",

  archive: "Archive System",
  restore: "Data Restore",
  password: "Security Settings",
};

const tableByRoute = {
  bookings: "bookings",
  hotels: "hotels",
  ticketing: "ticketing",
  visa: "visa",
  card: "card",
  groups: '"groups"',
  transport: "transport",
  ziyarat: "ziyarat",
  purchase: "purchase_entries",
  suppliers: "suppliers",
  customers: "customers",
  "supplier-ledger": "supplier_ledger",
  "customer-ledger": "customer_ledger",
  "registered-ledger": "registered_ledger",
};

function getRouteParts(req) {
  const clean = String(req.originalUrl || "")
    .replace(/^\/api\//, "")
    .split("?")[0]
    .split("/")
    .filter(Boolean);

  return {
    routeName: String(clean[0] || "").toLowerCase(),
    subPath: String(clean[1] || "").toLowerCase(),
  };
}

function getModuleName(routeName, subPath) {
  return (
    moduleMapping[routeName] ||
    moduleMapping[subPath] ||
    "System Control"
  );
}

/* =========================================================
   EXTRACT LOGGED-IN USER SAFELY
   ========================================================= */
async function getLoggedInUser(req) {
  try {
    const headers = req.headers || {};
    const headerName =
      headers["x-user-name"] ||
      headers["x-username"] ||
      headers["username"] ||
      req.get("x-user-name") ||
      req.get("x-username") ||
      "";

    const body = req.body || {};
    const bodyUser =
      body.username ||
      body.user?.username ||
      body.user?.name ||
      (typeof body.user === "string" ? body.user : "");

    let searchUser = String(headerName || bodyUser || "").trim();

    if (searchUser && searchUser !== "Unknown User" && searchUser !== "undefined") {
      const result = await db.query(
        `SELECT id, username, name FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(name) = LOWER($1) LIMIT 1`,
        [searchUser]
      );

      if (result.rows.length) {
        return {
          id: result.rows[0].id,
          username: result.rows[0].username || result.rows[0].name,
        };
      }
      return { id: null, username: searchUser };
    }

    const lastLoginResult = await db.query(
      `SELECT username, user_id FROM activity_logs WHERE action = 'LOGIN' ORDER BY created_at DESC LIMIT 1`
    );

    if (lastLoginResult.rows.length) {
      return {
        id: lastLoginResult.rows[0].user_id || null,
        username: lastLoginResult.rows[0].username,
      };
    }

    return { id: null, username: "Unknown User" };
  } catch (err) {
    return { id: null, username: "Unknown User" };
  }
}

/* =========================================================
   EXTRACT REFERENCE CODE (FROM REQ BODY + RES BODY)
   ========================================================= */
function getReference(req, parsedRes) {
  const b = req.body || {};
  const resObj = parsedRes || {};

  // Check Response Body Pehle (Kyunke Nayi Sale ka Ref Backend se Ban kar aata hai)
  return (
    resObj.ref_no ||
    resObj.booking_no ||
    resObj.pkg_no ||
    resObj.customer_code ||
    resObj.supplier_code ||
    resObj.code ||
    b.ref_no ||
    b.booking_no ||
    b.customer_code ||
    b.supplier_code ||
    b.code ||
    b.voucher_no ||
    b.payment_id ||
    b.purchase_ref ||
    b.pkg_no ||
    req.params?.ref_no ||
    req.params?.code ||
    req.params?.ref ||
    req.params?.id ||
    "-"
  );
}

/* =========================================================
   FIND PARTY NAME & REAL CODE
   ========================================================= */
async function findPartyDetails(routeName, rawRef, body, parsedRes) {
  let name = body.customer_name || body.supplier_name || body.party_name || body.name || parsedRes?.customer_name || parsedRes?.name || "";
  let code = body.customer_code || body.supplier_code || body.code || parsedRes?.ref_no || rawRef || "-";

  // If we already have a clean Code (e.g. PKG-00123 / CUST-00001)
  if (name && code && isNaN(code) && code !== "-") {
    return { name, code };
  }

  // Database lookup across all sale/ledger tables
  try {
    const table = tableByRoute[routeName];

    // If sale creation table exists and rawRef is missing or numeric
    if (table) {
      const isNumeric = !isNaN(rawRef) && rawRef !== "-";
      let queryStr = "";
      let params = [];

      if (isNumeric) {
        queryStr = `SELECT * FROM ${table} WHERE id::text = $1 LIMIT 1`;
        params = [String(rawRef)];
      } else if (rawRef !== "-") {
        queryStr = `SELECT * FROM ${table} WHERE ref_no = $1 OR customer_code = $1 OR supplier_code = $1 LIMIT 1`;
        params = [String(rawRef)];
      } else {
        // Fetch last inserted entry for sale tables
        queryStr = `SELECT * FROM ${table} ORDER BY id DESC LIMIT 1`;
      }

      const resDB = await db.query(queryStr, params);
      if (resDB.rows.length > 0) {
        const row = resDB.rows[0];
        return {
          name: name || row.customer_name || row.supplier_name || row.name || "",
          code: row.ref_no || row.customer_code || row.supplier_code || row.code || code,
        };
      }
    }

    // Secondary Cross Table Query
    const result = await db.query(
      `
      SELECT customer_name AS name, ref_no AS code FROM bookings WHERE ref_no = $1 OR id::text = $1
      UNION ALL
      SELECT customer_name AS name, ref_no AS code FROM hotels WHERE ref_no = $1 OR id::text = $1
      UNION ALL
      SELECT customer_name AS name, ref_no AS code FROM visa WHERE ref_no = $1 OR id::text = $1
      UNION ALL
      SELECT customer_name AS name, ref_no AS code FROM ticketing WHERE ref_no = $1 OR id::text = $1
      UNION ALL
      SELECT name AS name, customer_code AS code FROM customers WHERE id::text = $1 OR customer_code = $1
      UNION ALL
      SELECT supplier_name AS name, supplier_code AS code FROM suppliers WHERE id::text = $1 OR supplier_code = $1
      LIMIT 1
      `,
      [String(rawRef)]
    );

    if (result.rows.length > 0) {
      return {
        name: name || result.rows[0].name || "",
        code: result.rows[0].code || code,
      };
    }
  } catch (e) {
    console.error("Party Details Lookup Error:", e.message);
  }

  return { name, code };
}

async function recordAlreadyExists(routeName, refNo, body) {
  if (!refNo || refNo === "-") return false;
  if (body?.is_edit === true || body?.isEdit === true) return true;
  const table = tableByRoute[routeName];
  if (!table) return false;

  try {
    const result = await db.query(
      `SELECT EXISTS (SELECT 1 FROM ${table} WHERE id::text = $1 OR ref_no = $1 OR supplier_code = $1 OR customer_code = $1) AS exists`,
      [refNo]
    );
    return !!result.rows[0]?.exists;
  } catch {
    return false;
  }
}

/* =========================================================
   ACTION DETERMINATION
   ========================================================= */
function getAction(req, routeName, refExistsBefore) {
  const method = String(req.method || "").toUpperCase();
  const path = String(req.originalUrl || "").toLowerCase();
  const body = req.body || {};

  if (path.includes("/auth/login")) return "LOGIN";
  if (path.includes("/auth/logout")) return "LOGOUT";

  if (body.activityAction) return String(body.activityAction).toUpperCase();

  const isPaymentRoute =
    path.includes("/payment") ||
    path.includes("/voucher") ||
    path.includes("/receipt") ||
    path.includes("ledger") ||
    body.is_payment === true ||
    body.type === "payment";

  if (isPaymentRoute) {
    return "PAYMENT";
  }

  if (method === "DELETE" || path.includes("/delete/") || path.endsWith("/delete")) return "DELETE";
  if (method === "PUT" || method === "PATCH") return "UPDATE";
  if (method === "POST" && (path.includes("/save") || path.includes("/update") || path.includes("/edit"))) {
    return refExistsBefore ? "UPDATE" : "CREATE";
  }
  if (method === "POST") return "CREATE";
  return "OTHER";
}

/* =========================================================
   ACTIVITY LOGGER MIDDLEWARE EXPORT
   ========================================================= */
module.exports = async function activityLogger(req, res, next) {
  const method = String(req.method || "").toUpperCase();
  const originalUrl = String(req.originalUrl || "");

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return next();
  }

  if (originalUrl.includes("/reports/activity")) {
    return next();
  }

  const { routeName, subPath } = getRouteParts(req);
  const moduleName = getModuleName(routeName, subPath);

  const originalSend = res.send;
  res.send = function (responseBody) {
    res.send = originalSend;

    if (res.statusCode >= 200 && res.statusCode < 300) {
      setImmediate(async () => {
        try {
          const body = req.body || {};

          // Safely parse JSON response body to catch server-generated ref_no
          let parsedRes = {};
          try {
            parsedRes = typeof responseBody === "string" ? JSON.parse(responseBody) : responseBody;
          } catch (e) {
            parsedRes = {};
          }

          const rawRef = getReference(req, parsedRes);
          const loggedUser = await getLoggedInUser(req);
          const userId = loggedUser.id;
          const username = loggedUser.username;

          const refExistsBefore = await recordAlreadyExists(routeName, rawRef, body);
          const actionName = getAction(req, routeName, refExistsBefore);

          // Details extract including backend response
          const partyDetails = await findPartyDetails(routeName, rawRef, body, parsedRes);
          const finalRef = partyDetails.code && partyDetails.code !== "-" ? partyDetails.code : rawRef;
          const partyName = partyDetails.name;

          let description = "";

          if (actionName === "LOGIN") {
            description = `User ${username} logged in successfully`;
          } else if (actionName === "LOGOUT") {
            description = `User ${username} logged out`;
          } else if (actionName === "PAYMENT") {
            const actionText = (method === "PUT" || method === "PATCH") ? "Payment entry updated" : "Payment entry processed";
            description = partyName 
              ? `${actionText} for ${partyName} (${finalRef})` 
              : `${actionText} (${finalRef})`;
          } else {
            description = `${actionName} action performed on ${moduleName}`;
            if (partyName && finalRef !== "-") {
              description += ` for ${partyName} (${finalRef})`;
            } else if (partyName) {
              description += ` for ${partyName}`;
            } else if (finalRef !== "-") {
              description += ` (${finalRef})`;
            }
          }

          await db.query(
            `
            INSERT INTO public.activity_logs
            (user_id, username, action, module, description, reference_no, method, path)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              userId,
              username,
              actionName,
              moduleName,
              description,
              finalRef,
              method,
              originalUrl,
            ]
          );
        } catch (err) {
          console.error("ACTIVITY LOG ERROR:", err.message);
        }
      });
    }

    return res.send(responseBody);
  };

  return next();
};