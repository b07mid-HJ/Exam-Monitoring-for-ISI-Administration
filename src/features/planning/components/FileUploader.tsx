import { useState } from 'react';
import { Upload, Check, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileUploadCard } from './FileUploadCard';

interface UploadedFile {
  name: string;
  path: string;
  type: 'teachers' | 'wishes' | 'exams' | 'credits';
}

interface FileUploaderProps {
  onFilesChange: (files: { teachers?: string; wishes?: string; exams?: string; credits?: string }) => void;
}

export function FileUploader({ onFilesChange }: FileUploaderProps) {
  const [files, setFiles] = useState<{
    teachers?: UploadedFile;
    wishes?: UploadedFile;
    exams?: UploadedFile;
    credits?: UploadedFile;
  }>({});
  const [isLoadingFromDb, setIsLoadingFromDb] = useState(false);
  const [showManualUpload, setShowManualUpload] = useState(false);

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

  const handleSelectFile = async (fileType: 'teachers' | 'wishes' | 'exams' | 'credits') => {
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
            : fileType === 'credits'
              ? 'Credits_session_precedente.xlsx'
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
          credits: files.credits?.path,
          [fileType]: filePath
        });
      }
    } catch (error) {
      console.error('❌ Error selecting file:', error);
      toast.error('Erreur lors de la sélection du fichier');
    }
  };  

  const handleRemoveFile = (fileType: 'teachers' | 'wishes' | 'exams' | 'credits') => {
    setFiles(prev => {
      const updated = { ...prev };
      delete updated[fileType];
      return updated;
    });

    onFilesChange({
      teachers: files.teachers?.path,
      wishes: files.wishes?.path,
      exams: files.exams?.path,
      credits: files.credits?.path,
      [fileType]: undefined
    });
  };

  const fileConfigs = [
    {
      type: 'teachers' as const,
      label: 'Fichier Enseignants',
      description: 'Liste des enseignants participants',
      required: true,
      alwaysVisible: false
    },
    {
      type: 'wishes' as const,
      label: 'Fichier Souhaits',
      description: 'Contraintes de disponibilité',
      required: true,
      alwaysVisible: true
    },
    {
      type: 'exams' as const,
      label: 'Fichier Examens',
      description: 'Planning des examens',
      required: true,
      alwaysVisible: false
    },
    {
      type: 'credits' as const,
      label: 'Fichier Crédits',
      description: 'Crédits de la session précédente (optionnel)',
      required: false,
      alwaysVisible: true
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold mb-2">Fichiers d'entrée</h3>
          <p className="text-sm text-muted-foreground">
            Le fichier des souhaits est requis pour continuer.
            <br />
            Vous pouvez également charger les autres fichiers depuis la base de données ou les importer manuellement.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            type="button"
            onClick={handleLoadFromDatabase}
            disabled={isLoadingFromDb}
            className="flex-1"
            variant="outline"
          >
            {isLoadingFromDb ? (
              <>
                <Database className="mr-2 h-4 w-4 animate-spin" />
                Chargement...
              </>
            ) : (
              <>
                <Database className="mr-2 h-4 w-4" />
                Charger depuis la base de données
              </>
            )}
          </Button>
          <Button
            type="button"
            variant={showManualUpload ? 'default' : 'outline'}
            onClick={() => setShowManualUpload(!showManualUpload)}
            className="flex-1"
          >
            <Upload className="mr-2 h-4 w-4" />
            {showManualUpload ? 'Masquer les champs' : 'Insérer les fichiers manuellement'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Affichage des champs en fonction de showManualUpload */}
        {showManualUpload ? (
          // Afficher les 3 champs côte à côte
          <div className="grid gap-4 md:grid-cols-3">
            {fileConfigs.map(config => (
              <FileUploadCard
                key={config.type}
                title={config.label}
                description={config.description}
                file={files[config.type]}
                onSelect={() => handleSelectFile(config.type)}
                onRemove={() => handleRemoveFile(config.type)}
                required={config.required}
              />
            ))}
          </div>
        ) : (
          // Afficher uniquement le fichier de souhaits centré
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              {fileConfigs
                .filter(config => config.alwaysVisible)
                .map(config => (
                  <FileUploadCard
                    key={config.type}
                    title={config.label}
                    description={config.description}
                    file={files[config.type]}
                    onSelect={() => handleSelectFile(config.type)}
                    onRemove={() => handleRemoveFile(config.type)}
                    required={config.required}
                  />
                ))}
            </div>
          </div>
        )}
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