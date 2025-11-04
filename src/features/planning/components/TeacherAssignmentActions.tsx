import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface TeacherAssignmentActionsProps {
  teacherId: string;
  allDaysData: Array<{ dayNumber: number; date: string; dayOfWeek: string }>;
  sessions: string[];
  timeSlots: Record<string, string>;
}

export function TeacherAssignmentActions({
  teacherId,
  allDaysData,
  sessions,
  timeSlots,
}: TeacherAssignmentActionsProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState<'auto' | 'manual'>('auto');
  const [addTargetDay, setAddTargetDay] = useState<number | undefined>();
  const [addTargetSession, setAddTargetSession] = useState<string | undefined>();
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [pendingAddData, setPendingAddData] = useState<{
    day: number;
    session: string;
    warnings: string[];
  } | null>(null);

  const handleAddAutomatic = async () => {
    try {
      const result = await (window as any).electronAPI.addTeacherAssignment({
        teacherId,
        isAutomatic: true
      });
      
      if (result.success) {
        setAddDialogOpen(false);
        toast.success('Affectation ajoutée automatiquement !', {
          description: `Créneau : Jour ${result.assignment.Jour} - ${result.assignment.Séance}`
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error('Erreur', { description: result.error });
      }
    } catch (error) {
      toast.error('Erreur', {
        description: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }
  };

  const handleAddManual = async () => {
    if (!addTargetDay || !addTargetSession) return;
    
    try {
      const result = await (window as any).electronAPI.addTeacherAssignment({
        teacherId,
        day: addTargetDay,
        session: addTargetSession,
        isAutomatic: false
      });
      
      if (result.success) {
        // Vérifier s'il y a des avertissements
        const warnings = [];
        
        if (result.isUnwishedSlot) {
          warnings.push('Ce créneau n\'est pas dans les souhaits de l\'enseignant');
        }
        
        if (result.limitExceeded) {
          warnings.push(`La limite est dépassée : ${result.currentCount}/${result.maxCount} affectations ce jour`);
        }
        
        if (warnings.length > 0) {
          // Afficher le dialog d'avertissement
          setPendingAddData({
            day: addTargetDay,
            session: addTargetSession,
            warnings
          });
          setAddDialogOpen(false);
          setWarningDialogOpen(true);
        } else {
          // Pas d'avertissement, ajouter directement
          setAddDialogOpen(false);
          toast.success('Affectation ajoutée !');
          setTimeout(() => window.location.reload(), 1500);
        }
      } else {
        toast.error('Erreur', { description: result.error });
      }
    } catch (error) {
      toast.error('Erreur', {
        description: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }
  };

  const handleConfirmWithWarnings = () => {
    setWarningDialogOpen(false);
    toast.success('Affectation ajoutée malgré les avertissements');
    setTimeout(() => window.location.reload(), 1500);
  };

  const handleCancelWithWarnings = async () => {
    if (!pendingAddData) return;
    
    try {
      // Supprimer l'affectation qui a été ajoutée
      const result = await (window as any).electronAPI.deleteTeacherAssignment({
        teacherId,
        day: pendingAddData.day,
        session: pendingAddData.session
      });
      
      setWarningDialogOpen(false);
      setPendingAddData(null);
      
      if (result.success) {
        toast.info('Ajout annulé - L\'affectation a été supprimée');
      } else {
        toast.error('Erreur lors de l\'annulation', { description: result.error });
      }
    } catch (error) {
      toast.error('Erreur', {
        description: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }
  };


  return (
    <>
      {/* Boutons d'ajout */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          variant="default"
          className="gap-2"
          onClick={() => {
            setAddMode('auto');
            setAddDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Ajouter Auto
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            setAddMode('manual');
            setAddTargetDay(undefined);
            setAddTargetSession(undefined);
            setAddDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Ajouter Manuel
        </Button>
      </div>

      {/* Dialog Ajout d'affectation */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {addMode === 'auto' ? 'Ajout Automatique' : 'Ajout Manuel'}
            </DialogTitle>
          </DialogHeader>
          
          {addMode === 'auto' ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Le système va trouver automatiquement le premier créneau libre souhaité par l'enseignant,
                en respectant la contrainte du nombre maximum de sessions par jour.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="flex-1">
                  Annuler
                </Button>
                <Button onClick={handleAddAutomatic} className="flex-1">
                  Ajouter Automatiquement
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Jour :</label>
                <Select value={addTargetDay?.toString()} onValueChange={(v) => {
                  setAddTargetDay(Number(v));
                  setAddTargetSession(undefined);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un jour" />
                  </SelectTrigger>
                  <SelectContent>
                    {allDaysData.map((day) => (
                      <SelectItem key={day.dayNumber} value={day.dayNumber.toString()}>
                        Jour {day.dayNumber} - {day.dayOfWeek}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {addTargetDay && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Séance :</label>
                  <Select value={addTargetSession} onValueChange={setAddTargetSession}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez une séance" />
                    </SelectTrigger>
                    <SelectContent>
                      {sessions.map((session) => (
                        <SelectItem key={session} value={session}>
                          {session} - {timeSlots[session as keyof typeof timeSlots]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="flex-1">
                  Annuler
                </Button>
                <Button 
                  onClick={handleAddManual} 
                  disabled={!addTargetDay || !addTargetSession}
                  className="flex-1"
                >
                  Ajouter
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Alert Dialog Avertissements */}
      <AlertDialog open={warningDialogOpen} onOpenChange={setWarningDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Avertissements détectés
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2 mt-2">
                <p className="font-medium">Les contraintes suivantes ne sont pas respectées :</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {pendingAddData?.warnings.map((warning, idx) => (
                    <li key={idx} className="text-orange-600 dark:text-orange-400">
                      {warning}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm">
                  Voulez-vous quand même ajouter cette affectation ?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelWithWarnings}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmWithWarnings}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Continuer quand même
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Composant pour le bouton de suppression dans les cellules
interface DeleteAssignmentButtonProps {
  teacherId: string;
  day: number;
  session: string;
  isResponsible: boolean;
}

export function DeleteAssignmentButton({ teacherId, day, session, isResponsible }: DeleteAssignmentButtonProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleConfirmDelete = async () => {
    try {
      const result = await (window as any).electronAPI.deleteTeacherAssignment({
        teacherId,
        day,
        session
      });
      
      if (result.success) {
        setDeleteConfirmOpen(false);
        toast.success('Affectation supprimée !');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error('Erreur', { description: result.error });
      }
    } catch (error) {
      toast.error('Erreur', {
        description: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="absolute -top-1 -right-1 h-5 w-5 p-0 hover:bg-red-100 z-10"
        onClick={() => setDeleteConfirmOpen(true)}
      >
        <X className="h-3 w-3 text-red-600" />
      </Button>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {isResponsible && <AlertTriangle className="h-5 w-5 text-orange-600" />}
              Confirmer la suppression
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isResponsible ? (
                <div className="space-y-2">
                  <p className="font-semibold text-orange-600">
                    ⚠️ Attention : Cet enseignant est RESPONSABLE dans ce créneau !
                  </p>
                  <p>
                    Êtes-vous sûr de vouloir supprimer cette affectation ?
                    Cette action est irréversible.
                  </p>
                </div>
              ) : (
                <p>
                  Êtes-vous sûr de vouloir supprimer cette affectation ?
                  Cette action est irréversible.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete} 
              className={isResponsible ? "bg-orange-600 hover:bg-orange-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isResponsible ? "Supprimer quand même" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
