import { DiffEntry, DiffType } from '../api/eventDiff.api';
import { useTranslation } from 'react-i18next';

interface EventDiffViewProps {
  leftPayload: string;
  rightPayload: string;
  diffs: DiffEntry[];
  leftLabel?: string;
  rightLabel?: string;
}

const diffColors: Record<DiffType, { bg: string; text: string; border: string }> = {
  ADDED: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
  REMOVED: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
  CHANGED: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/30' },
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function formatPayload(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

export default function EventDiffView({ leftPayload, rightPayload, diffs, leftLabel, rightLabel }: EventDiffViewProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {diffs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('eventDiff.changes', { count: diffs.length })}
          </p>
          <div className="space-y-1">
            {diffs.map((diff, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 px-3 py-2 rounded-lg border text-xs ${diffColors[diff.type].bg} ${diffColors[diff.type].border}`}
              >
                <span className={`font-bold uppercase text-[10px] min-w-[60px] ${diffColors[diff.type].text}`}>
                  {diff.type}
                </span>
                <span className="font-mono text-foreground">{diff.path}</span>
                <span className="ml-auto flex gap-2 text-muted-foreground font-mono">
                  {diff.type === 'CHANGED' && (
                    <>
                      <span className="text-destructive line-through">{formatValue(diff.leftValue)}</span>
                      <span>→</span>
                      <span className="text-success">{formatValue(diff.rightValue)}</span>
                    </>
                  )}
                  {diff.type === 'ADDED' && (
                    <span className="text-success">{formatValue(diff.rightValue)}</span>
                  )}
                  {diff.type === 'REMOVED' && (
                    <span className="text-destructive line-through">{formatValue(diff.leftValue)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {diffs.length === 0 && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          {t('eventDiff.noDiffs')}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {leftLabel || t('eventDiff.left')}
          </p>
          <pre className="bg-muted/50 border rounded-lg p-3 text-[11px] font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
            {formatPayload(leftPayload)}
          </pre>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {rightLabel || t('eventDiff.right')}
          </p>
          <pre className="bg-muted/50 border rounded-lg p-3 text-[11px] font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
            {formatPayload(rightPayload)}
          </pre>
        </div>
      </div>
    </div>
  );
}
