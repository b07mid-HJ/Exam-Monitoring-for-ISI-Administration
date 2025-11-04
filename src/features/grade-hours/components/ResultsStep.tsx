import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChevronLeft, Save, CheckCircle2, Edit } from 'lucide-react'
import { GradeHoursData, Ecarts } from '../types'
import { Badge } from '@/components/ui/badge'
import { EditEcartsDialog } from './EditEcartsDialog'

interface ResultsStepProps {
  data: GradeHoursData | null
  onBack: () => void
  onRegenerate: (newEcarts: Ecarts) => void
  uploadedFiles: { professorsFile: string; planningFile: string } | null
  isLoading?: boolean
}

export function ResultsStep({ data, onBack, onRegenerate, uploadedFiles, isLoading }: ResultsStepProps) {
  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)

  const handleValidate = () => {
    setShowValidationDialog(true)
  }

  const handleConfirmValidation = async () => {
    if (!data) {
      alert('Aucune donnée à sauvegarder')
      return
    }

    if (!uploadedFiles) {
      alert('Fichiers non trouvés. Veuillez recommencer l\'import.')
      return
    }

    try {
      // Vérifier que l'API est disponible
      if (!window.electronAPI || typeof window.electronAPI.saveGradeHours !== 'function') {
        throw new Error('L\'API Electron n\'est pas disponible.')
      }

      // Sauvegarder les heures par grade ET les fichiers dans la DB
      const result = await window.electronAPI.saveGradeHours({
        gradeHoursData: data,
        professorsFile: uploadedFiles.professorsFile,
        planningFile: uploadedFiles.planningFile
      })

      if (result.success) {
        console.log('✅ Heures par grade sauvegardées:', result)
        
        // Afficher un message de succès détaillé
        const gradesList = data.grades
          .map(g => `${g.grade}: ${g.surveillances_par_prof}h`)
          .join('\n')
        
        alert(
          `✅ Configuration enregistrée avec succès !\n\n` +
          `Fichier: ${result.path}\n\n` +
          `Données sauvegardées:\n` +
          `- ${result.stats?.enseignants || 0} enseignants\n` +
          `- ${result.stats?.examens || 0} examens\n\n` +
          `Heures par grade:\n${gradesList}`
        )
        setShowValidationDialog(false)
      } else {
        throw new Error(result.error || 'Erreur lors de la sauvegarde')
      }
    } catch (error: any) {
      console.error('❌ Error saving grade hours:', error)
      alert(`❌ Erreur lors de la sauvegarde:\n\n${error?.message || 'Une erreur est survenue'}`)
    }
  }

  if (!data) {
    return <div>Aucune donnée disponible</div>
  }

  const totalSurveillances = data.grades.reduce((sum, grade) => 
    sum + (grade.surveillances_par_prof * grade.nbr_professeurs), 0)
  const totalProfesseurs = data.grades.reduce((sum, grade) => sum + grade.nbr_professeurs, 0)

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold'>Résultats de l'Analyse</h2>
          <p className='text-muted-foreground mt-1'>
            Répartition des surveillances et indisponibilités par grade académique
          </p>
        </div>
        <Badge variant='outline' className='text-sm'>
          <CheckCircle2 className='mr-1 h-3 w-3' />
          Généré avec succès
        </Badge>
      </div>

      <Card className='p-6'>
        <div className='space-y-6'>
          <div className='flex items-center justify-between'>
            <div className='grid grid-cols-1 md:grid-cols-4 gap-4 w-full'>
              <div className='space-y-1'>
                <p className='text-sm text-muted-foreground'>Total Professeurs</p>
                <p className='text-2xl font-bold'>{data.nbr_prof_total}</p>
              </div>
              <div className='space-y-1'>
                <p className='text-sm text-muted-foreground'>Salles à Surveiller</p>
                <p className='text-2xl font-bold'>{data.nbr_salle_total}</p>
              </div>
              <div className='space-y-1'>
                <p className='text-sm text-muted-foreground'>Créneaux Totaux</p>
                <p className='text-2xl font-bold'>{data.nbr_creneau_total}</p>
              </div>
              <div className='space-y-1'>
                <p className='text-sm text-muted-foreground'>Profs par Salle</p>
                <p className='text-2xl font-bold'>{data.nb_enseignants_par_salle.toFixed(1)}</p>

              </div>
            </div>
          </div>

          <Card className='p-4 bg-muted/50'>
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <h4 className='font-semibold'>Écarts entre Niveaux</h4>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setShowEditDialog(true)}
                  disabled={isLoading}
                >
                  <Edit className='mr-2 h-3 w-3' />
                  Modifier les Écarts
                </Button>
              </div>
              <div className='grid grid-cols-3 gap-4 text-sm'>
                <div>
                  <span className='text-muted-foreground'>Niveau 1→2:</span>
                  <span className='ml-2 font-medium'>{data.ecarts.ecart_1_2} surveillances</span>
                </div>
                <div>
                  <span className='text-muted-foreground'>Niveau 2→3:</span>
                  <span className='ml-2 font-medium'>{data.ecarts.ecart_2_3} surveillances</span>
                </div>
                <div>
                  <span className='text-muted-foreground'>Niveau 3→4:</span>
                  <span className='ml-2 font-medium'>{data.ecarts.ecart_3_4} surveillances</span>
                </div>
              </div>
            </div>
          </Card>

          <Separator />

          <div>
            <h3 className='text-lg font-semibold mb-4'>Répartition par Grade</h3>
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead className='text-right'>Nb Profs</TableHead>
                    <TableHead className='text-right'>Heures de Surveillance</TableHead>
                    <TableHead className='text-right'>Indisponibilités Autorisées</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.grades.map((grade) => (
                    <TableRow key={grade.grade}>
                      <TableCell className='font-mono font-semibold'>
                        {grade.grade}
                      </TableCell>
                      <TableCell className='text-right'>
                        {grade.nbr_professeurs}
                      </TableCell>
                      <TableCell className='text-right font-medium'>
                        {grade.surveillances_par_prof.toFixed(1)}h
                      </TableCell>
                      <TableCell className='text-right font-medium'>
                        {grade.indisponibilites_autorisees}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className='bg-muted/50 font-semibold'>
                    <TableCell>Total</TableCell>
                    <TableCell className='text-right'>{totalProfesseurs}</TableCell>
                    <TableCell className='text-right'>{totalSurveillances.toFixed(1)}h</TableCell>
                    <TableCell className='text-right'>-</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </Card>

      <div className='flex justify-between pt-4'>
        <Button variant='outline' onClick={onBack} disabled={isLoading}>
          <ChevronLeft className='mr-2 h-4 w-4' />
          Retour
        </Button>
        <Button size='lg' onClick={handleValidate} disabled={isLoading}>
          <Save className='mr-2 h-4 w-4' />
          Valider et Enregistrer
        </Button>
      </div>

      {/* Dialog d'édition des écarts */}
      <EditEcartsDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        currentEcarts={data.ecarts}
        onConfirm={onRegenerate}
      />

      {/* Dialog de validation */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la Validation</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir valider et enregistrer cette configuration ?
              Cette action appliquera les heures et séances définies pour tous les grades.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setShowValidationDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleConfirmValidation}>
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
