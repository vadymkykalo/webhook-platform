import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { eventsApi } from '../api/events.api';
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
  const [eventType, setEventType] = useState('');
  const [payload, setPayload] = useState('{\n  "user_id": "123",\n  "action": "created"\n}');
  const [sending, setSending] = useState(false);
  const [jsonError, setJsonError] = useState('');

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
      toast.error('Please fix JSON errors before submitting');
      return;
    }

    setSending(true);
    try {
      const data = JSON.parse(payload);
      
      const response = await eventsApi.sendTestEvent(projectId, {
        type: eventType,
        data,
      });

      toast.success(
        `Event sent successfully! Created ${response.deliveriesCreated || 0} deliveries.`,
        { duration: 5000 }
      );
      
      setEventType('');
      setPayload('{\n  "user_id": "123",\n  "action": "created"\n}');
      onClose();
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send event');
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

            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm text-blue-900">
                <strong>Note:</strong> This event will create deliveries for all active subscriptions 
                matching this event type. Check the Deliveries page to see processing results.
              </p>
            </div>
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
