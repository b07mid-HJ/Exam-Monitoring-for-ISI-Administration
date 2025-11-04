import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { Users, Clock, Mail, UserX } from 'lucide-react';
import { toast } from 'sonner';

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

interface CalendarViewProps {
  data: PlanningRow[];
  isHistoryView?: boolean;
}

interface SessionDetail {
  day: number;
  session: string;
  date: string;
  examCount: number;
  teachers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    grade: string;
    isResponsible: boolean;
  }>;
}

export function CalendarView({ data, isHistoryView = false }: CalendarViewProps) {
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Stocke les absences sous la forme: `${teacherId}-${day}-${session}`
  const [absentTeachers, setAbsentTeachers] = useState<Set<string>>(new Set());
  
  const getAbsenceKey = (teacherId: string, day: number, session: string) => {
    return `${teacherId}-${day}-${session}`;
  };
  
  const isTeacherAbsent = (teacherId: string, day: number, session: string) => {
    return absentTeachers.has(getAbsenceKey(teacherId, day, session));
  };
  
  const markTeacherAbsent = async (teacherId: string, day: number, session: string, teacherName: string) => {
    const absenceKey = getAbsenceKey(teacherId, day, session);
    setAbsentTeachers(prev => new Set([...prev, absenceKey]));
    
    try {
      // Appeler l'API pour incrémenter le crédit de l'enseignant
      const result = await (window as any).electronAPI.recordTeacherAbsence({
        teacherId,
        teacherName
      });
      
      if (result.success) {
        toast.success('Crédit mis à jour avec succès');
      } else {
        toast.error('Erreur lors de la mise à jour du crédit');
        console.error(result.error);
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du crédit:', error);
      toast.error('Erreur lors de la mise à jour du crédit');
    }
  };
  
  // Removed permuter and changer functionality as it's now in TeacherScheduleView

  const sessions = ['S1', 'S2', 'S3', 'S4'];
  const timeSlots = {
    S1: '08:30 - 10:00',
    S2: '10:30 - 12:00',
    S3: '12:30 - 14:00',
    S4: '14:30 - 16:00',
  };

  const daysData = useMemo(() => {
    const daysMap = new Map<number, { date: string; dayOfWeek: string }>();
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    data.forEach((row) => {
      if (!daysMap.has(row.Jour)) {
        let date: Date;
        if (row.Date.includes('/')) {
          const [dayStr, monthStr, yearStr] = row.Date.split('/');
          date = new Date(`${yearStr}-${monthStr}-${dayStr}`);
        } else {
          date = new Date(row.Date);
        }

        daysMap.set(row.Jour, {
          date: row.Date,
          dayOfWeek: dayNames[date.getDay()],
        });
      }
    });

    return Array.from(daysMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dayNumber, info]) => ({
        dayNumber,
        ...info,
      }));
  }, [data]);

  const dayDates = useMemo(() => {
    const map = new Map<number, string>();
    data.forEach((row) => {
      if (!map.has(row.Jour)) {
        map.set(row.Jour, row.Date);
      }
    });
    return map;
  }, [data]);

  const getSessionData = (day: number, session: string) => {
    const sessionData = data.filter((row) => row.Jour === day && row.Séance === session);
    if (sessionData.length === 0) return null;
    console.log(sessionData);
    // Get the exam count from the first row (should be the same for all rows in this session)
    const examCount = sessionData[0].Nombre_Examens || 0;
    console.log(examCount);
    const teacherMap = new Map<
      string,
      {
        firstName: string;
        lastName: string;
        email: string;
        grade: string;
        isResponsible: boolean;
      }
    >();

    sessionData.forEach((row) => {
      if (!teacherMap.has(row.Enseignant_ID)) {
        teacherMap.set(row.Enseignant_ID, {
          firstName: row.Prénom || '',
          lastName: row.Nom || '',
          email: row.Email || '',
          grade: row.Grade,
          isResponsible: row.Responsable === 'OUI',
        });
      }
    });

    return {
      count: teacherMap.size,
      examCount: examCount,
      teachers: Array.from(teacherMap.entries()).map(([id, info]) => ({
        id,
        ...info,
      })),
    };
  };

  const handleCellClick = (day: number, session: string) => {
    const sessionInfo = getSessionData(day, session);
    if (sessionInfo) {
      setSelectedSession({
        day,
        session,
        date: dayDates.get(day) || '',
        examCount: sessionInfo.examCount,
        teachers: sessionInfo.teachers,
      });
      setDialogOpen(true);
    }
  };

  const getGradeColor = (grade: string) => {
    const colors: Record<string, string> = {
      PR: 'bg-purple-500',
      MC: 'bg-blue-500',
      MA: 'bg-green-500',
      AC: 'bg-yellow-500',
      AS: 'bg-orange-500',
      PTC: 'bg-cyan-500',
      PES: 'bg-indigo-500',
      V: 'bg-gray-500',
      EX: 'bg-slate-500',
    };
    return colors[grade] || 'bg-gray-400';
  };

  const getCellColor = (count: number) => {
    if (count === 0) return 'bg-gray-50 dark:bg-gray-900 border-dashed';
    if (count <= 15) return 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800';
    if (count <= 30) return 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800';
    return 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800';
  };

  // Removed permuter and changer functionality as it's now in TeacherScheduleView

  const uniqueDays = daysData.map((d) => d.dayNumber);

  return (
    <>
      <Card className="p-4 overflow-x-auto">
        <div className="min-w-[800px]">
          <div
            className="grid gap-2 mb-2"
            style={{ gridTemplateColumns: `120px repeat(${uniqueDays.length}, 1fr)` }}
          >
            <div className="font-semibold text-sm text-muted-foreground p-2">
              Séance / Jour
            </div>
            {uniqueDays.map((day) => {
              const rawDate = dayDates.get(day) || '';
              let dateObj: Date;

              if (rawDate.includes('/')) {
                const [dayStr, monthStr, yearStr] = rawDate.split('/');
                dateObj = new Date(`${yearStr}-${monthStr}-${dayStr}`);
              } else {
                dateObj = new Date(rawDate);
              }

              const weekday = dateObj.toLocaleDateString('fr-FR', {
                weekday: 'long',
              });
              const dateFormatted = dateObj.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
              });

              return (
                <div key={day} className="text-center font-semibold p-2 bg-muted rounded-md capitalize">
                  <div className="text-sm">{weekday}</div>
                  <div className="text-xs text-muted-foreground">{dateFormatted}</div>
                </div>
              );
            })}
          </div>

          {sessions.map((session) => (
            <div
              key={session}
              className="grid gap-2 mb-2"
              style={{ gridTemplateColumns: `120px repeat(${uniqueDays.length}, 1fr)` }}
            >
              <div className="flex flex-col justify-center items-center p-3 bg-muted rounded-md">
                <div className="font-bold text-lg">{session}</div>
                <div className="text-xs text-muted-foreground text-center">
                  {timeSlots[session as keyof typeof timeSlots]}
                </div>
              </div>

              {uniqueDays.map((day) => {
                const sessionInfo = getSessionData(day, session);
                const hasData = !!sessionInfo;
                const teacherCount = sessionInfo?.count || 0;

                return (
                  <button
                    key={`${day}-${session}`}
                    onClick={() => hasData && handleCellClick(day, session)}
                    className={`
                      p-3 rounded-md border-2 transition-all
                      ${getCellColor(teacherCount)}
                      ${hasData ? 'cursor-pointer hover:shadow-lg hover:scale-105' : 'cursor-not-allowed'}
                    `}
                    disabled={!hasData}
                  >
                    {hasData ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-4 w-4" />
                          <span className="font-semibold text-lg">{teacherCount}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {sessionInfo.examCount} examen{sessionInfo.examCount > 1 ? 's' : ''}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground text-sm">
                        Aucune surveillance
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t">
          <h4 className="font-semibold mb-3 text-sm">Légende des grades :</h4>
          <div className="flex flex-wrap gap-3">
            {Object.entries({
              PR: 'Professeur',
              MC: 'Maître de Conférences',
              MA: 'Maître Assistant',
              AC: 'Assistant Contractuel',
              AS: 'Assistant',
              PTC: 'PTC',
              PES: 'PES',
              V: 'Vacataire',
              EX: 'Externe',
            }).map(([code, label]) => (
              <div key={code} className="flex items-center gap-2 text-sm">
                <div className={`w-3 h-3 rounded-full ${getGradeColor(code)}`} />
                <span className="font-medium">{code}</span>
                <span className="text-muted-foreground">- {label}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {selectedSession?.session} -{' '}
              {selectedSession?.date &&
                new Date(selectedSession.date).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{selectedSession?.teachers.length} enseignant(s) affecté(s)</span>
            </div>

            <div className="space-y-2">
              {selectedSession?.teachers
                .sort((a, b) => {
                  if (a.isResponsible && !b.isResponsible) return -1;
                  if (!a.isResponsible && b.isResponsible) return 1;
                  return a.lastName.localeCompare(b.lastName);
                })
                .map((teacher, index) => (
                  <Card key={index} className="p-4 hover:shadow-md transition-shadow">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full ${getGradeColor(teacher.grade)}`} />
                          <div>
                            <div className="font-bold text-lg">
                              {teacher.lastName} {teacher.firstName}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              ID: {teacher.id}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline">{teacher.grade}</Badge>
                          {teacher.isResponsible && (
                            <Badge className="bg-green-600">Responsable</Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3 pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Email :</span>
                            <a
                              href={`mailto:${teacher.email}`}
                              className="font-mono text-sm text-blue-600 hover:underline"
                            >
                              {teacher.email || 'Non renseigné'}
                            </a>
                          </div>
                          {isHistoryView && (
                            <div className="flex items-center">
                              {isTeacherAbsent(teacher.id, selectedSession?.day || 0, selectedSession?.session || '') ? (
                                <Badge className="bg-red-600 text-white">Absent</Badge>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedSession && window.confirm(
                                      `Êtes-vous sûr de vouloir déclarer ${teacher.firstName} ${teacher.lastName} comme absent pour la séance ${selectedSession.session} du jour ${selectedSession.day} ?`
                                    )) {
                                      markTeacherAbsent(
                                        teacher.id, 
                                        selectedSession.day, 
                                        selectedSession.session,
                                        `${teacher.firstName} ${teacher.lastName}`
                                      );
                                    }
                                  }}
                                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                                >
                                  <UserX className="h-4 w-4 mr-2" />
                                  Déclarer absent
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Removed permuter and changer dialogs as they're now in TeacherScheduleView */}
    </>
  );
}