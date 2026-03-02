import { useState, useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

interface DangerConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Resource name user must type to confirm */
  confirmName: string;
  /** Optional impact summary lines */
  impact?: string[];
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  confirmLabel?: string;
}

export default function DangerConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmName,
  impact,
  onConfirm,
  loading = false,
  confirmLabel,
}: DangerConfirmDialogProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (!open) setInputValue('');
  }, [open]);

  const isMatch = inputValue === confirmName;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {impact && impact.length > 0 && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1">
            <p className="text-xs font-semibold text-destructive">{t('dangerConfirm.impact')}</p>
            {impact.map((line, i) => (
              <p key={i} className="text-xs text-muted-foreground">• {line}</p>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t('dangerConfirm.typeToConfirm', { name: confirmName })}
          </p>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmName}
            className="font-mono text-sm"
            autoFocus
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t('common.cancel')}</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!isMatch || loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel || t('common.delete')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
