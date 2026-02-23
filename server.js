const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'data', 'app.db'));

const categories = [
  { key: 'KNOWLEDGE', label: 'Knowledge' },
  { key: 'LEARNING_SPACE', label: 'Learning Space' },
  { key: 'MY_WORK_SPACE', label: 'My Work Space' },
  { key: 'COMMUNITY', label: 'Community' },
  { key: 'NEW_FUNDS_AND_TALENTS', label: 'New Funds and Talents' }
];

function initializeDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'admin'))
    );

    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('KNOWLEDGE', 'LEARNING_SPACE', 'MY_WORK_SPACE', 'COMMUNITY', 'NEW_FUNDS_AND_TALENTS')),
      url TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_tool_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tool_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, tool_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(tool_id) REFERENCES tools(id) ON DELETE CASCADE
    );
  `);

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    insertUser.run('Admin User', 'admin@example.com', bcrypt.hashSync('AdminPass123!', 10), 'admin');
    insertUser.run('Regular User', 'user@example.com', bcrypt.hashSync('UserPass123!', 10), 'user');
  }

  const toolCount = db.prepare('SELECT COUNT(*) as count FROM tools').get().count;
  if (toolCount === 0) {
    const seedTools = [
      ['ReliefWeb', 'KNOWLEDGE', 'https://reliefweb.int', 'Humanitarian updates and analysis.', '🌍'],
      ['World Bank Data', 'KNOWLEDGE', 'https://data.worldbank.org', 'Global development indicators.', '📊'],
      ['Coursera', 'LEARNING_SPACE', 'https://www.coursera.org', 'Online courses for professional growth.', '🎓'],
      ['Khan Academy', 'LEARNING_SPACE', 'https://www.khanacademy.org', 'Free educational content and lessons.', '📘'],
      ['Trello', 'MY_WORK_SPACE', 'https://trello.com', 'Task management and collaboration boards.', '✅'],
      ['Google Drive', 'MY_WORK_SPACE', 'https://drive.google.com', 'Cloud file storage and collaboration.', '🗂️'],
      ['Slack', 'COMMUNITY', 'https://slack.com', 'Community and team communication.', '💬'],
      ['LinkedIn Groups', 'COMMUNITY', 'https://www.linkedin.com/groups', 'Professional networking communities.', '🤝'],
      ['Devex Funding', 'NEW_FUNDS_AND_TALENTS', 'https://www.devex.com/funding', 'Development funding opportunities.', '💡'],
      ['Impactpool', 'NEW_FUNDS_AND_TALENTS', 'https://www.impactpool.org', 'Social impact jobs and talent portal.', '🚀']
    ];
    const insertTool = db.prepare(
      'INSERT INTO tools (name, category, url, description, icon, is_active) VALUES (?, ?, ?, ?, ?, 1)'
    );
    seedTools.forEach((tool) => insertTool.run(...tool));
  }

  const regularUser = db.prepare('SELECT id FROM users WHERE email = ?').get('user@example.com');
  const existingSelections = db
    .prepare('SELECT COUNT(*) as count FROM user_tool_selections WHERE user_id = ?')
    .get(regularUser.id).count;

  if (existingSelections === 0) {
    const firstPerCategory = db
      .prepare(
        `SELECT t.id FROM tools t
         WHERE t.is_active = 1
         GROUP BY t.category
         ORDER BY t.category`
      )
      .all();
    const insertSelection = db.prepare('INSERT OR IGNORE INTO user_tool_selections (user_id, tool_id) VALUES (?, ?)');
    firstPerCategory.forEach((tool) => insertSelection.run(regularUser.id, tool.id));
  }
}

initializeDb();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'data') }),
    secret: process.env.SESSION_SECRET || 'dev-super-app-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }
  })
);
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.categories = categories;
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user && !req.session.guestMode) {
    return res.redirect('/');
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'Access denied. Admins only.' });
  }
  return next();
}

function getActiveToolsByCategory() {
  const tools = db
    .prepare('SELECT * FROM tools WHERE is_active = 1 ORDER BY category, name')
    .all();
  return categories.reduce((acc, category) => {
    acc[category.key] = tools.filter((tool) => tool.category === category.key);
    return acc;
  }, {});
}

function getUserSelectedToolIds(userId) {
  const rows = db.prepare('SELECT tool_id FROM user_tool_selections WHERE user_id = ?').all(userId);
  return new Set(rows.map((row) => row.tool_id));
}

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/home');
  }
  if (req.session.guestMode) {
    return res.redirect('/home');
  }
  return res.render('landing', { error: null });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).render('landing', { error: 'Invalid email or password.' });
  }

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('landing', { error: 'Session error. Please try again.' });
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    delete req.session.guestMode;
    delete req.session.guestSelections;
    return res.redirect(user.role === 'admin' ? '/admin' : '/home');
  });
});

app.post('/guest', (req, res) => {
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('landing', { error: 'Could not start guest session.' });
    }
    req.session.guestMode = true;
    req.session.guestSelections = null;
    return res.redirect('/home');
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/home', requireAuth, (req, res) => {
  const activeToolsByCategory = getActiveToolsByCategory();
  let selectedIds;

  if (req.session.user) {
    selectedIds = getUserSelectedToolIds(req.session.user.id);
  } else {
    if (!req.session.guestSelections) {
      const defaults = db.prepare('SELECT id FROM tools WHERE is_active = 1 ORDER BY category, name').all();
      req.session.guestSelections = defaults.map((tool) => tool.id);
    }
    selectedIds = new Set(req.session.guestSelections || []);
  }

  const selectedByCategory = categories.reduce((acc, category) => {
    acc[category.key] = activeToolsByCategory[category.key].filter((tool) => selectedIds.has(tool.id));
    return acc;
  }, {});

  return res.render('home', {
    activeToolsByCategory,
    selectedByCategory,
    isGuest: Boolean(req.session.guestMode)
  });
});

app.post('/home/category/:category/select', requireAuth, (req, res) => {
  const { category } = req.params;
  const toolIds = req.body.toolIds ? (Array.isArray(req.body.toolIds) ? req.body.toolIds : [req.body.toolIds]) : [];

  if (!categories.find((item) => item.key === category)) {
    return res.status(400).render('error', { message: 'Invalid category.' });
  }

  const validIds = db
    .prepare('SELECT id FROM tools WHERE category = ? AND is_active = 1')
    .all(category)
    .map((row) => row.id);

  const validSet = new Set(validIds);
  const selectedForCategory = toolIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && validSet.has(id));

  if (req.session.user) {
    const userId = req.session.user.id;
    const removeStmt = db.prepare(
      `DELETE FROM user_tool_selections
       WHERE user_id = ?
       AND tool_id IN (SELECT id FROM tools WHERE category = ?)`
    );
    removeStmt.run(userId, category);

    const insertStmt = db.prepare('INSERT OR IGNORE INTO user_tool_selections (user_id, tool_id) VALUES (?, ?)');
    selectedForCategory.forEach((toolId) => insertStmt.run(userId, toolId));
  } else {
    const current = new Set(req.session.guestSelections || []);
    validIds.forEach((id) => current.delete(id));
    selectedForCategory.forEach((id) => current.add(id));
    req.session.guestSelections = [...current];
  }

  return res.redirect('/home');
});

app.get('/admin', requireAdmin, (req, res) => {
  const filterCategory = req.query.category;
  const tools = filterCategory
    ? db.prepare('SELECT * FROM tools WHERE category = ? ORDER BY is_active DESC, name').all(filterCategory)
    : db.prepare('SELECT * FROM tools ORDER BY category, is_active DESC, name').all();

  res.render('admin', {
    tools,
    filterCategory,
    error: null,
    formData: null
  });
});

app.post('/admin/tools', requireAdmin, (req, res) => {
  const { name, category, url, description, icon } = req.body;
  if (!name || !category || !url || !description || !categories.find((item) => item.key === category)) {
    const tools = db.prepare('SELECT * FROM tools ORDER BY category, is_active DESC, name').all();
    return res.status(400).render('admin', {
      tools,
      filterCategory: null,
      error: 'Please complete all required fields and use a valid category.',
      formData: { name, category, url, description, icon }
    });
  }

  db.prepare(
    'INSERT INTO tools (name, category, url, description, icon, is_active) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(name.trim(), category, url.trim(), description.trim(), icon ? icon.trim() : null);

  return res.redirect('/admin');
});

app.post('/admin/tools/:id/update', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, category, url, description, icon, isActive } = req.body;

  if (!name || !category || !url || !description || !categories.find((item) => item.key === category)) {
    return res.status(400).render('error', { message: 'Invalid input for tool update.' });
  }

  db.prepare(
    `UPDATE tools
     SET name = ?, category = ?, url = ?, description = ?, icon = ?, is_active = ?
     WHERE id = ?`
  ).run(name.trim(), category, url.trim(), description.trim(), icon ? icon.trim() : null, isActive ? 1 : 0, id);

  return res.redirect('/admin');
});

app.post('/admin/tools/:id/delete', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM tools WHERE id = ?').run(id);
  db.prepare('DELETE FROM user_tool_selections WHERE tool_id = ?').run(id);
  return res.redirect('/admin');
});

app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found.' });
});

app.listen(PORT, () => {
  console.log(`Super app running on http://localhost:${PORT}`);
});
