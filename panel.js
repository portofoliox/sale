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
const NODE_VERSIONS = ['14.x','16.x','18.x','20.x'];

if (!fs.existsSync(BOTS_DIR)) fs.mkdirSync(BOTS_DIR);

app.set('view engine','ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  const bots = fs.readdirSync(BOTS_DIR).filter(d=>fs.statSync(path.join(BOTS_DIR,d)).isDirectory());
  res.render('index', { bots });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.redirect('/');
  try {
    const zip = new AdmZip(req.file.path);
    const name = path.parse(req.file.originalname).name.replace(/[^\w-]/g,'');
    const tempDir = path.join(__dirname,'uploads',name);
    zip.extractAllTo(tempDir,true);
    function find(folder) {
      for (const f of fs.readdirSync(folder)) {
        const full = path.join(folder,f);
        if (fs.statSync(full).isFile() && f.endsWith('.js')) return full;
      }
      for (const f of fs.readdirSync(folder)) {
        const full = path.join(folder,f);
        if (fs.statSync(full).isDirectory()) {
          const found = find(full);
          if (found) return found;
        }
      }
      return null;
    }
    const entry = find(tempDir);
    if(!entry) throw 'No js';
    const srcDir = path.dirname(entry);
    const dest = path.join(BOTS_DIR,name);
    if (fs.existsSync(dest)) fs.rmSync(dest,{recursive:true,force:true});
    fs.renameSync(srcDir,dest);
    fs.rmSync(req.file.path,{force:true});
    fs.rmSync(tempDir,{recursive:true,force:true});
  } catch (e) {
    console.error(e);
  }
  res.redirect('/');
});

app.get('/bot/:bot', (req,res) => {
  const bot = req.params.bot;
  const dir = path.join(BOTS_DIR,bot);
  if(!fs.existsSync(dir)) return res.redirect('/');
  res.render('bot', { bot, nodeVersions: NODE_VERSIONS });
});

io.on('connection', socket => {
  socket.on('join', bot => { socket.join(bot); });
  socket.on('action', data => {
    const { bot, cmd, version } = data;
    if (cmd === 'install') {
      const script = `curl -fsSL https://deb.nodesource.com/setup_${version} | bash - && apt-get install -y nodejs`;
      const p = exec(script);
      p.stdout.on('data', d=> socket.emit('output', d));
      p.stderr.on('data', d=> socket.emit('output', d));
    } else {
      const botPath = path.join(BOTS_DIR,bot,'index.js');
      const p = exec(`pm2 ${cmd} ${botPath} --name "${bot}"`);
      p.stdout.on('data', d=> socket.emit('output', d));
      p.stderr.on('data', d=> socket.emit('output', d));
    }
  });
  socket.on('getFiles', bot => {
    const dir = path.join(BOTS_DIR,bot);
    const files=[];
    function walk(base,rel='') {
      fs.readdirSync(base).forEach(name=>{
        const full=path.join(base,name),r=path.join(rel,name);
        if(fs.statSync(full).isDirectory()) walk(full,r);
        else files.push(r);
      });
    }
    walk(dir);
    socket.emit('files', files);
  });
  socket.on('readFile', ({bot,file})=>{
    const content = fs.readFileSync(path.join(BOTS_DIR,bot,file),'utf8');
    socket.emit('fileContent',{file,content});
  });
  socket.on('writeFile', ({bot,file,content})=>{
    fs.writeFileSync(path.join(BOTS_DIR,bot,file),content);
    socket.emit('output',`File ${file} saved\n`);
  });
  socket.on('deleteFile', ({bot,file})=>{
    fs.rmSync(path.join(BOTS_DIR,bot,file),{force:true});
    socket.emit('output',`File ${file} deleted\n`);
  });
});

http.listen(3000, ()=>console.log('ADPanel_Final_v6 on http://localhost:3000'));
