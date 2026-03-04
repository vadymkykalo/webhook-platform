import { useState, useEffect, useMemo } from 'react';
import { Loader2, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showApiError, showSuccess, showWarning } from '../lib/toast';
import { eventsApi } from '../api/events.api';
import { subscriptionsApi } from '../api/subscriptions.api';
import type { SubscriptionResponse } from '../api/subscriptions.api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

function eventTypeMatchesSubscription(eventType: string, pattern: string): boolean {
  if (pattern === '**') return true;
  const eventParts = eventType.split('.');
  const patternParts = pattern.split('.');
  let ei = 0, pi = 0;
  while (ei < eventParts.length && pi < patternParts.length) {
    if (patternParts[pi] === '**') return true;
    if (patternParts[pi] === '*' || patternParts[pi] === eventParts[ei]) {
      ei++; pi++;
    } else {
      return false;
    }
  }
  return ei === eventParts.length && pi === patternParts.length;
}

interface SendTestEventModalProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SendTestEventModal({
  projectId,
  open,
  onClose,
  onSuccess,
}: SendTestEventModalProps) {
  const { t } = useTranslation();
  const [eventType, setEventType] = useState('');
  const [payload, setPayload] = useState('{\n  "user_id": "123",\n  "action": "created"\n}');
  const [sending, setSending] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const [subscriptions, setSubscriptions] = useState<SubscriptionResponse[]>([]);

  useEffect(() => {
    if (open && projectId) {
      subscriptionsApi.list(projectId).then(setSubscriptions).catch(() => {});
    }
  }, [open, projectId]);

  const matchingCount = useMemo(() => {
    if (!eventType.trim()) return -1;
    return subscriptions.filter(s => s.enabled && eventTypeMatchesSubscription(eventType.trim(), s.eventType)).length;
  }, [eventType, subscriptions]);

  const validateJson = (text: string): boolean => {
    try {
      JSON.parse(text);
      setJsonError('');
      return true;
    } catch (e) {
      setJsonError('Invalid JSON format');
      return false;
    }
  };

  const handlePayloadChange = (value: string) => {
    setPayload(value);
    if (value.trim()) {
      validateJson(value);
    } else {
      setJsonError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateJson(payload)) {
      showWarning('Please fix JSON errors before submitting');
      return;
    }

    setSending(true);
    try {
      const data = JSON.parse(payload);
      
      const response = await eventsApi.sendTestEvent(projectId, {
        type: eventType,
        data,
      });

      const count = response.deliveriesCreated || 0;
      if (count === 0) {
        showWarning(t('events.toast.noSubscriptionMatch', { eventType }), { duration: 8000 });
      } else {
        showSuccess(
          `Event sent successfully! Created ${count} deliveries.`,
          { duration: 5000 }
        );
      }
      
      setEventType('');
      setPayload('{\n  "user_id": "123",\n  "action": "created"\n}');
      onClose();
      onSuccess?.();
    } catch (err: any) {
      showApiError(err, 'toast.errors.server');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Test Event</DialogTitle>
          <DialogDescription>
            Send a webhook event to trigger deliveries to subscribed endpoints
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="eventType">Event Type</Label>
              <Input
                id="eventType"
                placeholder="user.created"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                required
                disabled={sending}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Use dot notation (e.g., user.created, order.updated)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payload">Event Payload (JSON)</Label>
              <Textarea
                id="payload"
                value={payload}
                onChange={(e) => handlePayloadChange(e.target.value)}
                disabled={sending}
                rows={12}
                className="font-mono text-sm"
                placeholder='{\n  "key": "value"\n}'
              />
              {jsonError && (
                <p className="text-sm text-destructive">{jsonError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Must be valid JSON. This data will be sent to webhook endpoints.
              </p>
            </div>

            {eventType.trim() && matchingCount === 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-3">
                <p className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{t('events.sendModal.noMatchWarning')}</span>
                </p>
              </div>
            )}

            {eventType.trim() && matchingCount > 0 && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-md p-3">
                <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{t('events.sendModal.matchInfo', { count: matchingCount })}</span>
                </p>
              </div>
            )}

            {!eventType.trim() && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  <strong>Note:</strong> This event will create deliveries for all active subscriptions 
                  matching this event type. Check the Deliveries page to see processing results.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={sending || !!jsonError}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {sending ? 'Sending...' : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Event
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
