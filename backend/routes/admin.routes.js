const express = require("express");
const router = express.Router();

const admin = require("../controllers/admin.controller");

router.get("/stats", admin.getStats);

router.post("/createmachine", admin.createMachine)

router.get("/machines", admin.getMachines);

router.get("/alerts", admin.getAlerts);

router.get("/live-jobs", admin.getLiveJobs);

router.get("/revenue", admin.getRevenue);

router.get("/machineinfo", admin.getMachineInfo)

router.get("/machine-report/:machineId", admin.machineReport);

router.put("/machines/:machineId", admin.updateMachine);

router.delete("/machines/:machineId", admin.deleteMachine);

module.exports = router;