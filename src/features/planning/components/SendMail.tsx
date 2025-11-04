// src/features/planning/components/SendMail.tsx
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";


interface EmailSendingResult {
  success: boolean;
  sentCount?: number;
  failedCount?: number;
  summary?: {
    total: number;
    successful: number;
    failed: number;
    timestamp: string;
  };
  error?: string;
}

declare global {
  interface Window {
    electronAPI: {
      sendEmails: (teachers: any[]) => Promise<EmailSendingResult>;
      // Add other methods that exist on electronAPI
    };
  }
}

interface Session {
  date: string;
  day: number;
  session: string;
  startTime: string;
  endTime: string;
  duration: number;
}

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  sessions: Session[];
}

interface PlanningDataItem {
  Enseignant_ID: string;
  Prénom: string;
  Nom: string;
  Email: string;
  Date: string;
  Jour: number;
  Séance: string;
  Heure_Début: string;
  Heure_Fin: string;
  [key: string]: any; // For any additional properties
}

interface SendMailProps {
  planningData: PlanningDataItem[];
  disabled?: boolean;
}

export function SendMail({ planningData, disabled = false }: SendMailProps) {
  const [isSending, setIsSending] = useState(false);

  const calculateDuration = (start: string, end: string): number => {
    if (!start || !end) return 0;
    
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);
    
    const startDate = new Date(0, 0, 0, startHour, startMinute);
    const endDate = new Date(0, 0, 0, endHour, endMinute);
    
    return (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  };

  const processTeachers = (data: PlanningDataItem[]): Teacher[] => {
    const teacherMap = new Map<string, Teacher>();

    // Process all planning data to group by teacher and collect sessions
    data.forEach((item) => {
      if (item.Enseignant_ID) {
        const teacherId = item.Enseignant_ID.toString();
        const session = {
          date: item.Date || '',
          day: item.Jour || 0,
          session: item.Séance || '',
          startTime: item.Heure_Début || '',
          endTime: item.Heure_Fin || '',
          duration: calculateDuration(item.Heure_Début, item.Heure_Fin) || 0
        };

        if (!teacherMap.has(teacherId)) {
          teacherMap.set(teacherId, {
            id: teacherId,
            firstName: item.Prénom || '',
            lastName: item.Nom || '',
            email: item.Email || '',
            sessions: [session]
          });
        } else {
          const teacher = teacherMap.get(teacherId)!;
          teacher.sessions.push(session);
        }
      }
    });

    // Convert map to array and sort sessions by date and time
    return Array.from(teacherMap.values()).map(teacher => ({
      ...teacher,
      sessions: teacher.sessions.sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        if (a.startTime < b.startTime) return -1;
        if (a.startTime > b.startTime) return 1;
        return 0;
      })
    }));
  };

  const handleSendEmails = async () => {
    if (!planningData?.length) {
      toast.error('Aucune donnée disponible pour envoyer les emails');
      return;
    }

    setIsSending(true);
    
    try {
      // Process the planning data into teacher objects with sessions
      const teachers = processTeachers(planningData);
      
      // Filter out teachers without required data
      const validTeachers = teachers.filter(teacher => 
        teacher.id && 
        teacher.firstName && 
        teacher.lastName && 
        teacher.email && 
        teacher.sessions.length > 0
      );

      if (validTeachers.length === 0) {
        throw new Error('Aucun enseignant valide trouvé avec des sessions de planification');
      }

      console.log('Sending emails to teachers:', JSON.stringify(validTeachers, null, 2));

      // Call the sendEmails function through the Electron API
      const response = await window.electronAPI.sendEmails(validTeachers);
      
      console.log('Response from sendEmails:', response);
      
      if (response.success) {
        const successMessage = (response.failedCount && response.failedCount > 0)
          ? `Envoi partiellement réussi: ${response.sentCount || 0} email(s) envoyé(s), ${response.failedCount} échec(s)`
          : `Les emails ont été envoyés avec succès à ${response.sentCount || 0} enseignant(s)`;
        
        toast.success('Succès', {
          description: successMessage
        });
      } else {
        throw new Error(response.error || 'Erreur inconnue lors de l\'envoi des emails');
      }
    } catch (error: any) {
      console.error('Error in email sending process:', error);
      toast.error('Erreur', {
        description: error?.message || 'Une erreur est survenue lors de l\'envoi des emails'
      });
    } finally {
      setIsSending(false);
    }
};

  return (
    <Button
      onClick={handleSendEmails}
      disabled={disabled || isSending }
      className="gap-2 bg-blue-600 hover:bg-blue-700"
      
    >
      {isSending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Envoi en cours...
        </>
      ) : (
        <>
<Mail className="h-4 w-4" />
          Envoyer les convocations
        </>
      )}
    </Button>
  );
}