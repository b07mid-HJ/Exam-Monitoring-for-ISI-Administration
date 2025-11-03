export interface ElectronAPI {
  selectFile: (fileType: string) => Promise<string | null>
  saveUploadedFile: (data: { fileName: string; filePath: string }) => Promise<{ success: boolean; path?: string; error?: string }>
  runPythonAlgorithm: (files: any) => Promise<any>
  readExcelResults: (filePath: string) => Promise<{ success: boolean; data?: any; error?: string }>
  saveResultsFile: () => Promise<{ success: boolean; path?: string; error?: string }>
  analyzeSurveillanceData: (data: { professorsFile: string; planningFile: string; ecart_1_2?: number; ecart_2_3?: number; ecart_3_4?: number }) => Promise<any>
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
  getDashboardStats: () => Promise<any>
  swapTeachers: (swapData: any) => Promise<any>
  changeTeacherSlot: (changeData: any) => Promise<any>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
