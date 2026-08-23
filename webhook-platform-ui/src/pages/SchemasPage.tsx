import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileJson2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useEventTypes } from '../api/queries';
import type { EventTypeCatalogResponse } from '../api/schemas.api';
import SchemaValidationPanel from './schemas/SchemaValidationPanel';
import SchemaListPanel from './schemas/SchemaListPanel';
import SchemaVersionHistory, { RecentSchemaChanges } from './schemas/SchemaVersionHistory';

/**
 * The schema registry, as three things rather than one 943-line file:
 *
 *   `SchemaListPanel`        — which event types have a contract
 *   `SchemaVersionHistory`   — what that contract has been, version by version
 *   `SchemaValidationPanel`  — what happens to an event that breaks it
 *
 * This file only decides which event type is selected and where the three sit.
 */
export default function SchemasPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [selected, setSelected] = useState<EventTypeCatalogResponse | null>(null);
  const { data: eventTypes = [] } = useEventTypes(projectId);

  if (!projectId) return null;

  return (
    <div className="p-4 lg:p-6">
      <PageHeader
        eyebrow={t('schemas.typeCount', { count: eventTypes.length })}
        title={t('schemas.title')}
        description={t('schemas.subtitle')}
      />

      <div className="space-y-5">
        <SchemaValidationPanel projectId={projectId} />

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <SchemaListPanel projectId={projectId} selected={selected} onSelect={setSelected} />

          <div className="min-w-0 space-y-4">
            {selected ? (
              <SchemaVersionHistory
                projectId={projectId}
                eventType={selected}
                onDeleted={() => setSelected(null)}
              />
            ) : (
              <>
                <RecentSchemaChanges projectId={projectId} />
                <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-rail px-6 text-center">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-rail bg-card">
                    <FileJson2 className="h-5 w-5 text-muted-foreground" aria-hidden />
                  </div>
                  <p className="text-[15px] font-medium">{t('schemas.selectEventType')}</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('schemas.selectEventTypeHint')}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
