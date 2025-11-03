const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const { initDatabase, getDatabase, closeDatabase } = require('./database.cjs');

let mainWindow;
const isDev = process.env.NODE_ENV === 'development';

// ✅ Fonctions de chemin
const getPythonPath = () =>
  isDev
    ? path.join(__dirname, 'python', 'venv', 'Scripts', 'python.exe')
    : path.join(process.resourcesPath, 'python', 'venv', 'Scripts', 'python.exe');


const getIconPath = () =>
  isDev
    ? path.join(__dirname, '../build/icon.ico')
    : path.join(process.resourcesPath, 'build', 'icon.ico');

// ✅ Dossiers utilisateur
const createAppDirectories = async () => {
  const userDataPath = app.getPath('userData');
  const uploadsDir = path.join(userDataPath, 'uploads');
  const savedPlanningsDir = path.join(userDataPath, 'saved_plannings');
  const pythonWorkspaceDir = path.join(userDataPath, 'python-workspace');

  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(savedPlanningsDir, { recursive: true });
  await fs.mkdir(pythonWorkspaceDir, { recursive: true });

  console.log('✅ App directories created:', { uploadsDir, savedPlanningsDir, pythonWorkspaceDir });
  return { uploadsDir, savedPlanningsDir, pythonWorkspaceDir };
};

let appDirs;

// ✅ Création de la fenêtre
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = `file://${path.resolve(__dirname, '../dist/index.html').replace(/\\/g, '/')}`;
    mainWindow.loadURL(indexPath);

    // ✅ Gestion des routes manquantes
    mainWindow.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -6 || errorDescription.includes('ERR_FILE_NOT_FOUND')) {
        console.warn('⚠️ Route not found, reloading index.html:', validatedURL);
        await mainWindow.loadURL(indexPath);
      }
    });
  }


mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    // Initialiser les dossiers d'abord
    appDirs = await createAppDirectories();
    // Puis initialiser la base de données
    initDatabase();
    // Enfin créer la fenêtre
    createWindow();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});


// ✅ Nouvelles fonctions de chemin
const getPythonExecutable = (scriptName) => {
  if (isDev) {
    // ✅ En dev, utiliser Python avec venv
    return {
      command: path.join(__dirname, 'python', 'venv', 'Scripts', 'python.exe'),
      args: [path.join(__dirname, 'python', `${scriptName}.py`)]
    };
  } else {
    // ✅ En prod, utiliser l'exécutable PyInstaller
    return {
      command: path.join(process.resourcesPath, 'python', 'dist', `${scriptName}.exe`),
      args: []
    };
  }
};

// ✅ AJOUTEZ CETTE NOUVELLE FONCTION
const getPythonDir = () => {
  if (isDev) {
    return path.join(__dirname, 'python');
  } else {
    return path.join(process.resourcesPath, 'python', 'dist');
  }
};// ============================================================================
// GESTION DES FICHIERS
// ============================================================================

