import { useState, useEffect } from 'react';
import { Calendar, Download, Trash2, Eye, Clock, Users, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from '@tanstack/react-router'; // ✅ Ajoutez cet import

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
import { toast } from 'sonner';

interface Session {
  id: number;
  name: string;
  session_type: string;
  semester: string;
  year: number;
  created_at: string;
  stats_total_assignments: number;
  stats_teachers_count: number;
  stats_exams_count: number;
}

export default function HistoryPage() {
  const navigate = useNavigate(); // ✅ Ajoutez cette ligne
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<number | null>(null);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const result = await (window as any).electronAPI.getAllSessions();
      if (result.success) {
        setSessions(result.sessions);
      }
    } catch (error) {
      toast.error('Erreur lors du chargement de l\'historique');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleView = async (sessionId: number) => {
    try {
      const result = await (window as any).electronAPI.getSessionDetails(sessionId);
      if (result.success) {
        // ✅ CORRECTION ICI - Utilisez navigate au lieu de window.location.href
        navigate({
          to: '/history/$sessionId',
          params: { sessionId: sessionId.toString() }
        });
      }
    } catch (error) {
      toast.error('Erreur lors de la récupération des détails');
    }
  };

  const handleExport = async (sessionId: number) => {
    try {
      const result = await (window as any).electronAPI.exportSavedSession(sessionId);
      if (result.success) {
        toast.success('Fichier exporté avec succès', {
          description: `Sauvegardé dans: ${result.path}`
        });
      } else {
        toast.error('Erreur lors de l\'export');
      }
    } catch (error) {
      toast.error('Erreur lors de l\'export');
    }
  };

  const handleDelete = async () => {
    if (!sessionToDelete) return;

    try {
      const result = await (window as any).electronAPI.deleteSession(sessionToDelete);
      if (result.success) {
        toast.success('Session supprimée');
        loadSessions();
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
    }
  };

  const getSessionTypeColor = (type: string) => {
    switch (type) {
      case 'principale':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'rattrapage':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'partiel':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  };
  const getSemesterColor = (semester: string) => {
    return semester === 'S1'
      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement de l'historique...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Historique des Sessions</h1>
        <p className="text-muted-foreground mt-2">
          Consultez et gérez vos plannings de surveillance sauvegardés
        </p>
      </div>

      {/* Liste des sessions */}
      {sessions.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Aucune session sauvegardée</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Générez un planning et sauvegardez-le pour le voir apparaître ici
            </p>
            <Button onClick={() => navigate({ to: '/planning' })}>
              Créer un Planning
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <Card key={session.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="space-y-4">
                {/* En-tête */}
                <div>
                  <h3 className="font-semibold text-lg mb-2">{session.name}</h3>
                  <div className="flex gap-2 flex-wrap">
                    <Badge className={getSessionTypeColor(session.session_type)}>
                      {session.session_type === 'principale'
                        ? 'Principale'
                        : session.session_type === 'rattrapage'
                          ? 'Rattrapage'
                          : session.session_type === 'partiel'
                            ? 'Partiel'
                            : 'Autre'}
                    </Badge>
                    <Badge className={getSemesterColor(session.semester)}>
                      {session.semester}
                    </Badge>
                    <Badge variant="outline">{session.year}</Badge>
                  </div>
                </div>

                {/* Statistiques */}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="text-center p-2 bg-muted rounded">
                    <FileText className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <div className="font-semibold">{session.stats_total_assignments}</div>
                    <div className="text-xs text-muted-foreground">Affectations</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <div className="font-semibold">{session.stats_teachers_count}</div>
                    <div className="text-xs text-muted-foreground">Enseignants</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <Calendar className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                    <div className="font-semibold">{session.stats_exams_count}</div>
                    <div className="text-xs text-muted-foreground">Examens</div>
                  </div>
                </div>

                {/* Date de création */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    {new Date(session.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleView(session.id)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Voir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExport(session.id)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => {
                      setSessionToDelete(session.id);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La session et toutes ses données seront définitivement supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}