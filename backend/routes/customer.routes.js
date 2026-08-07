// routes/customer.routes.js
const express = require("express");
const router  = express.Router();
const db      = require("../database/db");
const { verifyCustomerToken } = require("../middleware/verifyCustomerToken");

// GET /api/customer/me
router.get("/me", verifyCustomerToken, async (req, res) => {
  try {
    const [[customer]] = await db.query(
      `SELECT name, phone FROM customers WHERE id=?`, [req.customer.customerId]
    );
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    res.json({ name: customer.name, mobile: customer.phone });
  } catch (err) {
    console.error("CUSTOMER ME ERROR:", err);
    res.status(500).json({ error: "Could not load profile" });
  }
});

// PATCH /api/customer/profile  { name }
router.patch("/profile", verifyCustomerToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

    await db.query(`UPDATE customers SET name=? WHERE id=?`, [name.trim(), req.customer.customerId]);
    res.json({ success: true, name: name.trim() });
  } catch (err) {
    console.error("CUSTOMER PROFILE UPDATE ERROR:", err);
    res.status(500).json({ error: "Could not update name" });
  }
});

// GET /api/customer/history
router.get("/history", verifyCustomerToken, async (req, res) => {
  try {
    const [jobs] = await db.query(
      `SELECT job_id, file_name, color, copies, paper_size, print_side,
              total_pages, amount, status, created_at, printed_at
       FROM print_jobs
       WHERE customer_id=?
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.customer.customerId]
    );
    res.json({ jobs });
  } catch (err) {
    console.error("CUSTOMER HISTORY ERROR:", err);
    res.status(500).json({ error: "Could not load history" });
  }
});

module.exports = router;