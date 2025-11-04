export interface ElectronAPI {
  selectFile: (fileType: string) => Promise<string | null>
  saveUploadedFile: (data: { fileName: string; filePath: string }) => Promise<{ success: boolean; path?: string; error?: string }>
  runPythonAlgorithm: (files: any) => Promise<any>
  readExcelResults: (filePath: string) => Promise<{ success: boolean; data?: any; error?: string }>
  saveResultsFile: () => Promise<{ success: boolean; path?: string; error?: string }>
  analyzeSurveillanceData: (data: { professorsFile: string; planningFile: string; ecart_1_2?: number; ecart_2_3?: number; ecart_3_4?: number }) => Promise<any>
  readGradeHours: () => Promise<{ success: boolean; data?: Record<string, number>; error?: string }>
  saveGradeHours: (data: { gradeHoursData: any; professorsFile: string; planningFile: string }) => Promise<{ success: boolean; message?: string; error?: string; path?: string; stats?: { enseignants: number; examens: number } }>
  exportDbToFiles: () => Promise<{ success: boolean; files?: { teachers: string; exams: string }; stats?: { enseignants: number; examens: number }; error?: string }>
  onPythonLog: (callback: (data: string) => void) => void
  onPythonError: (callback: (data: string) => void) => void
  generateGlobalDocuments: () => Promise<any>
  generateTeacherDocument: (teacherId: string) => Promise<any>
  openFile: (filePath: string) => Promise<any>
  savePlanningSession: (data: any) => Promise<any>
  getAllSessions: () => Promise<any>
  getSessionDetails: (sessionId: number) => Promise<any>
  deleteSession: (sessionId: number) => Promise<any>
  exportSavedSession: (sessionId: number) => Promise<any>
  getWishesByTeacher: (teacherName: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
  getAllWishes: () => Promise<{ success: boolean; data?: any[]; error?: string }>
  getDashboardStats: () => Promise<any>
  swapTeachers: (swapData: any) => Promise<any>
  changeTeacherSlot: (changeData: any) => Promise<any>
  addTeacherAssignment: (data: { teacherId: string; day?: number; session?: string; isAutomatic: boolean }) => Promise<{ success: boolean; message?: string; error?: string; isUnwishedSlot?: boolean; limitExceeded?: boolean; currentCount?: number; maxCount?: number; assignment?: any }>
  deleteTeacherAssignment: (data: { teacherId: string; day: number; session: string }) => Promise<{ success: boolean; message?: string; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
