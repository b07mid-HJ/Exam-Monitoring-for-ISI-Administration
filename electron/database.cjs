const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db;

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'surveillance_history.db');
  console.log('Database path:', dbPath);

  db = new Database(dbPath);

  // ✅ ÉTAPE 1 : Créer les tables de base (si elles n'existent pas)
  db.exec(`
    CREATE TABLE IF NOT EXISTS planning_sessions (
                                                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                   name TEXT NOT NULL,
                                                   session_type TEXT NOT NULL,
                                                   semester TEXT NOT NULL,
                                                   year INTEGER NOT NULL,
                                                   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                   file_path TEXT,
                                                   stats_total_assignments INTEGER,
                                                   stats_teachers_count INTEGER,
                                                   stats_exams_count INTEGER
    );

    CREATE TABLE IF NOT EXISTS planning_assignments (
                                                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                      session_id INTEGER NOT NULL,
                                                      date TEXT NOT NULL,
                                                      day_number INTEGER NOT NULL,
                                                      session TEXT NOT NULL,
                                                      time_start TEXT NOT NULL,
                                                      time_end TEXT NOT NULL,
                                                      exam_count INTEGER NOT NULL,
                                                      teacher_id TEXT NOT NULL,
                                                      grade TEXT NOT NULL,
                                                      is_responsible TEXT NOT NULL,
                                                      teacher_first_name TEXT,
                                                      teacher_last_name TEXT,
                                                      teacher_email TEXT,
                                                      FOREIGN KEY (session_id) REFERENCES planning_sessions(id) ON DELETE CASCADE
      );

    CREATE TABLE IF NOT EXISTS enseignants (
                                             code_smartex_ens TEXT PRIMARY KEY,
                                             nom_ens TEXT,
                                             prenom_ens TEXT,
                                             abrv_ens TEXT,
                                             email_ens TEXT,
                                             grade_code_ens TEXT,
                                             participe_surveillance INTEGER,
                                             created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                             updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS planning_examens (
                                                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                  dateExam TEXT NOT NULL,
                                                  h_debut TEXT NOT NULL,
                                                  h_fin TEXT NOT NULL,
                                                  session TEXT NOT NULL,
                                                  type_ex TEXT,
                                                  semestre TEXT,
                                                  enseignant TEXT,
                                                  cod_salle TEXT,
                                                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS souhaits_enseignants (
                                                       id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                       enseignant TEXT NOT NULL,
                                                       semestre TEXT,
                                                       session TEXT,
                                                       date TEXT,
                                                       jour TEXT NOT NULL,
                                                       seances TEXT NOT NULL,
                                                       nombre_max INTEGER,
                                                       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                       updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS teacher_credits (
                                                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                 session_id INTEGER NOT NULL,
                                                 teacher_id TEXT NOT NULL,
                                                 credit INTEGER NOT NULL DEFAULT 0,
                                                 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                 updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                 FOREIGN KEY (session_id) REFERENCES planning_sessions(id) ON DELETE CASCADE,
                                                 UNIQUE(session_id, teacher_id)
    );

    CREATE TABLE IF NOT EXISTS grade_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grade_code TEXT NOT NULL UNIQUE,
      hours REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ Base tables created/verified');

  // ✅ ÉTAPE 2 : Migration - Ajouter les nouvelles colonnes
  migrateDatabase(db);

  // ✅ ÉTAPE 3 : Créer les index
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_session_id ON planning_assignments(session_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_id ON planning_assignments(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_credits ON teacher_credits(session_id, teacher_id);
    CREATE INDEX IF NOT EXISTS idx_grade_code ON grade_hours(grade_code);
    CREATE INDEX IF NOT EXISTS idx_teacher_email ON planning_assignments(teacher_email);
    CREATE INDEX IF NOT EXISTS idx_email_ens ON enseignants(email_ens);
    CREATE INDEX IF NOT EXISTS idx_exam_date ON planning_examens(dateExam);
    CREATE INDEX IF NOT EXISTS idx_souhait_enseignant ON souhaits_enseignants(enseignant);
    CREATE INDEX IF NOT EXISTS idx_souhait_jour ON souhaits_enseignants(jour);
    CREATE INDEX IF NOT EXISTS idx_credit_session ON teacher_credits(session_id);
  `);

  console.log('✅ Database initialized successfully');
  return db;
}

function migrateDatabase(database) {
  console.log('🔄 Starting database migration...');

  try {
    // Récupérer les colonnes existantes
    const columns = database.pragma('table_info(planning_assignments)');
    const columnNames = columns.map(col => col.name);

    console.log('📋 Current columns:', columnNames.join(', '));

    // Liste des colonnes à ajouter
    const newColumns = [
      { name: 'teacher_first_name', type: 'TEXT' },
      { name: 'teacher_last_name', type: 'TEXT' },
      { name: 'teacher_email', type: 'TEXT' },
      { name: 'exam_count', type: 'INTEGER' }
    ];

    // Ajouter chaque colonne si elle n'existe pas
    newColumns.forEach(({ name, type }) => {
      if (!columnNames.includes(name)) {
        console.log(`➕ Adding column: ${name}`);
        database.exec(`ALTER TABLE planning_assignments ADD COLUMN ${name} ${type}`);
        console.log(`✅ Column ${name} added successfully`);
      } else {
        console.log(`ℹ️  Column ${name} already exists, skipping`);
      }
    });

    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.error('Full error:', error);
    throw error;
  }
}

function getDatabase() {
  if (!db) {
    initDatabase();
  }
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('✅ Database closed');
  }
}

module.exports = { initDatabase, getDatabase, closeDatabase };