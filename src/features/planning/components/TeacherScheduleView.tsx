import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Mail, Calendar, User, RefreshCw, ArrowRight } from 'lucide-react';
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

interface TeacherScheduleViewProps {
  teacherId: string;
  data: PlanningRow[];
}

export function TeacherScheduleView({ teacherId, data }: TeacherScheduleViewProps) {
  const sessions = ['S1', 'S2', 'S3', 'S4'];
  const timeSlots = {
    S1: '08:30 - 10:00',
    S2: '10:30 - 12:00',
    S3: '12:30 - 14:00',
    S4: '14:30 - 16:00',
  };
  
  const [swapDialogOpen, setSwapDialogOpen] = useState(false);
  const [swapTeacher, setSwapTeacher] = useState<{
    id: string;
    name: string;
    currentDay: number;
    currentSession: string;
  } | null>(null);
  const [swapTargetTeacher, setSwapTargetTeacher] = useState<string | undefined>();
  const [swapTeacher1TargetDay, setSwapTeacher1TargetDay] = useState<number | undefined>();
  const [swapTeacher1TargetSession, setSwapTeacher1TargetSession] = useState<string | undefined>();
  const [swapTeacher2TargetDay, setSwapTeacher2TargetDay] = useState<number | undefined>();
  const [swapTeacher2TargetSession, setSwapTeacher2TargetSession] = useState<string | undefined>();

  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [changeTeacher, setChangeTeacher] = useState<{
    id: string;
    name: string;
    currentDay: number;
    currentSession: string;
  } | null>(null);
  const [changeTargetDay, setChangeTargetDay] = useState<number | undefined>();
  const [changeTargetSession, setChangeTargetSession] = useState<string | undefined>();

  const teacherData = useMemo(() => {
    return data.filter((row) => row.Enseignant_ID === teacherId);
  }, [data, teacherId]);

  const teacher = useMemo(() => {
    const firstRow = teacherData[0];
    return {
      id: teacherId,
      firstName: firstRow?.Prénom || '',
      lastName: firstRow?.Nom || '',
      email: firstRow?.Email || '',
      grade: firstRow?.Grade || '',
      totalAssignments: teacherData.length,
      responsibleCount: teacherData.filter((r) => r.Responsable === 'OUI').length,
      examCount: teacherData.reduce((sum, r) => sum + (r.Nombre_Examens || 0), 0),
    };
  }, [teacherData, teacherId]);

  const daysData = useMemo(() => {
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const daysMap = new Map<number, { date: string; dayOfWeek: string }>();

    teacherData.forEach((row) => {
      if (!daysMap.has(row.Jour)) {
        let formattedDate: Date;
        if (row.Date.includes('/')) {
          const [dayStr, monthStr, yearStr] = row.Date.split('/');
          const day = parseInt(dayStr, 10);
          const month = parseInt(monthStr, 10) - 1;
          const year = parseInt(yearStr, 10);

          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            formattedDate = new Date(year, month, day);
          } else {
            formattedDate = new Date(row.Date);
          }
        } else {
          formattedDate = new Date(row.Date);
        }

        if (!isNaN(formattedDate.getTime())) {
          daysMap.set(row.Jour, {
            date: formattedDate.toISOString().split('T')[0],
            dayOfWeek: dayNames[formattedDate.getDay()],
          });
        }
      }
    });

    return Array.from(daysMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dayNumber, info]) => ({
        dayNumber,
        ...info,
      }));
  }, [teacherData]);
  const allDaysData = useMemo(() => {
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const daysMap = new Map<number, { date: string; dayOfWeek: string }>();

  data.forEach((row) => {  // ← Note: using 'data', not 'teacherData'
    if (!daysMap.has(row.Jour)) {
      let formattedDate: Date;
      if (row.Date.includes('/')) {
        const [dayStr, monthStr, yearStr] = row.Date.split('/');
        const day = parseInt(dayStr, 10);
        const month = parseInt(monthStr, 10) - 1;
        const year = parseInt(yearStr, 10);

        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          formattedDate = new Date(year, month, day);
        } else {
          formattedDate = new Date(row.Date);
        }
      } else {
        formattedDate = new Date(row.Date);
      }

      if (!isNaN(formattedDate.getTime())) {
        daysMap.set(row.Jour, {
          date: formattedDate.toISOString().split('T')[0],
          dayOfWeek: dayNames[formattedDate.getDay()],
        });
      }
    }
  });

  return Array.from(daysMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([dayNumber, info]) => ({
      dayNumber,
      ...info,
    }));
}, [data]);

  const getAssignments = (day: number, session: string) => {
    return teacherData.filter((row) => row.Jour === day && row.Séance === session);
  };

  const [isDownloading, setIsDownloading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleDownloadDoc = async () => {
    setIsDownloading(true);
    try {
      const result = await (window as any).electronAPI.generateTeacherDocument(teacherId);

      if (result.success) {
        toast.success('Document généré avec succès !', {
          description: `${result.surveillances_count} surveillances incluses`,
          action: {
            label: 'Ouvrir',
            onClick: async () => {
              await (window as any).electronAPI.openFile(result.file_path);
            },
          },
          duration: 10000,
        });
      } else {
        toast.error('Erreur lors de la génération', { description: result.error });
      }
    } catch (error) {
      toast.error('Erreur', {
        description: error instanceof Error ? error.message : 'Erreur inconnue',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSendEmail = () => {
    setIsSending(true);

    if (teacher.email) {
      const subject = encodeURIComponent(`Planning de surveillance - ${teacher.lastName} ${teacher.firstName}`);
      const body = encodeURIComponent(
        `Bonjour Mr/Mme ${teacher.lastName},\n\n` +
        `Veuillez trouver ci-joint votre planning de surveillance.\n\n` +
        `Nombre total de surveillances : ${teacher.totalAssignments}\n\n` +
        `Cordialement`
      );
      window.location.href = `mailto:${teacher.email}?subject=${subject}&body=${body}`;

      toast.success('Client email ouvert', {
        description: `Email préparé pour ${teacher.email}`,
      });
    } else {
      toast.error('Email non disponible', {
        description: 'Aucun email renseigné pour cet enseignant',
      });
    }

    setTimeout(() => setIsSending(false), 1000);
  };

  const getGradeColor = (grade: string) => {
    const colors: Record<string, string> = {
      PR: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      MC: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      MA: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      AC: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      AS: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      PTC: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
      PES: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
      V: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      VA: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
      EX: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
    };
    return colors[grade] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      if (dateString.includes('/')) {
        const [day, month, year] = dateString.split('/');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return date.toLocaleDateString('fr-FR');
      } else {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR');
      }
    } catch {
      return dateString;
    }
  };

  const handleSwapClick = (day: number, session: string) => {
    setSwapTeacher({
      id: teacherId,
      name: `${teacher.lastName} ${teacher.firstName}`,
      currentDay: day,
      currentSession: session,
    });
    setSwapTargetTeacher(undefined);
    setSwapTeacher1TargetDay(undefined);
    setSwapTeacher1TargetSession(undefined);
    setSwapTeacher2TargetDay(undefined);
    setSwapTeacher2TargetSession(undefined);
    setSwapDialogOpen(true);
  };

  const handleConfirmSwap = async () => {
    if (!swapTeacher || !swapTargetTeacher || 
        !swapTeacher1TargetDay || !swapTeacher1TargetSession ||
        !swapTeacher2TargetDay || !swapTeacher2TargetSession) return;
    
    try {
      console.log('Permutation:', {
        teacher1: { 
          id: swapTeacher.id, 
          day: swapTeacher1TargetDay,
          session: swapTeacher1TargetSession
        },
        teacher2: { 
          id: swapTargetTeacher, 
          day: swapTeacher2TargetDay,
          session: swapTeacher2TargetSession
        },
      });
      
      // Call backend to swap teachers
      const result = await (window as any).electronAPI.swapTeachers({
        teacher1: {
          id: swapTeacher.id,
          day: swapTeacher1TargetDay,
          session: swapTeacher1TargetSession
        },
        teacher2: {
          id: swapTargetTeacher,
          day: swapTeacher2TargetDay,
          session: swapTeacher2TargetSession
        }
      });
      
      if (result.success) {
        setSwapDialogOpen(false);
        toast.success('Permutation effectuée avec succès !', {
          description: 'Les données ont été mises à jour dans la base de données et le fichier Excel'
        });
        
        // Refresh the page to show updated data
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast.error('Erreur lors de la permutation', {
          description: result.error
        });
      }
    } catch (error) {
      toast.error('Erreur', {
        description: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }
  };

  const handleConfirmChange = async () => {
    if (!changeTeacher || !changeTargetDay || !changeTargetSession) return;
    
    try {
      console.log('Changement:', {
        teacher: changeTeacher.id,
        from: `Jour ${changeTeacher.currentDay} - ${changeTeacher.currentSession}`,
        to: `Jour ${changeTargetDay} - ${changeTargetSession}`,
      });
      
      // Call backend to change teacher slot
      const result = await (window as any).electronAPI.changeTeacherSlot({
        teacher: {
          id: changeTeacher.id
        },
        fromSlot: {
          day: changeTeacher.currentDay,
          session: changeTeacher.currentSession
        },
        toSlot: {
          day: changeTargetDay,
          session: changeTargetSession
        }
      });
      
      if (result.success) {
        setChangeDialogOpen(false);
        toast.success('Changement effectué avec succès !', {
          description: 'Les données ont été mises à jour dans la base de données et le fichier Excel'
        });
        
        // Refresh the page to show updated data
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast.error('Erreur lors du changement', {
          description: result.error
        });
      }
    } catch (error) {
      toast.error('Erreur', {
        description: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    }
  };

  if (teacherData.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Aucune surveillance pour cet enseignant</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-3">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  {teacher.lastName} {teacher.firstName}
                </h2>
                <div className="text-sm text-muted-foreground font-mono">
                  ID: {teacher.id}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <Badge className={getGradeColor(teacher.grade)}>{teacher.grade}</Badge>
              <Badge variant="outline">{teacher.totalAssignments} surveillances</Badge>
              {teacher.responsibleCount > 0 && (
                <Badge className="bg-green-600">
                  Responsable de {teacher.responsibleCount} examen
                  {teacher.responsibleCount > 1 ? 's' : ''}
                </Badge>
              )}
              <div className="text-sm text-muted-foreground mt-1">
                {teacher.examCount} examen{teacher.examCount > 1 ? 's' : ''}
              </div>
            </div>

            <div className="space-y-1">
              {teacher.email ? (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={`mailto:${teacher.email}`}
                    className="text-blue-600 hover:underline font-mono"
                  >
                    {teacher.email}
                  </a>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>Email non renseigné</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleDownloadDoc}
                variant="outline"
                className="gap-2"
                disabled={isDownloading}
              >
                <Download className="h-4 w-4" />
                {isDownloading ? 'Téléchargement...' : 'Télécharger'}
              </Button>

            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const assignments = teacherData.filter(row => row.Enseignant_ID === teacherId);
                  if (assignments.length > 0) {
                    handleSwapClick(assignments[0].Jour, assignments[0].Séance);
                  } else {
                    toast.error("Aucune affectation disponible pour permutation");
                  }
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Permuter
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const assignments = teacherData.filter(row => row.Enseignant_ID === teacherId);
                  if (assignments.length > 0) {
                    // Open dialog without pre-selecting a slot
                    setChangeTeacher({
                      id: teacherId,
                      name: `${teacher.lastName} ${teacher.firstName}`,
                      currentDay: 0,
                      currentSession: '',
                    });
                    setChangeTargetDay(undefined);
                    setChangeTargetSession(undefined);
                    setChangeDialogOpen(true);
                  } else {
                    toast.error("Aucune affectation disponible pour changement");
                  }
                }}
              >
                <ArrowRight className="h-4 w-4" />
                Changer
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 overflow-x-auto">
        <div className="min-w-[600px]">
          <h3 className="font-semibold mb-4">Planning de Surveillance</h3>

          <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: `100px repeat(${daysData.length}, 1fr)` }}>
            <div className="font-semibold text-sm text-muted-foreground p-2">Séance</div>
            {daysData.map((day) => (
              <div
                key={day.dayNumber}
                className="flex flex-col justify-center items-center p-2 bg-muted rounded-md"
              >
                <div className="text-sm font-bold capitalize">{day.dayOfWeek}</div>
                <div className="text-xs opacity-90">
                  {new Date(day.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                </div>
              </div>
            ))}
          </div>

          {sessions.map((session) => (
            <div
              key={session}
              className="grid gap-2 mb-2"
              style={{ gridTemplateColumns: `100px repeat(${daysData.length}, 1fr)` }}
            >
              <div className="flex flex-col justify-center items-center p-2 bg-muted rounded-md">
                <div className="font-bold">{session}</div>
                <div className="text-xs text-muted-foreground text-center">
                  {timeSlots[session as keyof typeof timeSlots]}
                </div>
              </div>

              {daysData.map((day) => {
                const assignments = getAssignments(day.dayNumber, session);
                const hasAssignment = assignments.length > 0;

                return (
                  <div
                    key={`${day.dayNumber}-${session}`}
                    className={`
                      p-3 rounded-md border-2 transition-colors
                      ${
                      hasAssignment
                        ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
                        : 'bg-gray-50 dark:bg-gray-900 border-dashed border-gray-200 dark:border-gray-700 hover:bg-muted/30'
                    }
                    `}
                  >
                    {hasAssignment ? (
                      <div className="space-y-2">
                        {assignments.map((assignment, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-xs font-semibold">Affecté</span>
                            </div>
                            {assignment.Responsable === 'OUI' && (
                              <Badge className="bg-green-600 text-xs w-full justify-center">
                                Responsable
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-xs text-muted-foreground">Libre</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={swapDialogOpen} onOpenChange={setSwapDialogOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Permuter l'enseignant
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4 pb-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-sm font-medium text-muted-foreground mb-2">Enseignant actuel :</p>
              <p className="font-bold text-lg">{swapTeacher?.name}</p>
              <p className="text-sm text-muted-foreground">
                Jour {swapTeacher?.currentDay} - {swapTeacher?.currentSession}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Jour où l'enseignant veut aller :</label>
              <Select
                value={swapTeacher1TargetDay?.toString()}
                onValueChange={(value) => {
                  setSwapTeacher1TargetDay(Number(value));
                  setSwapTeacher1TargetSession(undefined);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un jour" />
                </SelectTrigger>
                <SelectContent>
                  {daysData
                    .filter(day => 
                      teacherData.some(row => 
                        row.Enseignant_ID === teacherId && 
                        row.Jour === day.dayNumber
                      )
                    )
                    .map((day) => (
                      <SelectItem key={day.dayNumber} value={day.dayNumber.toString()}>
                        Jour {day.dayNumber} - {day.dayOfWeek} ({formatDate(day.date)})
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            {swapTeacher1TargetDay && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Séance où l'enseignant veut aller :</label>
                <Select
                  value={swapTeacher1TargetSession}
                  onValueChange={(value) => {
                    setSwapTeacher1TargetSession(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez une séance" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions
                      .filter(session => 
                        teacherData.some(row => 
                          row.Enseignant_ID === teacherId && 
                          row.Jour === swapTeacher1TargetDay && 
                          row.Séance === session
                        )
                      )
                      .map((session) => (
                        <SelectItem key={session} value={session}>
                          {session} - {timeSlots[session as keyof typeof timeSlots]}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Enseignant à permuter :</label>
              <Select value={swapTargetTeacher} onValueChange={setSwapTargetTeacher}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un enseignant" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set(data.map(row => row.Enseignant_ID)))
                    .filter(id => id !== teacherId)
                    .map(id => {
                      const teacherRow = data.find(row => row.Enseignant_ID === id);
                      return {
                        id,
                        name: `${teacherRow?.Nom || ''} ${teacherRow?.Prénom || ''}`,
                        grade: teacherRow?.Grade || '',
                      };
                    })
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(teacher => (
                      <SelectItem key={teacher.id} value={teacher.id}>
                        {teacher.name} ({teacher.grade})
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            {swapTargetTeacher && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Jour où l'autre enseignant a des examens :</label>
                  <Select
                    value={swapTeacher2TargetDay?.toString()}
                    onValueChange={(value) => {
                      setSwapTeacher2TargetDay(Number(value));
                      setSwapTeacher2TargetSession(undefined);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionnez un jour" />
                    </SelectTrigger>
                    <SelectContent>
                      {allDaysData    
                        .filter(day => 
                          data.some(row => 
                            row.Enseignant_ID === swapTargetTeacher && 
                            row.Jour === day.dayNumber
                          )
                        )
                        .map((day) => (
                          <SelectItem key={day.dayNumber} value={day.dayNumber.toString()}>
                            Jour {day.dayNumber} - {day.dayOfWeek} ({formatDate(day.date)})
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                </div>

                {swapTeacher2TargetDay && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Séance où l'autre enseignant a des examens :</label>
                    <Select
                      value={swapTeacher2TargetSession}
                      onValueChange={setSwapTeacher2TargetSession}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez une séance" />
                      </SelectTrigger>
                      <SelectContent>
                        {sessions
                          .filter(session => 
                            data.some(row => 
                              row.Enseignant_ID === swapTargetTeacher && 
                              row.Jour === swapTeacher2TargetDay && 
                              row.Séance === session
                            )
                          )
                          .map((session) => (
                            <SelectItem key={session} value={session}>
                              {session} - {timeSlots[session as keyof typeof timeSlots]}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {swapTeacher2TargetSession && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border-2 border-green-200 dark:border-green-800">
                    <p className="text-sm font-medium mb-2">Résumé de la permutation :</p>
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="font-semibold">{swapTeacher?.name}</span> au créneau Jour{' '}
                        {swapTeacher1TargetDay} - {swapTeacher1TargetSession}
                      </p>
                      <p className="text-center my-1">↕️ Permute avec ↕️</p>
                      <p>
                        <span className="font-semibold">
                          {data.find(row => row.Enseignant_ID === swapTargetTeacher)?.Nom}{' '}
                          {data.find(row => row.Enseignant_ID === swapTargetTeacher)?.Prénom}
                        </span>{' '}
                        au créneau Jour {swapTeacher2TargetDay} - {swapTeacher2TargetSession}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSwapDialogOpen(false)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={handleConfirmSwap}
                disabled={!swapTargetTeacher || !swapTeacher1TargetDay || !swapTeacher1TargetSession || !swapTeacher2TargetDay || !swapTeacher2TargetSession}
                className="flex-1"
              >
                Confirmer la permutation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Changer l'horaire de l'enseignant
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4 pb-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-sm font-medium text-muted-foreground mb-2">Enseignant :</p>
              <p className="font-bold text-lg">{changeTeacher?.name}</p>
            </div>
            
            {/* FROM: Select current day/slot */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Depuis quel jour :</label>
              <Select
                value={changeTeacher?.currentDay?.toString()}
                onValueChange={(value) => {
                  const day = Number(value);
                  setChangeTeacher(prev => prev ? { ...prev, currentDay: day, currentSession: '' } : null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionnez un jour" />
                </SelectTrigger>
                <SelectContent>
                  {daysData
                    .filter(day => 
                      // Only show days where this teacher works
                      teacherData.some(row => 
                        row.Enseignant_ID === teacherId && 
                        row.Jour === day.dayNumber
                      )
                    )
                    .map((day) => (
                      <SelectItem key={day.dayNumber} value={day.dayNumber.toString()}>
                        Jour {day.dayNumber} - {day.dayOfWeek} ({formatDate(day.date)})
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            {changeTeacher?.currentDay && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Depuis quelle séance :</label>
                <Select
                  value={changeTeacher?.currentSession}
                  onValueChange={(value) => {
                    setChangeTeacher(prev => prev ? { ...prev, currentSession: value } : null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez une séance" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions
                      .filter(session => 
                        // Only show sessions where this teacher works on the selected day
                        teacherData.some(row => 
                          row.Enseignant_ID === teacherId && 
                          row.Jour === changeTeacher.currentDay && 
                          row.Séance === session
                        )
                      )
                      .map((session) => (
                        <SelectItem key={session} value={session}>
                          {session} - {timeSlots[session as keyof typeof timeSlots]}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* TO: Select target day/slot */}
            {changeTeacher?.currentSession && (
              <>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground mb-4">Vers :</p>
                </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nouveau jour :</label>
                    <Select
                      value={changeTargetDay?.toString()}
                      onValueChange={(value) => {
                        setChangeTargetDay(Number(value));
                        setChangeTargetSession(undefined);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un jour" />
                      </SelectTrigger>
                      <SelectContent>
                        {allDaysData
                          .filter(day => 
                            // Only show days that have exams
                            data.some(row => 
                              row.Jour === day.dayNumber && 
                              row.Nombre_Examens > 0
                            )
                          )
                          .map((day) => (
                            <SelectItem key={day.dayNumber} value={day.dayNumber.toString()}>
                              Jour {day.dayNumber} - {day.dayOfWeek} ({formatDate(day.date)})
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>

                  {changeTargetDay && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nouvelle séance :</label>
                      <Select value={changeTargetSession} onValueChange={setChangeTargetSession}>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionnez une séance" />
                        </SelectTrigger>
                        <SelectContent>
                          {sessions
                            .filter(session => 
                              // Only show sessions that have exams on the selected day
                              data.some(row => 
                                row.Jour === changeTargetDay && 
                                row.Séance === session && 
                                row.Nombre_Examens > 0
                              )
                            )
                            .map((session) => (
                              <SelectItem key={session} value={session}>
                                {session} - {timeSlots[session as keyof typeof timeSlots]}
                              </SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

            {changeTargetSession && (
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border-2 border-green-200 dark:border-green-800">
                <p className="text-sm font-medium mb-2">Résumé du changement :</p>
                <div className="space-y-1 text-sm">
                  <p>
                    <span className="font-semibold">{changeTeacher?.name}</span> sera déplacé de :
                  </p>
                  <p className="ml-4">
                    <span className="text-red-600">Jour {changeTeacher?.currentDay} - {changeTeacher?.currentSession}</span>
                  </p>
                  <p className="ml-4">vers</p>
                  <p className="ml-4">
                    <span className="text-green-600">Jour {changeTargetDay} - {changeTargetSession}</span>
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setChangeDialogOpen(false)}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                onClick={handleConfirmChange}
                disabled={!changeTargetSession}
                className="flex-1"
              >
                Confirmer le changement
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}