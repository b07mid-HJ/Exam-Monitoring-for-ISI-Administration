import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileUploadStep } from './components/FileUploadStep'
import { ResultsStep } from './components/ResultsStep'
import { GradeHoursData, Ecarts } from './types'
import { checkElectronAPI, logElectronAPIDetails } from '@/utils/checkElectronAPI'

export default function GradeHoursPage() {
  const [activeTab, setActiveTab] = useState<string>('upload')
  const [gradeHoursData, setGradeHoursData] = useState<GradeHoursData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<{ professorsFile: string; planningFile: string } | null>(null)

  // Vérifier l'API au chargement du composant
  useEffect(() => {
    console.log('🔍 Vérification de l\'API Electron...')
    const isAvailable = checkElectronAPI()
    if (!isAvailable) {
      logElectronAPIDetails()
    }
  }, [])

  const analyzeData = async (files: { professorsFile: string; planningFile: string }, customEcarts?: Ecarts) => {
    setIsLoading(true)
    
    try {
      // Vérifier que l'API est disponible
      if (!window.electronAPI || typeof window.electronAPI.analyzeSurveillanceData !== 'function') {
        throw new Error('L\'API Electron n\'est pas disponible. Veuillez redémarrer l\'application.')
      }

      console.log('📊 Analyzing data with custom ecarts:', customEcarts)

      // Appeler l'API Python pour analyser les données
      const result = await window.electronAPI.analyzeSurveillanceData({
        professorsFile: files.professorsFile,
        planningFile: files.planningFile,
        ecart_1_2: customEcarts?.ecart_1_2,
        ecart_2_3: customEcarts?.ecart_2_3,
        ecart_3_4: customEcarts?.ecart_3_4
      })
      
      console.log('📊 Analysis result:', result)

      if (result.success && result.data) {
        setGradeHoursData(result.data)
        setActiveTab('results')
      } else {
        throw new Error(result.error || 'Erreur lors de l\'analyse')
      }
    } catch (error: any) {
      console.error('Error analyzing surveillance data:', error)
      alert(`Erreur: ${error?.message || 'Une erreur est survenue'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleFilesUploaded = async (data: { professorsFile: string; planningFile: string }) => {
    console.log('Files uploaded:', data)
    setUploadedFiles(data)
    await analyzeData(data)
  }

  const handleRegenerate = async (newEcarts: Ecarts) => {
    if (!uploadedFiles) {
      alert('Erreur: Fichiers non trouvés. Veuillez recommencer l\'import.')
      return
    }
    console.log('🔄 Regenerating with new ecarts:', newEcarts)
    console.log('📁 Using files:', uploadedFiles)
    await analyzeData(uploadedFiles, newEcarts)
  }

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-3xl font-bold tracking-tight'>
          Analyse des Surveillances par Grade
        </h1>
        <p className='text-muted-foreground mt-2'>
          Importez les fichiers Excel pour analyser la répartition des surveillances
        </p>
      </div>

      <Card className='p-6'>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='upload'>
              1. Import des Fichiers
            </TabsTrigger>
            <TabsTrigger value='results' disabled={!gradeHoursData}>
              2. Résultats de l'Analyse
            </TabsTrigger>
          </TabsList>

          <TabsContent value='upload' className='mt-6'>
            <FileUploadStep 
              onFilesUploaded={handleFilesUploaded}
              isLoading={isLoading}
            />
          </TabsContent>

          <TabsContent value='results' className='mt-6'>
            <ResultsStep 
              data={gradeHoursData}
              onBack={() => setActiveTab('upload')}
              onRegenerate={handleRegenerate}
              uploadedFiles={uploadedFiles}
              isLoading={isLoading}
            />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}
