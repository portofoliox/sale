const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "tempUploads"); // folder temporar
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname); // nume unic temporar
  },
});

const upload = multer({ storage });

router.post("/upload", upload.single("file"), (req, res) => {
  const bot = req.query.bot;
  const subPath = req.body.path || "";
  const uploadPath = path.join(__dirname, "..", "bots", bot, subPath);

  fs.mkdirSync(uploadPath, { recursive: true });

  const file = req.file;

  if (file.originalname.endsWith(".zip")) {
    try {
      const zip = new AdmZip(file.path);
      zip.extractAllTo(uploadPath, true); // dezarhivează direct aici
      fs.unlinkSync(file.path); // șterge fișierul zip temporar
      return res.send("ZIP uploaded and extracted.");
    } catch (err) {
      return res.status(500).send("Failed to extract ZIP.");
    }
  }

  // Dacă nu e ZIP, mută fișierul normal
  const destPath = path.join(uploadPath, file.originalname);
  fs.renameSync(file.path, destPath);
  res.send("File uploaded.");
});

// ✅ Nou: creare fișier sau folder
router.post("/create", express.json(), (req, res) => {
  const { bot, type, name, path: subPath } = req.body;

  console.log("CREATE request:", { bot, type, name, subPath });

  if (!bot || !type || !name) {
    return res.status(400).send("Missing required fields.");
  }

  if (!/^[\w\-\.]+$/.test(name)) {
    return res.status(400).send("Invalid name.");
  }

  const basePath = path.join(__dirname, "..", "bots", bot);
  const fullPath = path.join(basePath, subPath || "", name);

  if (type === "folder") {
    fs.mkdir(fullPath, { recursive: true }, (err) => {
      if (err) {
        console.error("mkdir error:", err);
        return res.status(500).send("Failed to create folder.");
      }
      res.send("Folder created.");
    });
  } else if (type === "file") {
    fs.writeFile(fullPath, "", (err) => {
      if (err) {
        console.error("writeFile error:", err);
        return res.status(500).send("Failed to create file.");
      }
      res.send("File created.");
    });
  } else {
    res.status(400).send("Invalid type.");
  }
});

router.post("/rename", express.json(), (req, res) => {
  const { bot, oldPath, newName } = req.body;
  if (!bot || !oldPath || !newName) {
    return res.status(400).send("Missing parameters");
  }

  if (!/^[\w\-\.]+$/.test(newName)) {
    return res.status(400).send("Invalid new name");
  }

  const basePath = path.join(__dirname, "..", "bots", bot);
  const oldFullPath = path.join(basePath, oldPath);
  const newFullPath = path.join(path.dirname(oldFullPath), newName);

  if (!fs.existsSync(oldFullPath)) {
    return res.status(404).send("Old file/folder does not exist");
  }

  try {
    fs.renameSync(oldFullPath, newFullPath);
    res.send("Renamed successfully");
  } catch (err) {
    console.error("Rename error:", err);
    res.status(500).send("Rename failed");
  }
});

module.exports = router;
