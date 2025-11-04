import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

import { FileUploader } from './components/FileUploader';
import { ProcessingStatus } from './components/ProcessingStatus';
import { ResultsTable } from './components/ResultsTable';
import { CalendarView } from './components/CalendarView';
import { ViewToggle } from './components/ViewToggle';
import { TeacherSelector } from './components/TeacherSelector';
import { TeacherScheduleView } from './components/TeacherScheduleView';
import { ExportButtons } from './components/ExportButtons';
import { ExportCalendarButton } from './components/ExportCalendarButton';
import { SaveSessionDialog } from './components/SaveSessionDialog';
import { Sparkles, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label.tsx'
import { Input } from '@/components/ui/input.tsx'
import { SendMail } from './components/SendMail';

interface PlanningRow {
  Date: string;
  Jour: number;
  Séance: string;
  Heure_Début: string;
  Heure_Fin: string;
  Nombre_Examens: number;
  Enseignant_ID: string;
  Nom: string;
  Prénom: string;
  Email: string;
  Grade: string;
  Responsable: string;
}

const DEFAULT_GRADE_HOURS: Record<string, number> = {
        PR: 6.0, 
        MA: 10.5,  
        MC: 6.0,   
        AC: 13.5,  
        AS: 12.0,    
        PTC: 13.5,   
        PES: 13.5,   
        V: 6.0,
        EX: 4.5    
    }

export default function PlanningPage() {
  const [files, setFiles] = useState<{
    teachers?: string;
    wishes?: string;
    exams?: string;
    credits?: string;
  }>({});

  const [gradeHours, setGradeHours] = useState<Record<string, number>>(DEFAULT_GRADE_HOURS);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; outputFile?: string; error?: string } | null>(null);
  const [planningData, setPlanningData] = useState<PlanningRow[]>([]);
  const [viewMode, setViewMode] = useState<'calendar' | 'table' | 'teacher'>('calendar');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | undefined>();

  const canGenerate = files.teachers && files.wishes && files.exams;

  // Charger les heures par grade depuis le fichier JSON au démarrage
  useEffect(() => {
    const loadGradeHours = async () => {
      try {
        if (window.electronAPI && typeof window.electronAPI.readGradeHours === 'function') {
          console.log('📖 Chargement des heures par grade depuis grade_hours.json...');
          const result = await window.electronAPI.readGradeHours();

          if (result.success && result.data) {
            console.log('✅ Heures par grade chargées:', result.data);
            setGradeHours(result.data);
            // toast.success('Configuration chargée', {
            //   description: 'Les heures par grade ont été chargées depuis le fichier sauvegardé'
            // });
          } else {
            console.log('⚠️ Utilisation des valeurs par défaut:', result.error);
            toast.info('Valeurs par défaut utilisées', {
              description: 'Aucune configuration sauvegardée trouvée'
            });
          }
        }
      } catch (error) {
        console.error('❌ Erreur lors du chargement des heures par grade:', error);
        toast.warning('Erreur de chargement', {
          description: 'Utilisation des valeurs par défaut'
        });
      }
    };

    loadGradeHours();
  }, []);

  const handleGradeChange = (grade: string, value: string) => {
    const numericValue = parseFloat(value) || 0;
    setGradeHours(prev => ({
      ...prev,
      [grade]: numericValue
    }));

    // Log du changement
    console.log(`Grade ${grade} modifié: ${numericValue}h`);
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      toast.error('Fichiers manquants', {
        description: 'Veuillez sélectionner les 3 fichiers requis'
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);
    setPlanningData([]);

    try {
      // 🔍 LOGS DÉTAILLÉS AVANT ENVOI
      console.log('=== DONNÉES ENVOYÉES AU PYTHON ===');
      console.log('Fichiers:', files);
      console.log('Grade Hours configurés:', gradeHours);
      console.log('Total des grades:', Object.keys(gradeHours).length);

      // Vérification de la structure des données
      const requestData = {
        teachersFile: files.teachers,
        wishesFile: files.wishes,
        examsFile: files.exams,
        creditsFile: files.credits, // Optionnel
        gradeHours: gradeHours
      };

      console.log('Structure des données envoyées:', JSON.stringify(requestData, null, 2));

      // Log détaillé des heures par grade
      console.log('Détail des heures par grade:');
      Object.entries(gradeHours).forEach(([grade, hours]) => {
        console.log(`  - ${grade}: ${hours}h (type: ${typeof hours})`);
      });

      const result = await (window as any).electronAPI.runPythonAlgorithm(requestData);

      // 🔍 LOGS APRÈS RÉCEPTION
      console.log('=== RÉSULTAT REÇU DU PYTHON ===');
      console.log('Succès:', result.success);
      console.log('Fichier de sortie:', result.outputFile);
      console.log('Erreur:', result.error);

      setResult(result);

      if (result.success && result.outputFile) {
        const excelResult = await (window as any).electronAPI.readExcelResults(result.outputFile);

        console.log('=== DONNÉES EXCEL LIES ===');
        console.log('Nombre de lignes:', excelResult.data?.length || 0);
        console.log('Première ligne:', excelResult.data?.[0]);

        if (excelResult.success) {
          setPlanningData(excelResult.data);
          toast.success('Planning généré avec succès !', {
            description: `${excelResult.data.length} affectations créées`
          });
        }
      } else {
        console.error('Erreur Python:', result.error);
        toast.error('Erreur lors de la génération', {
          description: result.error || 'Une erreur est survenue'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      console.error('Erreur complète:', error);
      setResult({ success: false, error: errorMessage });
      toast.error('Erreur', { description: errorMessage });
    } finally {
      setIsProcessing(false);
    }
  };

  // Fonction pour recharger les heures depuis le fichier JSON
  const resetGradeHours = async () => {
    try {
      if (window.electronAPI && typeof window.electronAPI.readGradeHours === 'function') {
        console.log('🔄 Rechargement des heures par grade depuis grade_hours.json...');
        const result = await window.electronAPI.readGradeHours();
        
        if (result.success && result.data) {
          console.log('✅ Heures par grade rechargées:', result.data);
          setGradeHours(result.data);
          // toast.success('Configuration rechargée', {
          //   description: 'Les heures par grade ont été rechargées depuis le fichier'
          // });
        } else {
          // Si pas de fichier, utiliser les valeurs par défaut
          setGradeHours(DEFAULT_GRADE_HOURS);
          toast.info('Valeurs par défaut restaurées');
          console.log('Heures réinitialisées aux valeurs par défaut');
        }
      } else {
        setGradeHours(DEFAULT_GRADE_HOURS);
        toast.info('Valeurs par défaut restaurées');
      }
    } catch (error) {
      console.error('❌ Erreur lors du rechargement:', error);
      setGradeHours(DEFAULT_GRADE_HOURS);
      toast.warning('Erreur', {
        description: 'Utilisation des valeurs par défaut'
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* === En-tête === */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Génération de Planning de Surveillance</h1>
        <p className="text-muted-foreground mt-2">
          Importez les fichiers nécessaires et ajustez les heures par grade avant de générer le planning.
        </p>
      </div>

      {/* === Alerte === */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Fichiers requis :</strong> Enseignants participants, Souhaits de disponibilité, et Planning des examens.
          <br />
          Vous pouvez aussi ajuster le nombre d'heures cibles pour chaque grade avant de lancer le calcul.
          <br />
          <strong>Conseil :</strong> Ouvrez la console développeur (F12) pour voir les logs détaillés.
        </AlertDescription>
      </Alert>

      {/* === Inputs fichiers === */}
      <FileUploader onFilesChange={setFiles} />

      {/* === Configuration des heures par grade === */}
      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-lg">Paramètres des heures par grade</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={resetGradeHours}
            type="button"
          >
            Recharger depuis fichier
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Object.entries(gradeHours).map(([grade, hours]) => (
            <div key={grade} className="flex flex-col space-y-1">
              <Label htmlFor={`grade-${grade}`} className="text-sm font-medium">
                {grade}
              </Label>
              <Input
                id={`grade-${grade}`}
                type="number"
                step="0.5"
                min="0"
                max="50"
                value={hours}
                onChange={(e) => handleGradeChange(grade, e.target.value)}
                className="text-right"
                onBlur={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  if (value < 0) {
                    setGradeHours(prev => ({ ...prev, [grade]: 0 }));
                    toast.warning(`La valeur pour ${grade} ne peut pas être négative`);
                  }
                }}
              />
              <span className="text-xs text-muted-foreground text-right">
                {hours}h
              </span>
            </div>
          ))}
        </div>

        {/* Résumé de la configuration */}
        <div className="pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            Configuration actuelle: {Object.keys(gradeHours).length} grades définis |
            Total heures: {Object.values(gradeHours).reduce((sum, hours) => sum + hours, 0).toFixed(1)}h
          </p>
        </div>
      </div>

      {/* === Bouton de génération === */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={!canGenerate || isProcessing}
          className="gap-2"
        >
          <Sparkles className="h-5 w-5" />
          {isProcessing ? 'Génération en cours...' : 'Générer le Planning'}
        </Button>
      </div>

      {/* === Statut et résultats === */}
      <ProcessingStatus isProcessing={isProcessing} result={result} />

      {planningData.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold">Résultats</h2>
              <p className="text-sm text-muted-foreground">
                Planning généré avec succès - {planningData.length} affectations
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <ViewToggle view={viewMode} onViewChange={setViewMode} />
               <ViewToggle view={viewMode} onViewChange={setViewMode} />
              {viewMode === 'calendar' && (
                <>
                  <ExportCalendarButton disabled={!result?.success} />
                  <SendMail planningData={planningData} disabled={!result?.success} />
                </>
              )}
              <SaveSessionDialog planningData={planningData} wishesFile={files.wishes} disabled={!result?.success} />
              <ExportButtons disabled={!result?.success} />
            </div>
          </div>

          {viewMode === 'teacher' ? (
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <TeacherSelector
                  data={planningData}
                  onTeacherSelect={setSelectedTeacherId}
                  selectedTeacherId={selectedTeacherId}
                />
              </div>
              <div className="lg:col-span-2">
                {selectedTeacherId ? (
                  <TeacherScheduleView teacherId={selectedTeacherId} data={planningData} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <p className="text-lg">Sélectionnez un enseignant pour voir son planning</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : viewMode === 'calendar' ? (
            <CalendarView data={planningData} />
          ) : (
            <ResultsTable data={planningData} />
          )}
        </div>
      )}
    </div>
  );
}