import { Router } from "express";
import { listAgencies, getAgency } from "../controllers/agencyController.js";

const router = Router();

router.get("/", listAgencies);
router.get("/:slug", getAgency);

export default router;
