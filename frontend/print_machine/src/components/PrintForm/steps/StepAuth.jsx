// steps/StepAuth.jsx
import React, { useEffect, useRef } from "react";
import { MdPerson, MdPhoneIphone, MdArrowBack, MdLockOutline } from "react-icons/md";

const OTP_LENGTH = 6;

function OtpBoxes({ value, onChange, disabled }) {
  const inputsRef = useRef([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || "");

  const focusBox = (index) => {
    const el = inputsRef.current[index];
    if (el) el.focus();
  };

  const handleChange = (index, raw) => {
    const clean = raw.replace(/\D/g, "");

    if (!clean) {
      const chars = value.split("");
      chars[index] = "";
      onChange(chars.join(""));
      return;
    }

    // Handles both a single keystroke and a multi-digit paste landing in one box
    const chars = value.split("");
    for (let i = 0; i < clean.length && index + i < OTP_LENGTH; i++) {
      chars[index + i] = clean[i];
    }
    const next = chars.join("").slice(0, OTP_LENGTH);
    onChange(next);
    focusBox(Math.min(index + clean.length, OTP_LENGTH - 1));
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      focusBox(index - 1);
    }
    if (e.key === "ArrowLeft" && index > 0) focusBox(index - 1);
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) focusBox(index + 1);
  };

  const handlePaste = (e) => {
    const raw = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!raw) return;
    e.preventDefault();
    onChange(raw);
    focusBox(Math.min(raw.length, OTP_LENGTH - 1));
  };

  return (
    <div className="pf-otp-boxes" onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => (inputsRef.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="pf-otp-box"
          aria-label={`OTP digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

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
  // Auto-submit the moment all 6 digits are in — feels instant, like every
  // major OTP flow (bank apps, Netflix, Swiggy).
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (otp.length === OTP_LENGTH && !verifying && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      verifyOtp();
    }
    if (otp.length < OTP_LENGTH) {
      autoSubmittedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const handleDetailsSubmit = (e) => {
    e.preventDefault();
    submitDetails();
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    verifyOtp();
  };

  const detailsValid = name.trim().length > 1 && mobile.length === 10;

  return (
    <div className="pf-step-enter">
      <div className="pf-auth-hero">
        <div className="pf-auth-hero-icon">
          {phase === "details" ? <MdPerson size={26} /> : <MdLockOutline size={26} />}
        </div>
        {phase === "details" ? (
          <>
            <h2>Welcome to SnapPrints</h2>
            <p>Enter your details to start printing</p>
          </>
        ) : (
          <>
            <h2>Verify your number</h2>
            <p>
              Code sent to <strong>+91 {mobile}</strong>
            </p>
          </>
        )}
      </div>

      {phase === "details" ? (
        <form onSubmit={handleDetailsSubmit}>
          <div className="pf-field" style={{ marginBottom: 14 }}>
            <label>Full Name</label>
            <div className="pf-input-icon-wrap">
              <MdPerson size={17} />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                autoComplete="name"
              />
            </div>
          </div>

          <div className="pf-field" style={{ marginBottom: 14 }}>
            <label>Mobile Number</label>
            <div className="pf-input-icon-wrap mobile">
              <MdPhoneIphone size={17} />
              <span className="pf-input-prefix">+91</span>
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
          </div>

          {error ? <div className="pf-alert error">⚠ {error}</div> : null}

          <button
            type="submit"
            className="pf-btn primary"
            disabled={submitting || !detailsValid}
            style={{ width: "100%", marginTop: 6 }}
          >
            {submitting ? (<><span className="pf-spinner" /> Checking...</>) : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleOtpSubmit}>
          <button type="button" onClick={changeNumber} className="pf-auth-back">
            <MdArrowBack size={14} /> Change number
          </button>

          <div className="pf-field" style={{ marginBottom: 6 }}>
            <label>Enter OTP</label>
            <OtpBoxes value={otp} onChange={setOtp} disabled={verifying} />
          </div>

          {error ? <div className="pf-alert error" style={{ marginTop: 12 }}>⚠ {error}</div> : null}

          <button
            type="submit"
            className="pf-btn primary"
            disabled={verifying || otp.length !== OTP_LENGTH}
            style={{ width: "100%", marginTop: 16 }}
          >
            {verifying ? (<><span className="pf-spinner" /> Verifying...</>) : "Verify & Continue"}
          </button>

          <div className="pf-resend-row">
            {resendCooldown > 0 ? (
              <span>Resend OTP in {resendCooldown}s</span>
            ) : (
              <>
                <span>Didn't get it?</span>
                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={submitting}
                  className="pf-link-btn"
                >
                  Resend OTP
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
}