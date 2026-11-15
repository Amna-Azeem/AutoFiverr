import { Router } from "express";

import {
  createProject,
  listProjects,
  getProject,
  deleteProject,
  rerunProject,
  streamProjectLogs,
  createProjectStreamToken,
  getCrmExportCsv,
  getCrmExportDocx,
} from "../controllers/projectController.js";

import { uploadPdf } from "../middleware/upload.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, listProjects);

router.post(
  "/",
  requireAuth,
  uploadPdf.single("file"),
  createProject
);

router.post("/:id/rerun", requireAuth, rerunProject);

router.get("/:id", requireAuth, getProject);

router.delete("/:id", requireAuth, deleteProject);

router.get("/:id/stream-token", requireAuth, createProjectStreamToken);

router.get("/:id/stream", streamProjectLogs);

router.get("/:id/export.csv", requireAuth, getCrmExportCsv);

router.get("/:id/export.docx", requireAuth, getCrmExportDocx);

export default router;
