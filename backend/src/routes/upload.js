import { Router } from "express";
import { uploadAndParsePdf } from "../controllers/uploadController.js";
import { uploadPdf } from "../middleware/upload.js";

const router = Router();

router.post("/", uploadPdf.single("file"), uploadAndParsePdf);

export default router;
