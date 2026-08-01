// kioskCore.js — Raspberry Pi Ready — Option C (Hybrid: Socket + Disk Cache)
const axios        = require("axios");
const fs           = require("fs");
const path         = require("path");
const { exec }     = require("child_process");
const crypto       = require("crypto");
const os           = require("os");
const readline     = require("readline");
const { io: socketIO } = require("socket.io-client");

/* ===============================
   CONFIG
=============================== */
const IS_PI      = process.platform === "linux";
const IS_WINDOWS = process.platform === "win32";

const PROJECT_ROOT = IS_PI
  ? "/home/pi/kiosk"
  : path.resolve(__dirname);

const FALLBACK_API_BASE  = "https://snapprints-production-b39c.up.railway.app/api";
const CONFIG_FILE        = path.join(PROJECT_ROOT, "config.json");
const DOWNLOAD_DIR       = path.join(PROJECT_ROOT, "kiosk", "files");
const CACHE_FILE         = path.join(PROJECT_ROOT, "kiosk", "jobs.json");
const HEARTBEAT_INTERVAL = 30000;
const POLL_INTERVAL      = 30000;

/* ===============================
   LOAD API_BASE FROM CONFIG
=============================== */
function getApiBase() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8").trim();
      if (raw) {
        const config = JSON.parse(raw);
        if (config.API_BASE) {
          console.log("🌐 API_BASE loaded from config:", config.API_BASE);
          return config.API_BASE;
        }
      }
    }
  } catch (err) {
    console.warn("⚠️  Could not read API_BASE from config, using fallback:", err.message);
  }
  console.log("🌐 API_BASE using fallback:", FALLBACK_API_BASE);
  return FALLBACK_API_BASE;
}

let API_BASE = getApiBase();

/* ===============================
   GLOBALS
=============================== */
let MACHINE_ID   = null;
let API_KEY      = null;
let PRINTER_NAME = null;
let fileCache    = {};

/* ===============================
   NETWORK WAIT
   ✅ FIX: Waits until DNS resolves before proceeding.
   Pi takes 5-15s after boot to get network. Without this,
   the app crashes immediately with EAI_AGAIN.
=============================== */
const dns = require("dns").promises;

// async function waitForNetwork(maxWaitMs = 60000) {
//   const hostname = new URL(API_BASE).hostname;
//   const interval = 3000;
//   const attempts = Math.ceil(maxWaitMs / interval);

//   console.log(`🌐 Waiting for network (DNS: ${hostname})...`);

//   for (let i = 1; i <= attempts; i++) {
//     try {
//       await dns.lookup(hostname);
//       console.log(`✅ Network ready (attempt ${i})`);
//       return true;
//     } catch (err) {
//       console.log(`⏳ Network not ready yet (attempt ${i}/${attempts}): ${err.message}`);
//       await delay(interval);
//     }
//   }

//   console.error("❌ Network never became available — giving up after", maxWaitMs / 1000, "seconds");
//   return false;
// }

async function waitForNetwork(maxWaitMs = 90000) {   // was 60000
  const hostname = new URL(API_BASE).hostname;
  const interval = 5000;                              // was 3000
  const attempts = Math.ceil(maxWaitMs / interval);

  // ✅ FIX: Give Pi network stack time to initialize before first DNS attempt
  console.log("⏳ Pausing 10s for network stack to initialize...");
  await delay(10000);

  console.log(`🌐 Waiting for network (DNS: ${hostname})...`);

  for (let i = 1; i <= attempts; i++) {
    try {
      await dns.lookup(hostname);
      console.log(`✅ Network ready (attempt ${i})`);
      return true;
    } catch (err) {
      console.log(`⏳ Network not ready yet (attempt ${i}/${attempts}): ${err.message}`);
      await delay(interval);
    }
  }

  console.error("❌ Network never became available — giving up after", maxWaitMs / 1000, "seconds");
  return false;
}

/* ===============================
   DELAY HELPER
=============================== */
const delay = ms => new Promise(r => setTimeout(r, ms));

