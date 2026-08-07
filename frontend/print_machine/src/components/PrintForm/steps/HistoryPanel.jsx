// HistoryPanel.jsx
import React, { useEffect, useState, useCallback } from "react";
import { MdClose, MdEdit, MdCheck } from "react-icons/md";

const API_BASE = process.env.REACT_APP_API_BASE || "https://snapprints-production-b39c.up.railway.app/api";

const STATUS_LABELS = {
  CREATED: "Created", PRICED: "Priced", PAYING: "Paying",
  PAID: "Paid", PRINTING: "Printing", PRINTED: "Printed",
  FAILED: "Failed", EXPIRED: "Expired",
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryPanel({ open, onClose, authUser, onNameUpdated }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(authUser?.user?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");

  const token = authUser?.token;

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/customer/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load history");
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err.message || "Could not load history");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (open) {
      setNameDraft(authUser?.user?.name || "");
      setEditingName(false);
      fetchHistory();
    }
  }, [open, fetchHistory, authUser]);

  const saveName = async () => {
    if (!nameDraft.trim()) {
      setNameError("Name can't be empty");
      return;
    }
    setNameError("");
    setSavingName(true);
    try {
      const res = await fetch(`${API_BASE}/customer/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: nameDraft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update name");
      onNameUpdated?.(data.name);
      setEditingName(false);
    } catch (err) {
      setNameError(err.message || "Could not update name");
    } finally {
      setSavingName(false);
    }
  };

  if (!open) return null;

  return (
    <div className="pf-drawer-overlay" onClick={onClose}>
      <div className="pf-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="pf-drawer-header">
          <h3>My Account</h3>
          <button className="pf-drawer-close" onClick={onClose}><MdClose size={20} /></button>
        </div>

        <div className="pf-drawer-profile">
          <div className="pf-drawer-profile-row">
            {!editingName ? (
              <>
                <span className="pf-drawer-name">{authUser?.user?.name}</span>
                <button className="pf-icon-btn" onClick={() => setEditingName(true)}>
                  <MdEdit size={16} />
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="pf-drawer-name-input"
                  autoFocus
                />
                <button className="pf-icon-btn" onClick={saveName} disabled={savingName}>
                  <MdCheck size={18} />
                </button>
              </>
            )}
          </div>
          <span className="pf-drawer-mobile">+91 {authUser?.mobile}</span>
          {nameError ? <div className="pf-alert error" style={{ marginTop: 8 }}>⚠ {nameError}</div> : null}
        </div>

        <div className="pf-divider" />
        <p className="pf-section-title">Print History</p>

        <div className="pf-drawer-history">
          {loading ? (
            <div className="pf-preview-loading"><span className="pf-spinner dark" /><span>Loading...</span></div>
          ) : error ? (
            <div className="pf-alert error">⚠ {error}</div>
          ) : jobs.length === 0 ? (
            <p className="pf-drawer-empty">No print jobs yet</p>
          ) : (
            jobs.map((job) => (
              <div key={job.job_id} className="pf-history-item">
                <div className="pf-history-top">
                  <span className="pf-history-file">{job.file_name}</span>
                  <span className={`pf-history-status status-${job.status.toLowerCase()}`}>
                    {STATUS_LABELS[job.status] || job.status}
                  </span>
                </div>
                <div className="pf-history-bottom">
                  <span>{formatDate(job.created_at)}</span>
                  <span className="pf-history-amount">
                    {job.amount != null ? `₹${job.amount}` : "—"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}