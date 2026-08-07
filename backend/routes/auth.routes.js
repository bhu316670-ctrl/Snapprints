// routes/auth.routes.js
const express = require("express");
const jwt     = require("jsonwebtoken");
const router  = express.Router();
const db      = require("../database/db");

const generateOTP = () => Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ── Placeholder SMS sender — wire up your SMS gateway here ── */
async function sendOtpSms(mobile, otp) {
  // TODO: replace with real gateway, e.g. MSG91 / Twilio:
  // await fetch("https://api.msg91.com/api/v5/otp", { ... });
  console.log(`[SMS MOCK] OTP ${otp} → +91${mobile}`);
}

function issueToken(customer, mobile) {
  return jwt.sign(
    { customerId: customer.id, mobile, role: "customer" },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/login
   body: { name, mobile }
   - Known + already-verified number  -> logs in directly
   - New number OR not yet verified   -> (re)sends OTP
═══════════════════════════════════════════════════════════ */
router.post("/login", async (req, res) => {
  try {
    const { name, mobile } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
    if (!mobile || !MOBILE_REGEX.test(mobile.trim()))
      return res.status(400).json({ error: "Enter a valid 10-digit mobile number" });

    const cleanName   = name.trim();
    const cleanMobile = mobile.trim();

    const [[existing]] = await db.query(
      `SELECT * FROM customers WHERE phone=?`, [cleanMobile]
    );

    // ── Known number, already OTP-verified before → skip OTP entirely ──
    if (existing && existing.otp_verified) {
      if (existing.name !== cleanName) {
        await db.query(`UPDATE customers SET name=? WHERE id=?`, [cleanName, existing.id]);
      }
      const token = issueToken(existing, cleanMobile);
      return res.json({
        status: "logged_in",
        token,
        user: { name: cleanName, mobile: cleanMobile },
      });
    }

    // ── New number, or exists but never completed OTP → send/resend OTP ──
    const otp    = generateOTP();
    const expiry = new Date(Date.now() + OTP_TTL_MS);

    await db.query(
      `INSERT INTO customers (name, phone, otp, otp_verified, otp_expires_at)
       VALUES (?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name), otp=VALUES(otp), otp_verified=0, otp_expires_at=VALUES(otp_expires_at)`,
      [cleanName, cleanMobile, otp, expiry]
    );

    await sendOtpSms(cleanMobile, otp);

    return res.json({ status: "otp_sent" });
  } catch (err) {
    console.error("AUTH LOGIN ERROR:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/resend-otp
   body: { name, mobile }
   Always regenerates + resends OTP, regardless of verified state.
═══════════════════════════════════════════════════════════ */
router.post("/resend-otp", async (req, res) => {
  try {
    const { name, mobile } = req.body;
    if (!mobile || !MOBILE_REGEX.test(mobile.trim()))
      return res.status(400).json({ error: "Enter a valid 10-digit mobile number" });

    const cleanMobile = mobile.trim();
    const cleanName    = (name || "").trim();

    const otp    = generateOTP();
    const expiry = new Date(Date.now() + OTP_TTL_MS);

    const [[existing]] = await db.query(`SELECT id, name FROM customers WHERE phone=?`, [cleanMobile]);
    if (!existing) return res.status(404).json({ error: "No login attempt found for this number" });

    await db.query(
      `UPDATE customers SET otp=?, otp_verified=0, otp_expires_at=?, name=COALESCE(NULLIF(?, ''), name)
       WHERE id=?`,
      [otp, expiry, cleanName, existing.id]
    );

    await sendOtpSms(cleanMobile, otp);
    return res.json({ success: true });
  } catch (err) {
    console.error("AUTH RESEND ERROR:", err);
    return res.status(500).json({ error: "Could not resend OTP" });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /api/auth/verify-otp
   body: { name, mobile, otp }
═══════════════════════════════════════════════════════════ */
router.post("/verify-otp", async (req, res) => {
  try {
    const { name, mobile, otp } = req.body;
    if (!mobile || !otp) return res.status(400).json({ error: "Mobile and OTP are required" });

    const cleanMobile = mobile.trim();

    const [[customer]] = await db.query(`SELECT * FROM customers WHERE phone=?`, [cleanMobile]);
    if (!customer) return res.status(404).json({ error: "No OTP request found for this number" });

    if (!customer.otp || customer.otp !== otp.trim())
      return res.status(400).json({ error: "Invalid OTP" });

    if (!customer.otp_expires_at || new Date(customer.otp_expires_at) < new Date())
      return res.status(400).json({ error: "OTP expired. Please request a new one." });

    await db.query(
      `UPDATE customers SET otp_verified=1, otp=NULL, otp_expires_at=NULL WHERE id=?`,
      [customer.id]
    );

    const finalName = (name && name.trim()) || customer.name;
    const token = issueToken(customer, cleanMobile);

    return res.json({
      status: "logged_in",
      token,
      user: { name: finalName, mobile: cleanMobile },
    });
  } catch (err) {
    console.error("AUTH VERIFY ERROR:", err);
    return res.status(500).json({ error: "OTP verification failed" });
  }
});

module.exports = router;