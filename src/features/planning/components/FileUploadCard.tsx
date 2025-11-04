import { X, Check, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface FileUploadCardProps {
  title: string;
  description: string;
  file?: {
    name: string;
    path: string;
  };
  onSelect: () => void;
  onRemove: () => void;
  required?: boolean;
}

export function FileUploadCard({ 
  title, 
  description, 
  file, 
  onSelect, 
  onRemove,
  required = false 
}: FileUploadCardProps) {
  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div>
          <h4 className="font-medium flex items-center gap-2">
            {title}
            {required && <span className="text-destructive text-sm">*</span>}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        </div>

        {file ? (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
            <Check className="h-4 w-4 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-900 dark:text-green-100 truncate">
                {file.name}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={onSelect}
          >
            <Upload className="h-4 w-4 mr-2" />
            Sélectionner
          </Button>
        )}
      </div>
    </Card>
  );
}
