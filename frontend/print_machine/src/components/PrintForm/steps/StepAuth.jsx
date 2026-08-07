// steps/StepAuth.jsx
import React from "react";

export default function StepAuth({
  phase,
  name, setName,
  mobile, setMobile,
  otp, setOtp,
  submitting,
  verifying,
  error,
  resendCooldown,
  submitDetails,
  resendOtp,
  verifyOtp,
  changeNumber,
}) {
  const handleDetailsSubmit = (e) => {
    e.preventDefault();
    submitDetails();
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    verifyOtp();
  };

  return (
    <div className="pf-step-enter">
      <p className="pf-section-title">
        {phase === "details" ? "Enter your details to continue" : "Verify your mobile number"}
      </p>

      {phase === "details" ? (
        <form onSubmit={handleDetailsSubmit}>
          <div className="pf-field" style={{ marginBottom: 14 }}>
            <label>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>

          <div className="pf-field" style={{ marginBottom: 14 }}>
            <label>Mobile Number</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              placeholder="10-digit mobile number"
              autoComplete="tel"
            />
          </div>

          {error ? <div className="pf-alert error">⚠ {error}</div> : null}

          <button type="submit" className="pf-btn primary" disabled={submitting} style={{ width: "100%", marginTop: 6 }}>
            {submitting ? (<><span className="pf-spinner" /> Checking...</>) : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleOtpSubmit}>
          <p style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 14 }}>
            OTP sent to <strong>+91 {mobile}</strong>{" "}
            <button type="button" onClick={changeNumber} className="pf-link-btn">
              Change
            </button>
          </p>

          <div className="pf-field" style={{ marginBottom: 14 }}>
            <label>Enter OTP</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="6-digit OTP"
              autoComplete="one-time-code"
              className="pf-otp-input"
            />
          </div>

          {error ? <div className="pf-alert error">⚠ {error}</div> : null}

          <button type="submit" className="pf-btn primary" disabled={verifying} style={{ width: "100%", marginTop: 6 }}>
            {verifying ? (<><span className="pf-spinner" /> Verifying...</>) : "Verify & Continue"}
          </button>

          <button
            type="button"
            onClick={resendOtp}
            disabled={resendCooldown > 0 || submitting}
            className="pf-link-btn"
            style={{ display: "block", margin: "12px auto 0" }}
          >
            {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : "Resend OTP"}
          </button>
        </form>
      )}
    </div>
  );
}