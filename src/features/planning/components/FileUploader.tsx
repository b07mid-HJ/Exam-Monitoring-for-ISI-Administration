import { useState } from 'react';
import { Upload, X, Check, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

interface UploadedFile {
  name: string;
  path: string;
  type: 'teachers' | 'wishes' | 'exams';
}

interface FileUploaderProps {
  onFilesChange: (files: { teachers?: string; wishes?: string; exams?: string }) => void;
}

export function FileUploader({ onFilesChange }: FileUploaderProps) {
  const [files, setFiles] = useState<{
    teachers?: UploadedFile;
    wishes?: UploadedFile;
    exams?: UploadedFile;
  }>({});
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(false);

  const handleLoadFromDatabase = async () => {
    setIsLoadingFromDb(true);
    try {
      console.log('📊 Chargement des fichiers depuis la base de données...');
      
      if (!window.electronAPI || typeof window.electronAPI.exportDbToFiles !== 'function') {
        throw new Error('API Electron non disponible');
      }

      const result = await window.electronAPI.exportDbToFiles();

      if (result.success && result.files) {
        console.log('✅ Fichiers exportés:', result.files);
        console.log('📊 Statistiques:', result.stats);

        // Mettre à jour l'état avec les fichiers enseignants et examens
        const teachersFile: UploadedFile = {
          name: 'Enseignants (depuis DB)',
          path: result.files.teachers,
          type: 'teachers'
        };

        const examsFile: UploadedFile = {
          name: 'Planning Examens (depuis DB)',
          path: result.files.exams,
          type: 'exams'
        };

        setFiles(prev => ({
          ...prev,
          teachers: teachersFile,
          exams: examsFile
        }));

        onFilesChange({
          teachers: result.files.teachers,
          wishes: files.wishes?.path,
          exams: result.files.exams
        });

        toast.success('Fichiers chargés depuis la base de données', {
          description: `${result.stats?.enseignants || 0} enseignants, ${result.stats?.examens || 0} examens`
        });
      } else {
        throw new Error(result.error || 'Erreur lors de l\'export');
      }
    } catch (error: any) {
      console.error('❌ Erreur lors du chargement depuis la DB:', error);
      toast.error('Erreur', {
        description: error?.message || 'Impossible de charger les fichiers depuis la base de données'
      });
    } finally {
      setIsLoadingFromDb(false);
    }
  };

  const handleSelectFile = async (fileType: 'teachers' | 'wishes' | 'exams') => {
    try {
      console.log('🔍 Sélection du fichier:', fileType);
      const filePath = await (window as any).electronAPI.selectFile(fileType);
      console.log('📁 Fichier sélectionné:', filePath);
      console.log('📁 Type:', typeof filePath, filePath);

      if (filePath) {
        const standardFileName = fileType === 'teachers'
          ? 'Enseignants_participants.xlsx'
          : fileType === 'wishes'
            ? 'Souhaits_avec_ids.xlsx'
            : 'Répartition_SE_dedup.xlsx';

        const dataToSend = {
          fileName: standardFileName,
          filePath: filePath
        };

        console.log('💾 Envoi à saveUploadedFile:', dataToSend);
        console.log('💾 fileName:', dataToSend.fileName);
        console.log('💾 filePath:', dataToSend.filePath);
        console.log('💾 Objet stringifié:', JSON.stringify(dataToSend)); // ✅ Voir le contenu exact

        const saveResult = await (window as any).electronAPI.saveUploadedFile(dataToSend);

        console.log('✅ Résultat de la sauvegarde:', saveResult);
        console.log('✅ Résultat stringifié:', JSON.stringify(saveResult)); // ✅ Voir le contenu exact

        if (!saveResult || !saveResult.success) {
          toast.error(`Erreur de sauvegarde: ${saveResult?.error || 'Erreur inconnue'}`);
          console.error('❌ Erreur de sauvegarde:', saveResult?.error);
          return;
        }

        toast.success(`${standardFileName} chargé avec succès`);

        const fileName = filePath.split('\\').pop() || filePath.split('/').pop();
        const newFile: UploadedFile = {
          name: fileName,
          path: filePath,
          type: fileType
        };

        setFiles(prev => ({
          ...prev,
          [fileType]: newFile
        }));

        onFilesChange({
          teachers: files.teachers?.path,
          wishes: files.wishes?.path,
          exams: files.exams?.path,
          [fileType]: filePath
        });
      }
    } catch (error) {
      console.error('❌ Error selecting file:', error);
      toast.error('Erreur lors de la sélection du fichier');
    }
  };  const handleRemoveFile = (fileType: 'teachers' | 'wishes' | 'exams') => {
    setFiles(prev => {
      const updated = { ...prev };
      delete updated[fileType];
      return updated;
    });

    onFilesChange({
      teachers: files.teachers?.path,
      wishes: files.wishes?.path,
      exams: files.exams?.path,
      [fileType]: undefined
    });
  };

  const fileConfigs = [
    {
      type: 'teachers' as const,
      label: 'Fichier Enseignants',
      description: 'Liste des enseignants participants',
      required: true
    },
    {
      type: 'wishes' as const,
      label: 'Fichier Souhaits',
      description: 'Contraintes de disponibilité',
      required: true
    },
    {
      type: 'exams' as const,
      label: 'Fichier Examens',
      description: 'Planning des examens',
      required: true
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold mb-2">Fichiers d'entrée</h3>
          <p className="text-sm text-muted-foreground">
            Cliquez sur "Charger depuis la DB" pour récupérer les fichiers Enseignants et Examens sauvegardés.
            <br />
            Le fichier Souhaits doit être importé manuellement.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleLoadFromDatabase}
          disabled={isLoadingFromDb}
          className="gap-2"
        >
          <Database className="h-4 w-4" />
          {isLoadingFromDb ? 'Chargement...' : 'Charger depuis la DB'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {fileConfigs.map(config => (
          <Card key={config.type} className="p-4">
            <div className="space-y-3">
              <div>
                <h4 className="font-medium flex items-center gap-2">
                  {config.label}
                  {config.required && <span className="text-destructive text-sm">*</span>}
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {config.description}
                </p>
              </div>

              {files[config.type] ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
                  <Check className="h-4 w-4 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100 truncate">
                      {files[config.type]!.name}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveFile(config.type)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSelectFile(config.type)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Sélectionner
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {files.teachers && files.wishes && files.exams && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-900 dark:text-blue-100 flex items-center gap-2">
            <Check className="h-4 w-4" />
            Tous les fichiers sont prêts ! Vous pouvez lancer la génération.
          </p>
        </div>
      )}
    </div>
  );
}