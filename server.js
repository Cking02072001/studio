const express = require('express');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'studio2026';
const DATA_FILE = path.join(__dirname, 'data', 'clients.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

// Static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/fonts', express.static(path.join(__dirname, 'Fonts')));
app.use('/Logo', express.static(path.join(__dirname, 'Logo')));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'ck-studio-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Helpers ---
function loadClients() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

function saveClients(clients) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(clients, null, 2));
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/admin/login');
}

// --- File Upload ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 40);
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// =====================
// PUBLIC ROUTES
// =====================

app.get('/', (req, res) => {
  const clients = loadClients().filter(c => c.published);
  res.render('index', { clients });
});

// =====================
// ADMIN ROUTES
// =====================

app.get('/admin/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Falsches Passwort.' });
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAuth, (req, res) => {
  const clients = loadClients();
  const saved = req.query.saved || null;
  res.render('admin/dashboard', { clients, saved });
});

app.get('/admin/new', requireAuth, (req, res) => {
  res.render('admin/edit', { client: null });
});

app.get('/admin/edit/:slug', requireAuth, (req, res) => {
  const client = loadClients().find(c => c.slug === req.params.slug);
  if (!client) return res.redirect('/admin');
  res.render('admin/edit', { client });
});

// File upload endpoint (called via fetch from admin form)
app.post('/admin/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei erhalten.' });
  res.json({ path: `/uploads/${req.file.filename}` });
});

// Save client (JSON body from admin form)
app.post('/admin/save', requireAuth, (req, res) => {
  const data = req.body;
  if (!data.name) return res.status(400).json({ error: 'Name fehlt.' });

  const clients = loadClients();
  const slug = (data.slug || slugify(data.name)).replace(/[^a-z0-9-]/g, '');
  const originalSlug = data._originalSlug || null;
  const isNew = !originalSlug;

  if (isNew && clients.some(c => c.slug === slug)) {
    return res.status(400).json({ error: `Slug "${slug}" ist bereits vergeben.` });
  }

  const client = {
    slug,
    name: data.name,
    category: data.category || '',
    description: data.description || '',
    heroImage: data.heroImage || '',
    published: data.published === true || data.published === 'true',
    brandlook: {
      description: data.brandlookDescription || '',
      pdf: data.brandlookPdf || ''
    },
    logos: Array.isArray(data.logos) ? data.logos : [],
    colors: Array.isArray(data.colors) ? data.colors : [],
    fonts: Array.isArray(data.fonts) ? data.fonts : [],
    downloads: Array.isArray(data.downloads) ? data.downloads : [],
    updatedAt: new Date().toISOString().split('T')[0]
  };

  if (isNew) {
    clients.push(client);
  } else {
    const idx = clients.findIndex(c => c.slug === originalSlug);
    if (idx >= 0) clients[idx] = client;
    else clients.push(client);
  }

  saveClients(clients);
  res.json({ success: true, slug });
});

// Toggle published
app.post('/admin/toggle/:slug', requireAuth, (req, res) => {
  const clients = loadClients();
  const c = clients.find(c => c.slug === req.params.slug);
  if (c) { c.published = !c.published; saveClients(clients); }
  res.redirect('/admin');
});

// Delete client
app.post('/admin/delete/:slug', requireAuth, (req, res) => {
  const clients = loadClients().filter(c => c.slug !== req.params.slug);
  saveClients(clients);
  res.redirect('/admin');
});

// =====================
// CLIENT PAGE (last!)
// =====================

app.get('/:slug', (req, res) => {
  // Protect admin from being caught here
  if (req.params.slug === 'admin') return res.redirect('/admin');

  const clients = loadClients();
  const client = clients.find(c => c.slug === req.params.slug);
  if (!client || !client.published) {
    return res.status(404).render('404');
  }
  res.render('client', { client });
});

app.listen(PORT, () => {
  console.log(`✦ Studio läuft auf http://localhost:${PORT}`);
  console.log(`  Admin: http://localhost:${PORT}/admin`);
});