/* ===============================
   CACHE HELPERS
=============================== */
function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = fs.readFileSync(CACHE_FILE, "utf-8").trim();
    if (!raw) return;
    fileCache = JSON.parse(raw);
    const now = Date.now();
    for (const jobId of Object.keys(fileCache)) {
      if (fileCache[jobId].expires < now) {
        safeDelete(fileCache[jobId].filePath);
        delete fileCache[jobId];
      }
    }
    console.log(`📦 Cache loaded: ${Object.keys(fileCache).length} job(s)`);
  } catch (err) {
    console.error("Cache load error:", err.message);
    fileCache = {};
  }
}

function saveCache() {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(fileCache, null, 2)); }
  catch (err) { console.error("Cache save error:", err.message); }
}

function addToCache(jobId, filePath, expiresAt) {
  fileCache[jobId] = { filePath, expires: new Date(expiresAt).getTime() };
  saveCache();
}

function getFromCache(jobId) {
  const entry = fileCache[jobId];
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    safeDelete(entry.filePath);
    delete fileCache[jobId];
    saveCache();
    return null;
  }
  return entry.filePath;
}

function removeFromCache(jobId) {
  delete fileCache[jobId];
  saveCache();
}

function safeDelete(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

/* ===============================
   ENSURE DIRS
=============================== */
function ensureDir() {
  [DOWNLOAD_DIR, path.dirname(CACHE_FILE)].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

/* ===============================
   DEVICE SERIAL
=============================== */
function getDeviceSerial() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        return iface.mac;
      }
    }
  }
  return os.hostname();
}

/* ===============================
   REGISTER MACHINE
   ✅ Retries on network failure instead of crashing
=============================== */
async function registerMachine(retries = 5) {
  console.log("🔄 Registering machine...");
  const deviceSerial = getDeviceSerial();
  console.log("🔑 Device serial (MAC):", deviceSerial);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(
        `${API_BASE}/register-machine`,
        { deviceSerial },
        { timeout: 15000 }
      );
      console.log("📡 Server registration response:", JSON.stringify(res.data));

      const machineId = res.data.MACHINE_ID || res.data.machine_id || res.data.machineId;
      if (!machineId) {
        throw new Error(
          `Server did not return MACHINE_ID. Keys: ${Object.keys(res.data).join(", ")}`
        );
      }

      const apiKey  = res.data.API_KEY  || res.data.api_key  || res.data.apiKey;
      const apiBase = res.data.API_BASE || res.data.api_base || res.data.apiBase || API_BASE;

      if (!apiKey) {
        throw new Error(`Server did not return API_KEY. Keys: ${Object.keys(res.data).join(", ")}`);
      }

      const fullConfig = {
        MACHINE_ID:    machineId,
        DEVICE_SERIAL: deviceSerial,
        API_KEY:       apiKey,
        API_BASE:      apiBase,
        PRINTER_NAME:  null,
      };

      fs.writeFileSync(CONFIG_FILE, JSON.stringify(fullConfig, null, 2));
      console.log("✅ Machine registered — MACHINE_ID:", machineId);
      console.log("💾 Config saved to:", CONFIG_FILE);
      return fullConfig;

    } catch (err) {
      const isNetwork = err.code === "EAI_AGAIN" || err.code === "ENOTFOUND" || err.code === "ECONNREFUSED";
      console.error(
  `❌ Registration attempt ${attempt}/${retries} failed:`,
  err.response?.data || err.message
);

      if (attempt < retries) {
        const wait = isNetwork ? 5000 : 3000;
        console.log(`⏳ Retrying in ${wait / 1000}s...`);
        await delay(wait);
      } else {
        throw new Error(`Registration failed after ${retries} attempts: ${err.message}`);
      }
    }
  }
}

/* ===============================
   LOAD / SAVE CONFIG
=============================== */
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const data = fs.readFileSync(CONFIG_FILE, "utf-8").trim();
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    try { fs.unlinkSync(CONFIG_FILE); } catch {}
    return null;
  }
}

function saveConfig(updates) {
  const current = loadConfig() || {};
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...updates }, null, 2));
}