ipcMain.handle('select-file', async (event, fileType) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    console.log('✅ Fichier sélectionné:', result.filePaths[0]); // ✅ Debug

    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('save-uploaded-file', async (event, data) => {
  try {
    console.log('🟢 Main - save-uploaded-file handler appelé');
    console.log('🟢 Main - Type de data:', typeof data);
    console.log('🟢 Main - data:', data);
    console.log('🟢 Main - data stringifié:', JSON.stringify(data));
    console.log('🟢 Main - Clés de data:', Object.keys(data));

    const { fileName, filePath } = data;

    console.log('🟢 Main - fileName extrait:', fileName);
    console.log('🟢 Main - filePath extrait:', filePath);

    if (!fileName || !filePath) {
      console.error('❌ Missing fileName or filePath');
      console.error('❌ fileName:', fileName);
      console.error('❌ filePath:', filePath);
      return { success: false, error: 'Missing fileName or filePath' };
    }

    if (typeof filePath !== 'string') {
      console.error('❌ filePath n\'est pas une string:', filePath);
      return { success: false, error: 'Invalid file path type' };
    }

    const destPath = path.join(appDirs.uploadsDir, fileName);
    console.log('💾 Destination:', destPath);

    await fs.copyFile(filePath, destPath);

    console.log('✅ Fichier sauvegardé avec succès');
    return { success: true, path: destPath };
  } catch (error) {
    console.error('❌ Error saving file:', error);
    return { success: false, error: error.message };
  }
});// EXÉCUTION PYTHON - CORRIGÉE POUR LES PERMISSIONS
// ============================================================================

// ✅ Modifiez run-python-algorithm
ipcMain.handle('run-python-algorithm', async (event, { teachersFile, wishesFile, examsFile, gradeHours }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const pythonExec = getPythonExecutable('main');

      // Vérification
      if (!fsSync.existsSync(pythonExec.command)) {
        const errorMsg = isDev
          ? 'Python environment not found. Please create virtual environment.'
          : `Python executable not found at: ${pythonExec.command}`;
        reject(new Error(errorMsg));
        return;
      }

      console.log('Running Python script...');
      console.log('Command:', pythonExec.command);

      // Copier les fichiers d'entrée
      const teachersDest = path.join(appDirs.pythonWorkspaceDir, 'Enseignants_participants.xlsx');
      const wishesDest = path.join(appDirs.pythonWorkspaceDir, 'Souhaits_avec_ids.xlsx');
      const examsDest = path.join(appDirs.pythonWorkspaceDir, 'Répartition_SE_dedup.xlsx');

      await fs.copyFile(teachersFile, teachersDest);
      await fs.copyFile(wishesFile, wishesDest);
      await fs.copyFile(examsFile, examsDest);

      // Préparer les arguments
      const args = [...pythonExec.args];
      if (gradeHours && Object.keys(gradeHours).length > 0) {
        args.push('--grade-hours');
        args.push(JSON.stringify(gradeHours));
      }

      const pythonProcess = spawn(pythonExec.command, args, {
        cwd: appDirs.pythonWorkspaceDir,
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log('Python:', text);
        if (mainWindow) {
          mainWindow.webContents.send('python-log', text);
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error('Python Error:', text);
        if (mainWindow) {
          mainWindow.webContents.send('python-error', text);
        }
      });

      pythonProcess.on('close', async (code) => {
        console.log(`Python process exited with code ${code}`);

        if (code === 0) {
          const outputFile = path.join(appDirs.pythonWorkspaceDir, 'schedule_solution.xlsx');

          if (fsSync.existsSync(outputFile)) {
            const destPath = path.join(app.getPath('userData'), 'schedule_solution.xlsx');
            await fs.copyFile(outputFile, destPath);

            resolve({
              success: true,
              outputFile: destPath,
              logs: output
            });
          } else {
            reject(new Error('Output file not generated.'));
          }
        } else {
          reject(new Error(`Python script failed: ${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start: ${error.message}`));
      });

    } catch (error) {
      reject(new Error(`Setup error: ${error.message}`));
    }
  });
});
ipcMain.handle('read-excel-results', async (event, filePath) => {
  try {
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    return { success: true, data };
  } catch (error) {
    console.error('Error reading Excel:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-results-file', async (event) => {
  const sourcePath = path.join(app.getPath('userData'), 'schedule_solution.xlsx');

  if (!fsSync.existsSync(sourcePath)) {
    return { success: false, error: 'No results file found' };
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'planning_surveillance.xlsx',
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
  });

  if (!result.canceled && result.filePath) {
    try {
      await fs.copyFile(sourcePath, result.filePath);
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  return { success: false, error: 'Save cancelled' };
});

// ============================================================================
// ANALYSE DES SURVEILLANCES
// ============================================================================

ipcMain.handle('analyze-surveillance-data', async (event, { professorsFile, planningFile, ecart_1_2, ecart_2_3, ecart_3_4 }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const pythonExec = getPythonExecutable('analyze_surveillance');

      // Vérification
      if (!fsSync.existsSync(pythonExec.command)) {
        const errorMsg = isDev
          ? 'Python environment not found. Please create virtual environment.'
          : `Python executable not found at: ${pythonExec.command}`;
        reject(new Error(errorMsg));
        return;
      }

      console.log('Running surveillance analysis...');
      console.log('Command:', pythonExec.command);
      console.log('Professors file:', professorsFile);
      console.log('Planning file:', planningFile);
      console.log('Custom ecarts:', { ecart_1_2, ecart_2_3, ecart_3_4 });

      // Préparer les arguments
      const args = [...pythonExec.args, professorsFile, planningFile];
      
      // Ajouter les écarts personnalisés s'ils sont fournis
      if (ecart_1_2 !== undefined && ecart_1_2 !== null) {
        args.push(ecart_1_2.toString());
      } else {
        args.push('null');
      }
      
      if (ecart_2_3 !== undefined && ecart_2_3 !== null) {
        args.push(ecart_2_3.toString());
      } else {
        args.push('null');
      }
      
      if (ecart_3_4 !== undefined && ecart_3_4 !== null) {
        args.push(ecart_3_4.toString());
      } else {
        args.push('null');
      }

      console.log('🔧 Python command args:', args);

      const pythonProcess = spawn(pythonExec.command, args, {
        cwd: appDirs.pythonWorkspaceDir,
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log('Python Analysis:', text);
      });

      pythonProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error('Python Analysis Error:', text);
      });

      pythonProcess.on('close', (code) => {
        console.log(`Python analysis process exited with code ${code}`);

        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse Python output: ${parseError.message}`));
          }
        } else {
          reject(new Error(`Python analysis failed: ${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start analysis: ${error.message}`));
      });

    } catch (error) {
      reject(new Error(`Setup error: ${error.message}`));
    }
  });
});

// ============================================================================
// GESTION DE L'HISTORIQUE (BASE DE DONNÉES)
// ============================================================================

// Sauvegarder une session de planning
ipcMain.handle('save-planning-session', async (event, { name, sessionType, semester, planningData }) => {
  try {
    const db = getDatabase();
    const year = new Date().getFullYear();

    // Calculer les statistiques
    const stats = {
      totalAssignments: planningData.length,
      teachersCount: new Set(planningData.map(r => r.Enseignant_ID)).size,
      examsCount: planningData.reduce((sum, r) => sum + (r.Nombre_Examens || 0), 0)
    };

    // Sauvegarder le fichier Excel
    const fileName = `${name}_${sessionType}_${semester}_${year}.xlsx`;
    const filePath = path.join(appDirs.savedPlanningsDir, fileName);

    const sourcePath = path.join(app.getPath('userData'), 'schedule_solution.xlsx');
    if (fsSync.existsSync(sourcePath)) {
      await fs.copyFile(sourcePath, filePath);
    }

    // Insérer dans la base de données
    const insertSession = db.prepare(`
      INSERT INTO planning_sessions
      (name, session_type, semester, year, file_path, stats_total_assignments, stats_teachers_count, stats_exams_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = insertSession.run(
      name,
      sessionType,
      semester,
      year,
      filePath,
      stats.totalAssignments,
      stats.teachersCount,
      stats.examsCount
    );

    const sessionId = info.lastInsertRowid;

    // Insérer toutes les affectations AVEC les nouvelles colonnes
    const insertAssignment = db.prepare(`
      INSERT INTO planning_assignments
      (session_id, date, day_number, session, time_start, time_end, exam_count, teacher_id,
       grade, is_responsible, teacher_first_name, teacher_last_name, teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((assignments) => {
      for (const assignment of assignments) {
        // Récupérer les informations de l'enseignant depuis les données
        const teacherFirstName = assignment['Prénom'] || assignment['prenom'] || '';
        const teacherLastName = assignment['Nom'] || assignment['nom'] || '';
        const teacherEmail = assignment['Email'] || assignment['email'] || '';
        const examCount = assignment['Nombre_Examens'] || 0;

        insertAssignment.run(
          sessionId,
          assignment.Date,
          assignment.Jour,
          assignment.Séance,
          assignment.Heure_Début,
          assignment.Heure_Fin,
          examCount,
          assignment.Enseignant_ID,
          assignment.Grade,
          assignment.Responsable,
          teacherFirstName,
          teacherLastName,
          teacherEmail
        );
      }
    });

    insertMany(planningData);

    console.log(`✅ Session ${sessionId} sauvegardée avec ${planningData.length} affectations`);

    return {
      success: true,
      sessionId,
      message: `Planning "${name}" sauvegardé avec succès`
    };
  } catch (error) {
    console.error('Error saving planning:', error);
    return { success: false, error: error.message };
  }
});

// Récupérer toutes les sessions
ipcMain.handle('get-all-sessions', async () => {
  try {
    const db = getDatabase();
    const sessions = db.prepare(`
      SELECT * FROM planning_sessions
      ORDER BY created_at DESC
    `).all();

    return { success: true, sessions };
  } catch (error) {
    console.error('Error getting sessions:', error);
    return { success: false, error: error.message };
  }
});

// Récupérer une session spécifique avec ses données
ipcMain.handle('get-session-details', async (event, sessionId) => {
  try {
    console.log('Getting session details...');
    const db = getDatabase();
    const session = db.prepare(`
      SELECT * FROM planning_sessions WHERE id = ?
    `).get(sessionId);

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const assignments = db.prepare(`
      SELECT * FROM planning_assignments WHERE session_id = ?
      ORDER BY date, session, exam_count
    `).all(sessionId);

    console.log(assignments.length);
    return {
      success: true,
      session,
      assignments
    };
  } catch (error) {
    console.error('Error getting session details:', error);
    return { success: false, error: error.message };
  }
});

// Supprimer une session
ipcMain.handle('delete-session', async (event, sessionId) => {
  try {
    const db = getDatabase();

    // Récupérer le chemin du fichier avant suppression
    const session = db.prepare('SELECT file_path FROM planning_sessions WHERE id = ?').get(sessionId);

    // Supprimer de la BDD (cascade supprimera aussi les assignments)
    db.prepare('DELETE FROM planning_sessions WHERE id = ?').run(sessionId);

    // Supprimer le fichier Excel si existe
    if (session && session.file_path && fsSync.existsSync(session.file_path)) {
      await fs.unlink(session.file_path);
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting session:', error);
    return { success: false, error: error.message };
  }
});

// Exporter une session sauvegardée
ipcMain.handle('export-saved-session', async (event, sessionId) => {
  try {
    const db = getDatabase();
    const session = db.prepare('SELECT file_path, name FROM planning_sessions WHERE id = ?').get(sessionId);

    if (!session || !fsSync.existsSync(session.file_path)) {
      return { success: false, error: 'File not found' };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${session.name}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });

    if (!result.canceled && result.filePath) {
      await fs.copyFile(session.file_path, result.filePath);
      return { success: true, path: result.filePath };
    }

    return { success: false, error: 'Export cancelled' };
  } catch (error) {
    console.error('Error exporting session:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// GÉNÉRATION DE DOCUMENTS WORD - CORRIGÉE POUR LES PERMISSIONS
// ============================================================================

ipcMain.handle('generate-global-documents', async (event) => {
  return new Promise(async (resolve, reject) => {
    try {
      const pythonExec = getPythonExecutable('generate_docs');
      const pythonDir = getPythonDir();
      const excelPath = path.join(app.getPath('userData'), 'schedule_solution.xlsx');

      if (!fsSync.existsSync(pythonExec.command)) {
        reject(new Error('Python executable not found'));
        return;
      }

      if (!fsSync.existsSync(excelPath)) {
        reject(new Error('No planning data found.'));
        return;
      }

      // ✅ Copier schedule_solution.xlsx
      const workspaceExcelPath = path.join(appDirs.pythonWorkspaceDir, 'schedule_solution.xlsx');
      await fs.copyFile(excelPath, workspaceExcelPath);

      // ✅ Chercher et copier Enseignants_participants.xlsx
      let teachersSourcePath = null;
      const possiblePaths = [
        path.join(appDirs.uploadsDir, 'Enseignants_participants.xlsx'),
        path.join(app.getPath('userData'), 'Enseignants_participants.xlsx'),
        path.join(pythonDir, 'Enseignants_participants.xlsx'),
        path.join(appDirs.pythonWorkspaceDir, 'Enseignants_participants.xlsx')
      ];

      for (const possiblePath of possiblePaths) {
        if (fsSync.existsSync(possiblePath)) {
          teachersSourcePath = possiblePath;
          break;
        }
      }

      if (!teachersSourcePath) {
        const searchedPaths = possiblePaths.join('\n- ');
        reject(new Error(
          `Fichier enseignants introuvable. Cherché dans:\n- ${searchedPaths}`
        ));
        return;
      }

      const teachersDestPath = path.join(appDirs.pythonWorkspaceDir, 'Enseignants_participants.xlsx');
      await fs.copyFile(teachersSourcePath, teachersDestPath);
      console.log(`✅ Enseignants file copied`);

      // ✅✅✅ NOUVEAU: Copier les templates Word dans le workspace
      const templates = ['Convocation.docx', 'enseignansParSeance.docx'];

      for (const template of templates) {
        const templateSourcePath = path.join(pythonDir, template);
        const templateDestPath = path.join(appDirs.pythonWorkspaceDir, template);

        console.log(`🔍 Recherche template: ${template}`);
        console.log(`   Source: ${templateSourcePath}`);
        console.log(`   Exists: ${fsSync.existsSync(templateSourcePath)}`);

        if (fsSync.existsSync(templateSourcePath)) {
          await fs.copyFile(templateSourcePath, templateDestPath);
          console.log(`✅ Template ${template} copié vers workspace`);
        } else {
          reject(new Error(`Template ${template} introuvable à: ${templateSourcePath}`));
          return;
        }
      }

      const args = [...pythonExec.args, 'global', workspaceExcelPath];

      const pythonProcess = spawn(pythonExec.command, args, {
        cwd: appDirs.pythonWorkspaceDir,
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to parse result: ${output}`));
          }
        } else {
          reject(new Error(`Process failed: ${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start: ${error.message}`));
      });
    } catch (error) {
      reject(new Error(`Setup error: ${error.message}`));
    }
  });
});

