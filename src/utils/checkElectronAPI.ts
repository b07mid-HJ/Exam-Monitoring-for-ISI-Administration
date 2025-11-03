/**
 * Utilitaire pour vérifier la disponibilité de l'API Electron
 */

export function checkElectronAPI(): boolean {
  if (typeof window === 'undefined') {
    console.error('❌ Window object not available')
    return false
  }

  if (!window.electronAPI) {
    console.error('❌ window.electronAPI is not defined')
    console.log('💡 Solution: Redémarrez l\'application Electron')
    return false
  }

  console.log('✅ window.electronAPI is available')
  
  // Vérifier les méthodes essentielles
  const requiredMethods = [
    'selectFile',
    'analyzeSurveillanceData',
    'runPythonAlgorithm',
    'readExcelResults'
  ]

  const missingMethods = requiredMethods.filter(
    method => typeof (window.electronAPI as any)[method] !== 'function'
  )

  if (missingMethods.length > 0) {
    console.error('❌ Missing methods:', missingMethods)
    console.log('💡 Solution: Redémarrez l\'application Electron')
    return false
  }

  console.log('✅ All required methods are available')
  return true
}

export function logElectronAPIDetails(): void {
  if (!window.electronAPI) {
    console.error('❌ window.electronAPI is not defined')
    return
  }

  console.log('📋 Available Electron API methods:')
  Object.keys(window.electronAPI).forEach(key => {
    const value = (window.electronAPI as any)[key]
    console.log(`  - ${key}: ${typeof value}`)
  })
}