/* ===============================
   VERIFY KEY WITH SERVER
=============================== */
async function verifyKeyWithServer(machineId, apiKey, apiBase) {
  try {
    console.log("🔍 Verifying saved API key with server...");
    const body      = { status: "CHECK" };
    const timestamp = Date.now().toString();
    const signature = crypto
      .createHmac("sha256", apiKey)
      .update(machineId + timestamp + JSON.stringify(body))
      .digest("hex");

    await axios.post(`${apiBase}/kiosk/heartbeat`, body, {
      headers: {
        "X-Machine-Id": machineId,
        "X-Api-Key":    apiKey,
        "X-Timestamp":  timestamp,
        "X-Signature":  signature,
      },
      timeout: 10000,
    });
    console.log("✅ API key verified — credentials are valid");
    return true;
  } catch (err) {
    const status = err.response?.status;
    // ✅ Network errors ≠ key rejection — don't wipe config on network failure
    if (err.code === "EAI_AGAIN" || err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
      console.warn("⚠️  Could not verify key — network error (not treating as invalid):", err.message);
      return true; // assume key is still good, network was just unavailable
    }
    console.warn(`⚠️  Key verification failed — HTTP ${status}: ${err.response?.data?.error || err.message}`);
    return false;
  }
}

/* ===============================
   INIT MACHINE
   ✅ FIX: Waits for network first, retries registration,
   never calls process.exit so Electron doesn't die.
   ✅ FIX: Distinguishes network errors from auth errors
   so it doesn't wipe config.json on a DNS failure.
=============================== */
async function initMachine() {
  // ✅ Wait up to 60s for network before doing anything
  const networkOk = await waitForNetwork(60000);
  if (!networkOk) {
    // If we have a valid saved config, continue offline — heartbeat will retry
    const config = loadConfig();
    if (config?.MACHINE_ID && config?.API_KEY) {
      console.warn("⚠️  No network at boot — using cached config, will retry online ops later");
      MACHINE_ID = config.MACHINE_ID;
      API_KEY    = config.API_KEY;
      if (config.API_BASE)      API_BASE      = config.API_BASE;
      if (config.PRINTER_NAME)  PRINTER_NAME  = config.PRINTER_NAME;
      return;
    }
    throw new Error("No network and no saved config — cannot start");
  }

  let config = loadConfig();

  const isMacAddress = config?.MACHINE_ID &&
    /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(config.MACHINE_ID);

  const hasValidConfig = config?.API_KEY && config?.MACHINE_ID && !isMacAddress;

  if (!hasValidConfig) {
    if (isMacAddress) {
      console.log("⚠️  Old config — MACHINE_ID is a MAC. Re-registering...");
    } else {
      console.log("⚠️  Config missing or incomplete — registering...");
    }
    try { fs.unlinkSync(CONFIG_FILE); } catch {}
    config = await registerMachine();
  } else {
    // Verify key is still valid
    const keyOk = await verifyKeyWithServer(
      config.MACHINE_ID, config.API_KEY, config.API_BASE || API_BASE
    );
    if (!keyOk) {
      console.log("🔄 Key rejected by server — re-registering...");
      try { fs.unlinkSync(CONFIG_FILE); } catch {}
      config = await registerMachine();
    }
  }

  MACHINE_ID = config.MACHINE_ID;
  API_KEY    = config.API_KEY;
  if (config.API_BASE)     API_BASE     = config.API_BASE;
  if (config.PRINTER_NAME) PRINTER_NAME = config.PRINTER_NAME;

  console.log("✅ Machine Ready");
  console.log("   MACHINE_ID :", MACHINE_ID);
  console.log("   API_BASE   :", API_BASE);
  console.log("   Platform   :", process.platform, IS_PI ? "(Raspberry Pi)" : "(Laptop/Dev)");
  console.log("   Config     :", CONFIG_FILE);
}

