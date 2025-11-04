import { useState, useEffect } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResultsTable } from '@/features/planning/components/ResultsTable';
import { CalendarView } from '@/features/planning/components/CalendarView';
import { ViewToggle } from '@/features/planning/components/ViewToggle';
import { toast } from 'sonner';
import { TeacherSelector } from '@/features/planning/components/TeacherSelector';
import { TeacherScheduleView } from '@/features/planning/components/TeacherScheduleView';
import { ExportCalendarButton } from '@/features/planning/components/ExportCalendarButton';

interface SessionDetails {
  session: {
    id: number;
    name: string;
    session_type: string;
    semester: string;
    year: number;
    created_at: string;
    stats_total_assignments: number;
    stats_teachers_count: number;
    stats_exams_count: number;
  };
  assignments: any[];
}

export default function SessionDetailPage() {
  const params = useParams({ from: '/_authenticated/history/$sessionId' });
  const navigate = useNavigate();
  const [details, setDetails] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'calendar' | 'table' | 'teacher'>('calendar');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | undefined>();

  useEffect(() => {
    loadDetails();
  }, [params.sessionId]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const result = await (window as any).electronAPI.getSessionDetails(
        parseInt(params.sessionId)
      );

      if (result.success) {
        const transformedAssignments = result.assignments.map((a: any) => ({
          Date: a.date,
          Jour: a.day_number,
          Séance: a.session,
          Heure_Début: a.time_start,
          Heure_Fin: a.time_end,
          Nombre_Examens: a.exam_count,
          Enseignant_ID: a.teacher_id,
          Grade: a.grade,
          Responsable: a.is_responsible,
          Nom:  a.teacher_last_name ,
          Prénom: a.teacher_first_name,
          Email: a.teacher_email
        }));

        setDetails({
          session: result.session,
          assignments: transformedAssignments,
        });
      } else {
        toast.error('Session introuvable');
        navigate({ to: '/history' });
      }
    } catch (error) {
      toast.error('Erreur lors du chargement des détails');
      navigate({ to: '/history' });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!details) return;

    try {
      const result = await (window as any).electronAPI.exportSavedSession(details.session.id);
      if (result.success) {
        toast.success('Fichier exporté avec succès');
      } else {
        toast.error("Erreur lors de l'export");
      }
    } catch (error) {
      toast.error("Erreur lors de l'export");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement des détails...</p>
        </div>
      </div>
    );
  }

  if (!details) {
    return null;
  }

  const getSessionTypeColor = (type: string) =>
    type === 'principale'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';

  const getSemesterColor = (semester: string) =>
    semester === 'S1'
      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/history' })}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{details.session.name}</h1>
            <div className="flex gap-2 mt-2">
              <Badge className={getSessionTypeColor(details.session.session_type)}>
                {details.session.session_type === 'principale' ? 'Principale' : 'Rattrapage'}
              </Badge>
              <Badge className={getSemesterColor(details.session.semester)}>
                {details.session.semester}
              </Badge>
              <Badge variant="outline">{details.session.year}</Badge>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
          {viewMode === 'calendar' && <ExportCalendarButton />}
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Exporter Excel
          </Button>
        </div>
      </div> {/* ✅ fermeture ajoutée ici */}

      {/* Stats */}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">Créé le</p>
            <p className="text-lg font-semibold">
              {new Date(details.session.created_at).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Affectations</p>
            <p className="text-lg font-semibold">{details.session.stats_total_assignments}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Enseignants</p>
            <p className="text-lg font-semibold">{details.session.stats_teachers_count}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Examens</p>
            <p className="text-lg font-semibold">{details.session.stats_exams_count}</p>
          </div>
        </div>
      </Card>

      {/* View Section */}
      {viewMode === 'teacher' ? (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1">
            <TeacherSelector
              data={details.assignments}
              onTeacherSelect={setSelectedTeacherId}
              selectedTeacherId={selectedTeacherId}
            />
          </div>
          <div className="lg:col-span-2">
            {selectedTeacherId ? (
              <TeacherScheduleView teacherId={selectedTeacherId} data={details.assignments} isHistoryView={true} />
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
        <CalendarView data={details.assignments} isHistoryView={true} />
      ) : (
        <ResultsTable data={details.assignments} />
      )}
    </div>
  );
}
