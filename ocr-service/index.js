const express = require("express");
const bodyParser = require("body-parser");
const tesseract = require("node-tesseract-ocr");
const fs = require("fs").promises;
const app = express();
const port = 3003;

app.use(bodyParser.json());

const config = {
  lang: "eng",
  oem: 3,
  psm: 3,
};
app.post("/process", async (req, res) => {
  try {
    if (!req.body || !req.body.toString("utf8")) {
      return res.status(400).json({ error: "No file content provided" });
    }
    const text = await tesseract.recognize(req.body.filePath, config);

    console.log(text);
    res.status(200).json({ text });
  } catch (error) {
    console.error("Error processing OCR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`OCR Service is running on http://localhost:${port}`);
});