/* ===============================
   SECURITY
=============================== */
function signRequest(body) {
  const timestamp  = Date.now().toString();
  const bodyString = JSON.stringify(body || {});
  const signature  = crypto
    .createHmac("sha256", API_KEY)
    .update(MACHINE_ID + timestamp + bodyString)
    .digest("hex");
  return { timestamp, signature };
}

function getHeaders(body) {
  const auth = signRequest(body);
  return {
    "X-Machine-Id": MACHINE_ID,
    "X-Api-Key":    API_KEY,
    "X-Timestamp":  auth.timestamp,
    "X-Signature":  auth.signature,
  };
}

/* ===============================
   PRINTER DETECTION
=============================== */
function detectPrinter() {
  return new Promise((resolve, reject) => {
    exec("lpstat -p", (err, stdout) => {
      if (err) return reject(new Error(`lpstat failed: ${err.message}`));
      const match = stdout.match(/printer\s+(\S+)/);
      if (match) return resolve(match[1]);
      reject(new Error("No printer found in lpstat output"));
    });
  });
}

async function ensurePrinter() {
  const config = loadConfig();
  if (config?.PRINTER_NAME) {
    PRINTER_NAME = config.PRINTER_NAME;
    console.log("✅ Printer loaded from config:", PRINTER_NAME);
    return;
  }
  if (IS_WINDOWS) {
    console.log("⚠️  Windows detected — skipping printer detection");
    return;
  }
  try {
    PRINTER_NAME = await detectPrinter();
    console.log("✅ Printer detected:", PRINTER_NAME);
    saveConfig({ PRINTER_NAME });
  } catch (err) {
    console.log("⚠️  No printer detected:", err.message);
    console.log("🔄 Retrying printer detection in 5s...");
    setTimeout(ensurePrinter, 5000);
  }
}

/* ===============================
   DOWNLOAD FILE
=============================== */
async function downloadFile(fileUrl, jobId = null) {
  let url;
  if (fileUrl.startsWith("http")) {
    url = fileUrl;
  } else {
    const filename = fileUrl.includes("\\")
      ? fileUrl.split("\\").pop()
      : fileUrl.split("/").pop();
    url = `${API_BASE.replace("/api", "")}/uploads/${filename}`;
  }
  console.log("⬇️  Downloading from URL:", url);
  const filename = jobId ? `${jobId}.pdf` : `${Date.now()}.pdf`;
  const filePath = path.join(DOWNLOAD_DIR, filename);
  const response = await axios({ url, method: "GET", responseType: "arraybuffer", timeout: 30000 });
  fs.writeFileSync(filePath, Buffer.from(response.data));
  console.log("✅ File written to:", filePath);
  return filePath;
}

/* ===============================
   PRE-FETCH
=============================== */
async function preFetchJob(jobId, filePath, expiresAt) {
  const cached = getFromCache(jobId);
  if (cached && fs.existsSync(cached)) {
    console.log(`📦 Already cached: ${jobId}`);
    return;
  }
  try {
    console.log(`⬇️  Pre-fetching: ${jobId}`);
    const localPath = await downloadFile(filePath, jobId);
    addToCache(jobId, localPath, expiresAt);
    console.log(`✅ Cached: ${jobId} → ${localPath}`);
  } catch (err) {
    console.error(`❌ Pre-fetch failed for ${jobId}:`, err.message);
  }
}

/* ===============================
   SOCKET
=============================== */
function connectSocket() {
  const serverBase = API_BASE.replace("/api", "");
  const socket = socketIO(serverBase, {
    reconnection: true, reconnectionDelay: 3000, reconnectionDelayMax: 10000,
  });
  socket.on("connect", () => {
    console.log("🔌 Socket connected to", serverBase);
    if (typeof global.onSocketStatus === "function") global.onSocketStatus("connected");
  });
  socket.on("payment_success", ({ jobId, machineId, filePath }) => {
    if (machineId !== MACHINE_ID) return;
    preFetchJob(jobId, filePath, Date.now() + 5 * 60 * 1000);
  });
  socket.on("disconnect", (reason) => {
    console.log("🔌 Socket disconnected:", reason);
    if (typeof global.onSocketStatus === "function") global.onSocketStatus("disconnected");
  });
  socket.on("connect_error", (err) => console.log("🔌 Socket connect error:", err.message));
}

