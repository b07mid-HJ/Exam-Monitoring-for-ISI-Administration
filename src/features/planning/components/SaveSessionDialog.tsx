import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface SaveSessionDialogProps {
  planningData: any[];
  wishesFile?: string;
  disabled?: boolean;
}

export function SaveSessionDialog({ planningData, wishesFile, disabled }: SaveSessionDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [sessionType, setSessionType] = useState<string>('');
  const [semester, setSemester] = useState<string>('');

  const handleSave = async () => {


    if (!sessionType) {
      toast.error('Type de session requis', {
        description: 'Veuillez sélectionner le type de session'
      });
      return;
    }

    if (!semester) {
      toast.error('Semestre requis', {
        description: 'Veuillez sélectionner le semestre'
      });
      return;
    }

    setSaving(true);

    try {
      const result = await (window as any).electronAPI.savePlanningSession({
        name: name.trim(),
        sessionType,
        semester,
        planningData,
        wishesFile
      });
      console.log(result);
      if (result.success) {
        toast.success('Session sauvegardée !', {
          description: result.message
        });
        setOpen(false);
        setName('');
        setSessionType('');
        setSemester('');
      } else {
        toast.error('Erreur lors de la sauvegarde', {
          description: result.error
        });
      }
    } catch (error) {
      toast.error('Erreur', {
        description: error instanceof Error ? error.message : 'Erreur inconnue'
      });
    } finally {
      setSaving(false);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} className="gap-2">
          <Save className="h-4 w-4" />
          Sauvegarder la Session
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Sauvegarder le Planning</DialogTitle>
          <DialogDescription>
            Donnez un nom à cette session pour la retrouver facilement dans l'historique.
            L'année {currentYear} sera ajoutée automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">

          <div className="grid gap-2">
            <Label htmlFor="sessionType">
              Type de session <span className="text-destructive">*</span>
            </Label>
            <Select value={sessionType} onValueChange={setSessionType}>
              <SelectTrigger id="sessionType">
                <SelectValue placeholder="Sélectionner le type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="principale">Principale</SelectItem>
                <SelectItem value="principale">Partiel</SelectItem>
                <SelectItem value="rattrapage">Rattrapage</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="semester">
              Semestre <span className="text-destructive">*</span>
            </Label>
            <Select value={semester} onValueChange={setSemester}>
              <SelectTrigger id="semester">
                <SelectValue placeholder="Sélectionner le semestre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="S1">Semestre 1 (S1)</SelectItem>
                <SelectItem value="S2">Semestre 2 (S2)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="p-3 bg-muted rounded-md">
            <p className="text-sm text-muted-foreground">
              <strong>Aperçu du nom final :</strong><br />
              Session_{sessionType || '[Type]'}_{semester || '[Semestre]'}_{currentYear}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}