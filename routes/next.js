// api/next.js
import db from "../db"; // apna db connection adjust karein

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const result = [];

    // 1️⃣ Get all purchase entries
    const purchase = await db.query(`
      SELECT ref_no, item, sale_sar, sale_rate, sale_pkr
      FROM purchase_entries
      WHERE is_deleted = false
    `);

    if (!purchase.rows.length) return res.json({ success: true, rows: [] });

    // 2️⃣ Group by ref_no
    const byRef = {};
    purchase.rows.forEach(r => {
      if (!byRef[r.ref_no]) byRef[r.ref_no] = [];
      byRef[r.ref_no].push(r);
    });

    // 3️⃣ Loop each ref_no
    for (const ref_no of Object.keys(byRef)) {
      let salesRows = [];

      // ===== BOOKINGS (PKG-) =====
      if (ref_no.startsWith("PKG-")) {
        const q = await db.query(`SELECT * FROM bookings WHERE ref_no=$1 AND is_deleted=false`, [ref_no]);
        if (q.rows.length) {
          const s = q.rows[0];
          if (s.adult_count > 0) salesRows.push({ item: "Ticket – Adult", sale_pkr: s.adult_count * s.adult_rate * (s.flight_sar_rate || 0) });
          if (s.child_count > 0) salesRows.push({ item: "Ticket – Child", sale_pkr: s.child_count * s.child_rate * (s.flight_sar_rate || 0) });
          if (s.infant_count > 0) salesRows.push({ item: "Ticket – Infant", sale_pkr: s.infant_count * s.infant_rate * (s.flight_sar_rate || 0) });
          if (Array.isArray(s.hotels)) s.hotels.forEach((h,i) => salesRows.push({ item: `Hotel ${i+1}`, sale_pkr: (Number(h.total) || 0) * (s.hotel_sar_rate || 0) }));
          if (s.visa_persons > 0) { const sar = s.visa_total || s.visa_persons * s.visa_rate; salesRows.push({ item: "Visa", sale_pkr: sar * (s.visa_sar_rate || 0) }); }
        }
      }

      // ===== HOTELS (HOT-) =====
      if (ref_no.startsWith("HOT-")) {
        const q = await db.query(`SELECT hotel_name, hotel_total, sar_rate FROM hotels WHERE ref_no=$1 AND is_deleted=false`, [ref_no]);
        if (q.rows.length) q.rows.forEach((h,i) => salesRows.push({ item: `Hotel ${i+1} - ${h.hotel_name || ""}`, sale_pkr: (Number(h.hotel_total) || 0) * (h.sar_rate || 0) }));
      }

      // ===== VISA (VISA-) =====
      if (ref_no.startsWith("VISA-")) {
        const q = await db.query(`SELECT total_sar, pkr_rate FROM visa WHERE ref_no=$1 AND is_deleted=false`, [ref_no]);
        if (q.rows.length) { const r = q.rows[0]; salesRows.push({ item: "Visa", sale_pkr: Number(r.total_sar || 0) * Number(r.pkr_rate || 0) }); }
      }

      // ===== TRANSPORT (TRN-) =====
      if (ref_no.startsWith("TRN-")) {
        const q = await db.query(`SELECT rows, pkr_rate FROM transport WHERE ref_no=$1 AND is_deleted=false`, [ref_no]);
        if (q.rows.length && Array.isArray(q.rows[0].rows)) q.rows[0].rows.forEach((t,i) => {
          const label = t.description || t.text || t.route || "";
          salesRows.push({ item: label ? `Transport ${i+1} - ${label}` : `Transport ${i+1}`, sale_pkr: Number(t.sar || 0) * Number(q.rows[0].pkr_rate || 0) });
        });
      }

      // ===== ZIYARAT (ZIY-) =====
      if (ref_no.startsWith("ZIY-")) {
        const q = await db.query(`SELECT rows, pkr_rate FROM ziyarat WHERE ref_no=$1 AND is_deleted=false`, [ref_no]);
        if (q.rows.length && Array.isArray(q.rows[0].rows)) q.rows[0].rows.forEach((t,i) => {
          const label = t.description || t.text || t.route || "";
          salesRows.push({ item: label ? `Ziyarat ${i+1} - ${label}` : `Ziyarat ${i+1}`, sale_pkr: Number(t.sar || 0) * Number(q.rows[0].pkr_rate || 0) });
        });
      }

      // 4️⃣ Compare purchase vs current sales
      for (const p of byRef[ref_no]) {
        const baseItem = p.item.split(" - ")[0];
        const s = salesRows.find(x => x.item === p.item || x.item === baseItem);
        if (!s) continue;
        const current = Number(s.sale_pkr || 0);
        const saved = Number(p.sale_pkr || 0);
        if (current !== saved) result.push({ ref_no, item: p.item, purchase_sale_pkr: saved, current_sale_pkr: current, diff: current - saved });
      }
    }

    res.status(200).json({ success: true, rows: result });
  } catch (err) {
    console.error("SALE MISMATCH REPORT ERROR:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
module.exports = router;
