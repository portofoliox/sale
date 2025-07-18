const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { spawn, exec } = require('child_process');

const upload = multer({ dest: 'uploads/' });
const BOTS_DIR = path.join(__dirname, 'bots');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const NODE_VERSIONS = ['14.x','16.x','18.x','20.x'];

[BOTS_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.set('view engine','ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  const bots = fs.readdirSync(BOTS_DIR);
  res.render('index', { bots });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/');
  try {
    const zip = new AdmZip(req.file.path);
    const name = path.parse(req.file.originalname).name.replace(/[^\w-]/g,'');
    const temp = path.join(UPLOADS_DIR, name);
    zip.extractAllTo(temp,true);
    function findRoot(dir) {
      const files = fs.readdirSync(dir);
      if (files.some(f=>f.endsWith('.js') || f.endsWith('.html'))) return dir;
      for (const f of files) {
        const full = path.join(dir,f);
        if (fs.statSync(full).isDirectory()) {
          const r = findRoot(full);
          if (r) return r;
        }
      }
      return null;
    }
    const src = findRoot(temp);
    const dest = path.join(BOTS_DIR,name);
    if (fs.existsSync(dest)) fs.rmSync(dest,{recursive:true,force:true});
    fs.renameSync(src,dest);
    fs.rmSync(req.file.path,{force:true});
    fs.rmSync(temp,{recursive:true,force:true});
  } catch(e) { console.error(e); }
  res.redirect('/');
});

app.get('/bot/:bot', (req, res) => {
  const bot = req.params.bot;
  if (!fs.existsSync(path.join(BOTS_DIR,bot))) return res.redirect('/');
  res.render('bot', { bot, nodeVersions: NODE_VERSIONS });
});

app.get('/explore/:bot', (req, res) => {
  const bot = req.params.bot;
  const rel = req.query.path || '';
  const dir = path.join(BOTS_DIR,bot,rel);
  if (!fs.existsSync(dir)) return res.json({ error:'No such directory' });
  const entries = fs.readdirSync(dir).map(name => {
    const full = path.join(dir,name);
    return { name, isDir: fs.statSync(full).isDirectory() };
  });
  res.json({ path: rel, entries });
});

app.get('/file/:bot/*', (req, res) => {
  const full = path.join(BOTS_DIR, req.params.bot, req.params[0]);
  res.sendFile(full);
});

io.on('connection', socket => {
  let proc;
  socket.on('readFile', data => {
    const full = path.join(BOTS_DIR,data.bot,data.path);
    const content = fs.readFileSync(full,'utf8');
    socket.emit('fileData', { path: data.path, content });
  });
  socket.on('writeFile', data => {
    const full = path.join(BOTS_DIR,data.bot,data.path);
    fs.writeFileSync(full, data.content);
    socket.emit('output', `Saved ${data.path}\n`);
  });
  socket.on('deleteFile', data => {
    const full = path.join(BOTS_DIR,data.bot,data.path);
    fs.rmSync(full,{recursive: data.isDir, force:true});
    socket.emit('output', `Deleted ${data.path}\n`);
  });
  socket.on('action', data => {
    if (data.cmd === 'run') {
      if (proc) proc.kill();
      proc = spawn('node', [data.file], { cwd: path.join(BOTS_DIR,data.bot) });
      proc.stdout.on('data', d=> socket.emit('output', d.toString()));
      proc.stderr.on('data', d=> socket.emit('output', d.toString()));
    } else if (data.cmd === 'stop') {
      if (proc) proc.kill();
      socket.emit('output','Process stopped\n');
    } else if (data.cmd === 'install') {
      const script = `curl -fsSL https://deb.nodesource.com/setup_${data.version} | bash - && apt-get install -y nodejs`;
      const p = exec(script);
      p.stdout.on('data', d=> socket.emit('output', d.toString()));
      p.stderr.on('data', d=> socket.emit('output', d.toString()));
    }
  });
});

http.listen(3000,()=>console.log('ADPanel_Final_v12 on http://localhost:3000'));
