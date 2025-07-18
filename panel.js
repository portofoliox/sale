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

function findBotEntry(folder) {
  const entries = fs.readdirSync(folder);
  for (const e of entries) {
    const full = path.join(folder, e);
    if (fs.statSync(full).isFile() && e.toLowerCase() === 'index.js') return full;
  }
  for (const e of entries) {
    const full = path.join(folder, e);
    if (fs.statSync(full).isDirectory()) {
      const found = findBotEntry(full);
      if (found) return found;
    }
  }
  return null;
}

app.get('/', (req, res) => {
  const bots = fs.readdirSync(BOTS_DIR);
  const nodeVersions = ['14.x', '16.x', '18.x', '20.x'];
  res.render('index', { bots, nodeVersions });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/');
  const zip = new AdmZip(req.file.path);
  const name = path.parse(req.file.originalname).name.replace(/[^a-zA-Z0-9-_]/g, '');
  const temp = path.join(__dirname, 'uploads', name);
  zip.extractAllTo(temp, true);
  const entry = findBotEntry(temp);
  if (!entry) return res.redirect('/');
  const srcDir = path.dirname(entry);
  const dest = path.join(BOTS_DIR, name);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
  fs.renameSync(srcDir, dest);
  fs.rmSync(req.file.path);
  fs.rmSync(temp, { recursive: true });
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

app.post('/install-node/:bot', (req, res) => {
  const version = req.body.version;
  exec(`curl -fsSL https://deb.nodesource.com/setup_${version} | bash - && apt-get install -y nodejs`, () => res.redirect('/'));
});

app.get('/files/:bot', (req, res) => {
  const dir = path.join(BOTS_DIR, req.params.bot);
  const list = [];
  function walk(base, rel='') {
    fs.readdirSync(base).forEach(name => {
      const full = path.join(base, name);
      const rpath = path.join(rel, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full, rpath);
      } else {
        list.push(rpath);
      }
    });
  }
  walk(dir);
  res.json(list);
});

app.get('/file/:bot/*', (req, res) => {
  const rel = req.params[0];
  const full = path.join(BOTS_DIR, req.params.bot, rel);
  res.sendFile(full);
});

app.post('/file/edit/:bot', (req, res) => {
  const { path: rel, content } = req.body;
  fs.writeFileSync(path.join(BOTS_DIR, req.params.bot, rel), content);
  res.redirect('/');
});

app.post('/file/delete/:bot', (req, res) => {
  fs.rmSync(path.join(BOTS_DIR, req.params.bot, req.body.path));
  res.redirect('/');
});

io.on('connection', socket => {
  socket.on('logs', bot => {
    const log = exec(`pm2 logs ${bot} --no-color --lines 100`);
    log.stdout.on('data', d => socket.emit('log', d));
  });
});

http.listen(3000, () => console.log('ADPanel Final v3 running on http://localhost:3000'));
