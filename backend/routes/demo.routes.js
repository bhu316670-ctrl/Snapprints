// routes/demo.routes.js
const express = require("express");
const router  = express.Router();
const { Resend } = require("resend");

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/* ═══════════════════════════════════════════════════════════
   POST /api/request-demo
   body: { name, company, email, phone, city, organization, message }
   Sends a notification email via Resend to TO_EMAIL.
═══════════════════════════════════════════════════════════ */
router.post("/", async (req, res) => {
  try {
    if (!resend) {
      console.warn("RESEND_API_KEY not set — demo request not emailed:", req.body);
      return res.status(503).json({ error: "Demo request service unavailable" });
    }

    const { name, company, email, phone, city, organization, message } = req.body;

    if (!name || !company || !email || !phone || !city || !organization) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await resend.emails.send({
      from: "SnapPrints Demo Requests <onboarding@resend.dev>",
      to: process.env.TO_EMAIL,
      subject: `New demo request — ${company}`,
      html: `
        <h2>New Demo Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Company/College:</strong> ${company}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>City:</strong> ${city}</p>
        <p><strong>Organization Type:</strong> ${organization}</p>
        <p><strong>Message:</strong> ${message || "—"}</p>
      `,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("REQUEST DEMO ERROR:", err);
    res.status(500).json({ error: "Failed to send demo request" });
  }
});

module.exports = router;