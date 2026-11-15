import fs from "fs/promises";
import pdfParse from "pdf-parse";

// Standalone PDF upload/parse endpoint — lets the frontend preview parsed
// text before attaching it to a project submission.
export async function uploadAndParsePdf(req, res) {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const buffer = await fs.readFile(req.file.path);
    const parsed = await pdfParse(buffer);
    res.json({
      originalName: req.file.originalname,
      storedPath: req.file.path,
      pageCount: parsed.numpages,
      textExcerpt: parsed.text.slice(0, 6000),
    });
  } catch (err) {
    console.error("[uploadAndParsePdf]", err);
    res.status(500).json({ error: `Failed to parse PDF: ${err.message}` });
  }
}
