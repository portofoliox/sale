const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');

const upload = multer({ dest: 'uploads/' });
const BOTS_DIR = path.join(__dirname, 'bots');

app.set('view engine','ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// List bots
app.get('/', (req, res) => {
  const bots = fs.readdirSync(BOTS_DIR);
  res.render('index', { bots });
});

// Upload ZIP
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/');
  try {
    const zip = new AdmZip(req.file.path);
    const name = path.parse(req.file.originalname).name.replace(/[^\w-]/g,'');
    const temp = path.join(__dirname,'uploads',name);
    zip.extractAllTo(temp,true);
    // find root with js files
    function findRoot(dir) {
      const files = fs.readdirSync(dir);
      if (files.some(f=>f.endsWith('.js'))) return dir;
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
  } catch(e){ console.error(e); }
  res.redirect('/');
});

// Manage page
app.get('/bot/:bot', (req, res) => {
  const bot = req.params.bot;
  res.render('bot', { bot });
});

// Explorer endpoint
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

// File download/read
app.get('/file/:bot/*', (req, res) => {
  const bot = req.params.bot;
  const rel = req.params[0];
  const full = path.join(BOTS_DIR,bot,rel);
  res.sendFile(full);
});

// File operations via socket
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
    // run or stop
    if (data.cmd === 'run') {
      if (proc) proc.kill();
      proc = spawn('node', [data.file], { cwd: path.join(BOTS_DIR,data.bot) });
      proc.stdout.on('data', d=> socket.emit('output', d.toString()));
      proc.stderr.on('data', d=> socket.emit('output', d.toString()));
    } else if (data.cmd === 'stop') {
      if (proc) proc.kill();
      socket.emit('output','Process stopped\n');
    }
  });
});

http.listen(3000,()=>console.log('ADPanel_Final_v9 on http://localhost:3000'));
