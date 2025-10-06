import express from "express";
import multer from "multer";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.post("/transcribe", upload.single("file"), async (req, res) => {
  // Mock transcription for now; can be replaced with Faster-Whisper later.
  const name = req.file?.originalname || "audio";
  res.json({
    ok: true,
    file: name,
    duration_sec: 300,
    segments: [
      { start: 0, end: 60, text: "Intro / objectives." },
      { start: 60, end: 180, text: "Core physiology." },
      { start: 180, end: 300, text: "Path and pearls." }
    ]
  });
});

const port = Number(process.env.PORT || 8081);
app.listen(port, () => console.log(`Transcriber listening on :${port}`));
