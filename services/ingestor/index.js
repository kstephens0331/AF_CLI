import express from "express";
import multer from "multer";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

async function extractPdf(buffer) {
  try {
    const { default: pdfParse } = await import("pdf-parse");
    const data = await pdfParse(buffer);
    return { kind: "pdf", outline: [], text: data.text || "" };
  } catch {
    return { kind: "pdf", outline: [], text: "" };
  }
}

app.post("/extract", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "file missing" });
  const mimetype = file.mimetype || "";
  let out = { kind: "unknown", outline: [], text: "" };

  if (mimetype.includes("pdf")) {
    out = await extractPdf(file.buffer);
  } else if (mimetype.includes("text") || file.originalname?.endsWith(".txt")) {
    out = { kind: "txt", outline: [], text: file.buffer.toString("utf8") };
  } else {
    out = { kind: "bin", outline: [], text: "" };
  }

  res.json({ ok: true, ...out });
});

const port = Number(process.env.PORT || 8082);
app.listen(port, () => console.log(`Ingestor listening on :${port}`));