/* ===============================
   POLLER
=============================== */
async function startPoller() {
  async function poll() {
    try {
      const body = {};
      const res  = await axios.get(`${API_BASE}/kiosk/pending-jobs`, {
        headers: getHeaders(body), timeout: 15000,
      });
      const { jobs } = res.data;
      if (jobs.length > 0) console.log(`🔍 Poller found ${jobs.length} pending job(s)`);
      for (const job of jobs) {
        await preFetchJob(job.job_id, job.file_path, Date.now() + 5 * 60 * 1000);
      }
    } catch (err) {
      console.log("🔍 Poller error:", err.response?.data?.error || err.message);
    }
  }
  await poll();
  setInterval(poll, POLL_INTERVAL);
}

/* ===============================
   PRINT FILE
=============================== */
function printFile(filePath, job) {
  if (!PRINTER_NAME) throw new Error("Printer not ready — not detected yet");
  const copies = job.copies || 1;
  let command;
  if (IS_WINDOWS) {
    const sumatraPath   = `C:\\Program Files\\SumatraPDF\\SumatraPDF.exe`;
    const sumatraPath86 = `C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe`;
    const sumatra = fs.existsSync(sumatraPath) ? sumatraPath
                  : fs.existsSync(sumatraPath86) ? sumatraPath86 : null;
    if (sumatra) {
      const duplexSetting = job.printSide === "duplex" ? ",duplexlong" : "";
      const colorSetting  = job.color === "bw" ? ",monochrome" : ",color";
      command = `"${sumatra}" -print-to "${PRINTER_NAME}" -print-settings "${copies}x${duplexSetting}${colorSetting}" -silent "${filePath}"`;
    } else {
      const adobePath = `C:\\Program Files (x86)\\Adobe\\Acrobat Reader DC\\Reader\\AcroRd32.exe`;
      command = fs.existsSync(adobePath)
        ? `"${adobePath}" /t "${filePath}" "${PRINTER_NAME}"`
        : `rundll32 mshtml.dll,PrintHTML "${filePath}"`;
    }
  } else {
    const sides = job.printSide === "duplex" ? "-o sides=two-sided-long-edge" : "-o sides=one-sided";
    const color = job.color === "bw" ? "-o ColorModel=Gray" : "";
    const media = job.paperSize === "A3" ? "-o media=A3" : "-o media=A4";
    command = ["lp", `-d "${PRINTER_NAME}"`, `-n ${copies}`, sides, color, media, `"${filePath}"`]
      .filter(Boolean).join(" ");
  }
  console.log("🖨 Print command:", command);
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) { console.error("🖨 Print exec error:", err.message); return reject(err); }
      if (stderr) console.log("🖨 Print stderr:", stderr);
      console.log("🖨 Print stdout:", stdout);
      resolve(stdout);
    });
  });
}

/* ===============================
   HEARTBEAT
   ✅ Auto re-registers on 401/403
=============================== */
function startHeartbeat() {
  async function beat() {
    try {
      const body = {
        cpu_usage:   os.loadavg()[0],
        paper_level: 80,
        ink_level:   60,
        status:      "ONLINE",
        printer:     PRINTER_NAME || "NOT_DETECTED",
      };
      await axios.post(`${API_BASE}/kiosk/heartbeat`, body, {
        headers: getHeaders(body), timeout: 10000,
      });
      console.log("💓 Heartbeat sent");
    } catch (err) {
      const status = err.response?.status;
      console.log(`❌ Heartbeat failed (HTTP ${status || err.code}):`, err.response?.data || err.message);

      if (status === 403 || status === 401) {
        console.log("🔄 Auth failure during heartbeat — re-registering...");
        try {
          try { fs.unlinkSync(CONFIG_FILE); } catch {}
          const config = await registerMachine();
          MACHINE_ID = config.MACHINE_ID;
          API_KEY    = config.API_KEY;
          if (config.API_BASE) API_BASE = config.API_BASE;
          console.log("✅ Re-registered — heartbeat will resume next cycle");
        } catch (regErr) {
          console.error("❌ Re-registration failed:", regErr.message);
        }
      }
    }
  }
  beat();
  setInterval(beat, HEARTBEAT_INTERVAL);
}