ipcMain.handle('generate-teacher-document', async (event, teacherId) => {
  return new Promise(async (resolve, reject) => {
    try {
      const pythonExec = getPythonExecutable('generate_docs');
      const pythonDir = getPythonDir();
      const excelPath = path.join(app.getPath('userData'), 'schedule_solution.xlsx');

      if (!fsSync.existsSync(pythonExec.command)) {
        reject(new Error('Python executable not found'));
        return;
      }

      if (!fsSync.existsSync(excelPath)) {
        reject(new Error('No planning data found'));
        return;
      }

      // ✅ Copier schedule_solution.xlsx
      const workspaceExcelPath = path.join(appDirs.pythonWorkspaceDir, 'schedule_solution.xlsx');
      await fs.copyFile(excelPath, workspaceExcelPath);

      // ✅ Chercher et copier Enseignants_participants.xlsx
      let teachersSourcePath = null;
      const possiblePaths = [
        path.join(appDirs.uploadsDir, 'Enseignants_participants.xlsx'),
        path.join(app.getPath('userData'), 'Enseignants_participants.xlsx'),
        path.join(pythonDir, 'Enseignants_participants.xlsx'),
        path.join(appDirs.pythonWorkspaceDir, 'Enseignants_participants.xlsx')
      ];

      for (const possiblePath of possiblePaths) {
        if (fsSync.existsSync(possiblePath)) {
          teachersSourcePath = possiblePath;
          break;
        }
      }

      if (!teachersSourcePath) {
        const searchedPaths = possiblePaths.join('\n- ');
        reject(new Error(
          `Fichier enseignants introuvable. Cherché dans:\n- ${searchedPaths}`
        ));
        return;
      }

      const teachersDestPath = path.join(appDirs.pythonWorkspaceDir, 'Enseignants_participants.xlsx');
      await fs.copyFile(teachersSourcePath, teachersDestPath);
      console.log(`✅ Enseignants file copied`);

      // ✅✅✅ NOUVEAU: Copier le template Convocation.docx dans le workspace
      const templateSourcePath = path.join(pythonDir, 'Convocation.docx');
      const templateDestPath = path.join(appDirs.pythonWorkspaceDir, 'Convocation.docx');

      console.log(`🔍 Recherche template Convocation.docx`);
      console.log(`   Source: ${templateSourcePath}`);
      console.log(`   Exists: ${fsSync.existsSync(templateSourcePath)}`);

      if (fsSync.existsSync(templateSourcePath)) {
        await fs.copyFile(templateSourcePath, templateDestPath);
        console.log(`✅ Template Convocation.docx copié vers workspace`);
      } else {
        reject(new Error(`Template Convocation.docx introuvable à: ${templateSourcePath}`));
        return;
      }

      const args = [...pythonExec.args, 'teacher', workspaceExcelPath, teacherId];

      const pythonProcess = spawn(pythonExec.command, args, {
        cwd: appDirs.pythonWorkspaceDir,
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log('📤 Python stdout:', text);
      });

      pythonProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error('❌ Python stderr:', text);
      });

      pythonProcess.on('close', (code) => {
        console.log(`🔚 Process exited with code ${code}`);

        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to parse result: ${output}\nParse error: ${e.message}`));
          }
        } else {
          reject(new Error(`Process exited with code ${code}\nError: ${errorOutput}\nOutput: ${output}`));
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('❌ Process error:', error);
        reject(new Error(`Failed to start: ${error.message}`));
      });
    } catch (error) {
      console.error('❌ Setup error:', error);
      reject(new Error(`Setup error: ${error.message}`));
    }
  });
});
ipcMain.handle('open-file', async (event, filePath) => {
  try {
    const { shell } = require('electron');
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ============================================================================
// DASHBOARD STATISTICS
// ============================================================================

// Récupérer les statistiques de la dernière session
ipcMain.handle('get-dashboard-stats', async () => {
  try {
    const db = getDatabase();

    // Récupérer la dernière session
    const lastSession = db.prepare(`
      SELECT * FROM planning_sessions 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get();

    if (!lastSession) {
      return {
        success: true,
        hasData: false,
        message: 'Aucune session trouvée'
      };
    }

    // Récupérer toutes les affectations de cette session
    const assignments = db.prepare(`
      SELECT * FROM planning_assignments 
      WHERE session_id = ?
    `).all(lastSession.id);

    // Statistiques par grade
    const statsByGrade = db.prepare(`
      SELECT 
        grade,
        COUNT(DISTINCT teacher_id) as teacher_count,
        COUNT(*) as total_assignments,
        SUM(CASE WHEN is_responsible = 'Oui' THEN 1 ELSE 0 END) as responsible_count
      FROM planning_assignments
      WHERE session_id = ?
      GROUP BY grade
      ORDER BY grade
    `).all(lastSession.id);

    // Calculer les heures par grade (en supposant 3h par séance)
    const hoursByGrade = statsByGrade.map(stat => ({
      ...stat,
      total_hours: stat.total_assignments * 3
    }));

    // Top 5 enseignants les plus sollicités
    const topTeachers = db.prepare(`
      SELECT 
        teacher_id,
        teacher_first_name,
        teacher_last_name,
        teacher_email,
        grade,
        COUNT(*) as assignment_count,
        COUNT(*) * 3 as total_hours
      FROM planning_assignments
      WHERE session_id = ?
      GROUP BY teacher_id
      ORDER BY assignment_count DESC
      LIMIT 5
    `).all(lastSession.id);

    // Répartition par jour
    const assignmentsByDay = db.prepare(`
      SELECT 
        date,
        day_number,
        COUNT(DISTINCT teacher_id) as teacher_count,
        COUNT(*) as assignment_count
      FROM planning_assignments
      WHERE session_id = ?
      GROUP BY date, day_number
      ORDER BY day_number
    `).all(lastSession.id);

    // Répartition par séance (Matin/Après-midi)
    const assignmentsBySession = db.prepare(`
      SELECT 
        session,
        COUNT(*) as count,
        COUNT(DISTINCT teacher_id) as unique_teachers
      FROM planning_assignments
      WHERE session_id = ?
      GROUP BY session
      ORDER BY session
    `).all(lastSession.id);

    // Statistiques des examens
    const examStats = db.prepare(`
      SELECT 
        exam_count,
        COUNT(*) as usage_count,
        COUNT(DISTINCT date) as days_used
      FROM planning_assignments
      WHERE session_id = ?
      GROUP BY exam_count
      ORDER BY usage_count DESC
      LIMIT 10
    `).all(lastSession.id);

    // Enseignants sans affectation (si vous avez une table d'enseignants)
    const uniqueTeachers = new Set(assignments.map(a => a.teacher_id)).size;
    const teachersWithResponsibility = db.prepare(`
      SELECT COUNT(DISTINCT teacher_id) as count
      FROM planning_assignments
      WHERE session_id = ? AND is_responsible = 'Oui'
    `).get(lastSession.id);

    return {
      success: true,
      hasData: true,
      session: {
        id: lastSession.id,
        name: lastSession.name,
        sessionType: lastSession.session_type,
        semester: lastSession.semester,
        year: lastSession.year,
        createdAt: lastSession.created_at
      },
      overview: {
        totalAssignments: assignments.length,
        uniqueTeachers: uniqueTeachers,
        totalExams: new Set(assignments.map(a => a.exam_id)).size,
        totalDays: new Set(assignments.map(a => a.date)).size,
        teachersWithResponsibility: teachersWithResponsibility.count,
        totalHours: assignments.length * 3 // 3h par séance
      },
      statsByGrade: hoursByGrade,
      topTeachers,
      assignmentsByDay,
      assignmentsBySession,
      examStats: examStats
    };
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// PERMUTATION D'ENSEIGNANTS - CORRIGÉE POUR LES PERMISSIONS
// ============================================================================

ipcMain.handle('swap-teachers', async (event, { teacher1, teacher2 }) => {
  try {
    const db = getDatabase();
    const XLSX = require('xlsx');

    console.log(`🔄 Swap Teachers:`);
    console.log(`Teacher 1: ${teacher1.id} at Jour ${teacher1.day}/${teacher1.session}`);
    console.log(`Teacher 2: ${teacher2.id} at Jour ${teacher2.day}/${teacher2.session}`);

    // 1. Get the latest session
    const lastSession = db.prepare(`
      SELECT id FROM planning_sessions 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get();

    if (!lastSession) {
      return { success: false, error: 'Aucune session trouvée' };
    }

    const sessionId = lastSession.id;

    // 2. Get teacher data from database
    const teacher1Data = db.prepare(`
      SELECT * FROM planning_assignments
      WHERE session_id = ? AND teacher_id = ? AND day_number = ? AND session = ?
    `).get(sessionId, teacher1.id, teacher1.day, teacher1.session);

    const teacher2Data = db.prepare(`
      SELECT * FROM planning_assignments
      WHERE session_id = ? AND teacher_id = ? AND day_number = ? AND session = ?
    `).get(sessionId, teacher2.id, teacher2.day, teacher2.session);

    if (!teacher1Data || !teacher2Data) {
      return { success: false, error: 'Impossible de trouver les affectations' };
    }

    // 3. Swap in database using transaction
    const swapTransaction = db.transaction(() => {
      // Step 1: Set teacher 1's slot to temp
      db.prepare(`
        UPDATE planning_assignments
        SET teacher_id = 'TEMP_SWAP', teacher_first_name = ?, teacher_last_name = ?, teacher_email = ?, grade = ?
        WHERE session_id = ? AND teacher_id = ? AND day_number = ? AND session = ?
      `).run(
        'TEMP', 'SWAP', 'temp@swap.com', 'TEMP',
        sessionId, teacher1.id, teacher1.day, teacher1.session
      );

      // Step 2: Update teacher 1's slot (now TEMP) with teacher 2's info
      db.prepare(`
        UPDATE planning_assignments
        SET teacher_id = ?, teacher_first_name = ?, teacher_last_name = ?, teacher_email = ?, grade = ?
        WHERE session_id = ? AND teacher_id = 'TEMP_SWAP' AND day_number = ? AND session = ?
      `).run(
        teacher2Data.teacher_id,
        teacher2Data.teacher_first_name,
        teacher2Data.teacher_last_name,
        teacher2Data.teacher_email,
        teacher2Data.grade,
        sessionId, teacher1.day, teacher1.session
      );

      // Step 3: Update teacher 2's slot with teacher 1's info
      db.prepare(`
        UPDATE planning_assignments
        SET teacher_id = ?, teacher_first_name = ?, teacher_last_name = ?, teacher_email = ?, grade = ?
        WHERE session_id = ? AND teacher_id = ? AND day_number = ? AND session = ?
      `).run(
        teacher1Data.teacher_id,
        teacher1Data.teacher_first_name,
        teacher1Data.teacher_last_name,
        teacher1Data.teacher_email,
        teacher1Data.grade,
        sessionId, teacher2.id, teacher2.day, teacher2.session
      );
    });

    const teacher1Data2 = db.prepare(
      `SELECT * FROM planning_assignments WHERE session_id = ? AND teacher_id = ? AND day_number = ? AND session = ?`
    ).get(sessionId, teacher1.id, teacher2.day, teacher2.session);
    console.log(teacher1Data2);
    const teacher2Data2 = db.prepare(
      `SELECT * FROM planning_assignments WHERE session_id = ? AND teacher_id = ? AND day_number = ? AND session = ?`
    ).get(sessionId, teacher2.id, teacher1.day, teacher1.session);
    console.log(teacher2Data2);
    swapTransaction();
    console.log('✅ Database updated');

    // 4. Update Excel file in user data directory
    const excelPath = path.join(app.getPath('userData'), 'schedule_solution.xlsx');

    if (fsSync.existsSync(excelPath)) {
      // Read current Excel data
      const workbook = XLSX.readFile(excelPath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Swap teachers in Excel data
      const updatedData = jsonData.map(row => {
        // Teacher 1's slot gets Teacher 2's info
        if (row.Enseignant_ID === teacher1.id &&
          row.Jour === teacher1.day &&
          row.Séance === teacher1.session) {
          return {
            ...row,
            Enseignant_ID: teacher2Data.teacher_id,
            Nom: teacher2Data.teacher_last_name,
            Prénom: teacher2Data.teacher_first_name,
            Email: teacher2Data.teacher_email,
            Grade: teacher2Data.grade
          };
        }

        // Teacher 2's slot gets Teacher 1's info
        if (row.Enseignant_ID === teacher2.id &&
          row.Jour === teacher2.day &&
          row.Séance === teacher2.session) {
          return {
            ...row,
            Enseignant_ID: teacher1Data.teacher_id,
            Nom: teacher1Data.teacher_last_name,
            Prénom: teacher1Data.teacher_first_name,
            Email: teacher1Data.teacher_email,
            Grade: teacher1Data.grade
          };
        }

        return row;
      });

      // Write updated data back to Excel
      const newWorksheet = XLSX.utils.json_to_sheet(updatedData);
      const newWorkbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Planning');
      XLSX.writeFile(newWorkbook, excelPath);
      console.log('✅ Excel file updated');
    }

    return {
      success: true,
      message: 'Permutation effectuée avec succès'
    };

  } catch (error) {
    console.error('Error swapping teachers:', error);
    return { success: false, error: error.message };
  }
});

// ============================================================================
// CHANGEMENT DE CRÉNEAU POUR UN ENSEIGNANT - CORRIGÉE POUR LES PERMISSIONS
// ============================================================================

ipcMain.handle('change-teacher-slot', async (event, { teacher, fromSlot, toSlot }) => {
  try {
    const db = getDatabase();
    const XLSX = require('xlsx');

    console.log(`🔄 Change Teacher Slot:`);
    console.log(`Teacher: ${teacher.id} from Jour ${fromSlot.day}/${fromSlot.session} to Jour ${toSlot.day}/${toSlot.session}`);

    // 1. Get the latest session
    const lastSession = db.prepare(`
      SELECT id FROM planning_sessions 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get();

    if (!lastSession) {
      return { success: false, error: 'Aucune session trouvée' };
    }

    const sessionId = lastSession.id;

    // 2. Get teacher's current assignment
    const currentAssignment = db.prepare(`
      SELECT * FROM planning_assignments
      WHERE session_id = ? AND teacher_id = ? AND day_number = ? AND session = ?
    `).get(sessionId, teacher.id, fromSlot.day, fromSlot.session);

    if (!currentAssignment) {
      return { success: false, error: 'Affectation actuelle introuvable' };
    }

    // 3. Get target slot info (to get date, time, exam count)
    const targetSlotInfo = db.prepare(`
      SELECT date, time_start, time_end, exam_count FROM planning_assignments
      WHERE session_id = ? AND day_number = ? AND session = ?
      LIMIT 1
    `).get(sessionId, toSlot.day, toSlot.session);

    if (!targetSlotInfo) {
      return { success: false, error: 'Créneau cible introuvable' };
    }

    // 4. Delete old assignment and insert new one
    const changeTransaction = db.transaction(() => {
      // Delete from old slot
      db.prepare(`
        DELETE FROM planning_assignments
        WHERE session_id = ? AND teacher_id = ? AND day_number = ? AND session = ?
      `).run(sessionId, teacher.id, fromSlot.day, fromSlot.session);

      // Insert into new slot
      db.prepare(`
        INSERT INTO planning_assignments
        (session_id, date, day_number, session, time_start, time_end, exam_count, teacher_id,
         grade, is_responsible, teacher_first_name, teacher_last_name, teacher_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        targetSlotInfo.date,
        toSlot.day,
        toSlot.session,
        targetSlotInfo.time_start,
        targetSlotInfo.time_end,
        targetSlotInfo.exam_count,
        currentAssignment.teacher_id,
        currentAssignment.grade,
        currentAssignment.is_responsible,
        currentAssignment.teacher_first_name,
        currentAssignment.teacher_last_name,
        currentAssignment.teacher_email
      );
    });

    changeTransaction();
    console.log('✅ Database updated');

    // 5. Update Excel file in user data directory
    const excelPath = path.join(app.getPath('userData'), 'schedule_solution.xlsx');

    if (fsSync.existsSync(excelPath)) {
      // Read current Excel data
      const workbook = XLSX.readFile(excelPath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Remove teacher from old slot and add to new slot
      const updatedData = jsonData.filter(row =>
        !(row.Enseignant_ID === teacher.id &&
          row.Jour === fromSlot.day &&
          row.Séance === fromSlot.session)
      );

      // Find a row from the target slot to get the correct date/time info
      const targetSlotRow = jsonData.find(row =>
        row.Jour === toSlot.day && row.Séance === toSlot.session
      );

      if (targetSlotRow) {
        // Add teacher to new slot
        updatedData.push({
          Date: targetSlotRow.Date,
          Jour: toSlot.day,
          Séance: toSlot.session,
          Heure_Début: targetSlotRow.Heure_Début,
          Heure_Fin: targetSlotRow.Heure_Fin,
          Nombre_Examens: targetSlotRow.Nombre_Examens,
          Enseignant_ID: currentAssignment.teacher_id,
          Nom: currentAssignment.teacher_last_name,
          Prénom: currentAssignment.teacher_first_name,
          Email: currentAssignment.teacher_email,
          Grade: currentAssignment.grade,
          Responsable: currentAssignment.is_responsible
        });
      }

      // Write updated data back to Excel
      const newWorksheet = XLSX.utils.json_to_sheet(updatedData);
      const newWorkbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Planning');
      XLSX.writeFile(newWorkbook, excelPath);
      console.log('✅ Excel file updated');
    }

    return {
      success: true,
      message: 'Changement effectué avec succès'
    };

  } catch (error) {
    console.error('Error changing teacher slot:', error);
    return { success: false, error: error.message };
  }
});