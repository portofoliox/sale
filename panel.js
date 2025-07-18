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
const NODE_VERSIONS_DIR = path.join(__dirname, 'node_versions');
if (!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR);
if (!fs.existsSync(NODE_VERSIONS_DIR)) fs.mkdirSync(NODE_VERSIONS_DIR);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Utils
function findBotJS(folder) {
  const files = fs.readdirSync(folder);
  for (const file of files) {
    const full = path.join(folder, file);
    if (fs.statSync(full).isFile() && file.toLowerCase() === 'index.js') {
      return full;
    }
  }
  for (const file of files) {
    const full = path.join(folder, file);
    if (fs.statSync(full).isDirectory()) {
      const found = findBotJS(full);
      if (found) return found;
    }
  }
  return null;
}

// Home
app.get('/', (req, res) => {
  const bots = fs.readdirSync(BOTS_DIR);
  const nodeVersions = ['14.x', '16.x', '18.x', '20.x'];
  res.render('index', { bots, nodeVersions });
});

// Install Node.js version
app.post('/install-node', (req, res) => {
  const version = req.body.version;
  const script = `curl -fsSL https://deb.nodesource.com/setup_${version} | bash - && apt-get install -y nodejs`;
  exec(script, (err) => {
    res.redirect('/');
  });
});

// Upload bot zip
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/');
  const zip = new AdmZip(req.file.path);
  const name = path.parse(req.file.originalname).name.replace(/[^a-zA-Z0-9-_]/g, '');
  const temp = path.join(__dirname, 'uploads', name);
  zip.extractAllTo(temp, true);
  const src = findBotJS(temp);
  if (!src) return res.redirect('/');
  const dest = path.join(BOTS_DIR, name);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
  fs.mkdirSync(dest);
  fs.readdirSync(temp).forEach(f => {
    fs.renameSync(path.join(temp, f), path.join(dest, f));
  });
  fs.rmSync(req.file.path);
  fs.rmSync(temp, { recursive: true });
  res.redirect('/');
});

// Start/Stop/Restart
['start','stop','restart'].forEach(cmd => {
  app.post(`/${cmd}/:bot`, (req, res) => {
    const bot = req.params.bot;
    const botPath = findBotJS(path.join(BOTS_DIR, bot));
    if (!botPath) return res.redirect('/');
    exec(`pm2 ${cmd} ${botPath} --name "${bot}"`, () => res.redirect('/'));
  });
});

// File manager API
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
  const full = path.join(BOTS_DIR, req.params.bot, rel);
  fs.writeFileSync(full, content);
  res.redirect('/');
});
app.post('/file/delete/:bot', (req, res) => {
  const full = path.join(BOTS_DIR, req.params.bot, req.body.path);
  fs.rmSync(full);
  res.redirect('/');
});

// Console logs
io.on('connection', socket => {
  socket.on('logs', bot => {
    const log = exec(`pm2 logs ${bot} --no-color --lines 100`);
    log.stdout.on('data', d => socket.emit('log', d));
  });
});

http.listen(3000, () => console.log('ADPanel v3 running on http://localhost:3000'));