/* ===============================
   INPUT PARSER
=============================== */
function isOtp(input)     { return /^\d{4}$/.test(input); }
function isQrToken(input) { return /^[a-f0-9]{64}$/i.test(input); }

function parseInput(input) {
  input = input.trim();
  if (input.startsWith("PRINTJOB:")) {
    const token = input.replace("PRINTJOB:", "").trim();
    if (isQrToken(token)) return { qrToken: token };
  }
  if (isOtp(input))     return { otp: input };
  if (isQrToken(input)) return { qrToken: input };
  return null;
}

/* ===============================
   MAIN PRINT FLOW
=============================== */
async function handleInput(input) {
  console.log("📥 Input received:", JSON.stringify(input));
  const payload = parseInput(input);
  if (!payload) return "❌ Invalid OTP (must be 4 digits)";

  let localFilePath = null;
  let jobId         = null;

  try {
    const unlockRes = await axios.post(
      `${API_BASE}/kiosk/unlock`, payload,
      { headers: getHeaders(payload), timeout: 15000 }
    );
    const job = unlockRes.data;
    jobId = job.jobId;
    console.log("🔓 Job unlocked:", jobId);

    const cached = getFromCache(jobId);
    if (cached && fs.existsSync(cached)) {
      localFilePath = cached;
      console.log("⚡ Using pre-cached file:", localFilePath);
    } else {
      localFilePath = await downloadFile(job.filePath, jobId);
    }

    if (!fs.existsSync(localFilePath))
      throw new Error(`File not found at: ${localFilePath}`);

    await printFile(localFilePath, job);
    console.log("🖨 Print job sent");

    const markBody = { jobId };
    await axios.post(`${API_BASE}/kiosk/mark-printed`, markBody, {
      headers: getHeaders(markBody), timeout: 10000,
    });
    return "✅ Printed Successfully";

  } catch (err) {
    console.error("❌ handleInput error:", err.response?.data || err.message);
    if (jobId) {
      try {
        const failBody = { jobId };
        await axios.post(`${API_BASE}/kiosk/mark-failed`, failBody, {
          headers: getHeaders(failBody), timeout: 10000,
        });
      } catch {}
    }
    return `❌ ${err.response?.data?.error || err.message || "Unknown error"}`;
  } finally {
    if (jobId) removeFromCache(jobId);
    if (localFilePath && fs.existsSync(localFilePath)) {
      try { fs.unlinkSync(localFilePath); } catch {}
    }
  }
}

/* ===============================
   STATUS
=============================== */
function getStatus() {
  return {
    machineId:    MACHINE_ID,
    apiBase:      API_BASE,
    printer:      PRINTER_NAME || null,
    printerReady: !!PRINTER_NAME,
    cacheSize:    Object.keys(fileCache).length,
    platform:     process.platform,
  };
}

/* ===============================
   MAIN LOOP (CLI only)
=============================== */
async function mainLoop() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));
  console.log("\n📟 Ready — enter OTP or scan QR code\n");
  while (true) {
    try {
      const input = await ask("OTP / QR > ");
      if (!input.trim()) continue;
      console.log("→", await handleInput(input.trim()), "\n");
    } catch (err) {
      console.log("❌ Loop error:", err.message);
    }
  }
}

/* ===============================
   START
=============================== */
if (require.main === module) {
  (async () => {
    ensureDir(); loadCache();
    await initMachine();
    await ensurePrinter();
    startHeartbeat();
    connectSocket();
    await startPoller();
    mainLoop();
  })();
} else {
  (async () => {
    ensureDir(); loadCache();
    await initMachine();
    await ensurePrinter();
    startHeartbeat();
    connectSocket();
    await startPoller();
  })();
}

module.exports = { handleInput, getStatus };
