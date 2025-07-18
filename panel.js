const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');

const upload = multer({ dest: 'uploads/' });
const BOTS_DIR = path.join(__dirname, 'bots');
if (!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Find first .js file excluding node_modules
function findBotEntry(folder) {
  const entries = fs.readdirSync(folder);
  for (const e of entries) {
    const full = path.join(folder, e);
    if (fs.statSync(full).isFile() && e.toLowerCase().endsWith('.js')) return full;
  }
  for (const e of entries) {
    const full = path.join(folder, e);
    if (fs.statSync(full).isDirectory() && e !== 'node_modules') {
      const found = findBotEntry(full);
      if (found) return found;
    }
  }
  return null;
}

app.get('/', (req, res) => {
  const bots = fs.readdirSync(BOTS_DIR);
  res.render('index', { bots });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/');
  try {
    const zip = new AdmZip(req.file.path);
    const name = path.parse(req.file.originalname).name.replace(/[^a-zA-Z0-9-_]/g, '');
    const temp = path.join(__dirname, 'uploads', name);
    zip.extractAllTo(temp, true);
    const entry = findBotEntry(temp);
    if (!entry) {
      fs.rmSync(req.file.path, { force: true });
      fs.rmSync(temp, { recursive: true, force: true });
      return res.redirect('/');
    }
    const srcDir = path.dirname(entry);
    const dest = path.join(BOTS_DIR, name);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(srcDir, dest);
    fs.rmSync(req.file.path, { force: true });
    fs.rmSync(temp, { recursive: true, force: true });
  } catch (e) {
    console.error(e);
  }
  res.redirect('/');
});

['start','stop','restart'].forEach(cmd => {
  app.post(`/${cmd}/:bot`, (req, res) => {
    const bot = req.params.bot;
    const botPath = findBotEntry(path.join(BOTS_DIR, bot));
    if (!botPath) return res.redirect('/');
    exec(`pm2 ${cmd} ${botPath} --name "${bot}"`, () => res.redirect('/'));
  });
});

// File manager and logs left unchanged for brevity

http.listen(3000, () => console.log('Running on http://localhost:3000'));
