const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Sélection de fichiers
  selectFile: (fileType) => ipcRenderer.invoke('select-file', fileType),

  // Sauvegarde de fichiers uploadés
  saveUploadedFile: (data) =>
    ipcRenderer.invoke('save-uploaded-file', data),

  // Exécution de l'algorithme Python
  runPythonAlgorithm: (files) => ipcRenderer.invoke('run-python-algorithm', files),

  // Lecture des résultats
  readExcelResults: (filePath) => ipcRenderer.invoke('read-excel-results', filePath),

  // Sauvegarde des résultats
  saveResultsFile: () => ipcRenderer.invoke('save-results-file'),

  // Analyse des surveillances
  analyzeSurveillanceData: (data) => ipcRenderer.invoke('analyze-surveillance-data', data),
  
  // Lire les heures par grade
  readGradeHours: () => ipcRenderer.invoke('read-grade-hours'),
  
  // Sauvegarder les heures par grade
  saveGradeHours: (data) => ipcRenderer.invoke('save-grade-hours', data),

  // Exporter les données de la DB vers des fichiers
  exportDbToFiles: () => ipcRenderer.invoke('export-db-to-files'),

  // Écoute des logs Python en temps réel
  onPythonLog: (callback) => {
    ipcRenderer.on('python-log', (event, data) => callback(data));
  },

  onPythonError: (callback) => {
    ipcRenderer.on('python-error', (event, data) => callback(data));
  },
  generateGlobalDocuments: () => ipcRenderer.invoke('generate-global-documents'),
  generateTeacherDocument: (teacherId) => ipcRenderer.invoke('generate-teacher-document', teacherId),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),

  // ⭐ NOUVEAU : Gestion de l'historique (BASE DE DONNÉES)
  savePlanningSession: (data) => ipcRenderer.invoke('save-planning-session', data),
  getAllSessions: () => ipcRenderer.invoke('get-all-sessions'),
  getSessionDetails: (sessionId) => ipcRenderer.invoke('get-session-details', sessionId),
  deleteSession: (sessionId) => ipcRenderer.invoke('delete-session', sessionId),
  exportSavedSession: (sessionId) => ipcRenderer.invoke('export-saved-session', sessionId),
  getWishesByTeacher: (teacherName) => ipcRenderer.invoke('get-wishes-by-teacher', teacherName),
  getAllWishes: () => ipcRenderer.invoke('get-all-wishes'),
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
  
  // ⭐ NOUVEAU : Permutation d'enseignants
  swapTeachers: (swapData) => ipcRenderer.invoke('swap-teachers', swapData),
  
  // ⭐ NOUVEAU : Changement de créneau pour un enseignant
  changeTeacherSlot: (changeData) =>
    ipcRenderer.invoke('change-teacher-slot', changeData),
    
  // Enregistrement des absences des enseignants
  recordTeacherAbsence: (data) => 
    ipcRenderer.invoke('record-teacher-absence', data),

  // ⭐ NOUVEAU : Ajout et suppression d'affectations
  addTeacherAssignment: (data) => ipcRenderer.invoke('add-teacher-assignment', data),
  deleteTeacherAssignment: (data) => ipcRenderer.invoke('delete-teacher-assignment', data),

});