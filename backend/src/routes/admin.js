import { Router } from "express";
import { getSystemStats, testGroqController } from "../controllers/adminController.js";

const router = Router();

router.get("/stats", getSystemStats);
router.post("/test-groq", testGroqController);

export default router;
