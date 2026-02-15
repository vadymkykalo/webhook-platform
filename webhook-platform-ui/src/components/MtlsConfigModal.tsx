import { useState } from 'react';
import { Loader2, ShieldCheck, Upload, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
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
import {
  Alert,
  AlertDescription,
} from './ui/alert';
import { endpointsApi, MtlsConfigRequest } from '../api/endpoints.api';
import type { EndpointResponse } from '../types/api.types';

interface MtlsConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  endpoint: EndpointResponse;
  onUpdate: (endpoint: EndpointResponse) => void;
}

export default function MtlsConfigModal({
  open,
  onOpenChange,
  projectId,
  endpoint,
  onUpdate,
}: MtlsConfigModalProps) {
  const [clientCert, setClientCert] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [caCert, setCaCert] = useState('');
  const [saving, setSaving] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setter(event.target?.result as string);
      };
      reader.readAsText(file);
    }
  };

  const handleSave = async () => {
    if (!clientCert.trim()) {
      toast.error('Client certificate is required');
      return;
    }
    if (!clientKey.trim()) {
      toast.error('Client private key is required');
      return;
    }

    try {
      setSaving(true);
      const data: MtlsConfigRequest = {
        clientCert: clientCert.trim(),
        clientKey: clientKey.trim(),
        caCert: caCert.trim() || undefined,
      };
      const updated = await endpointsApi.configureMtls(projectId, endpoint.id, data);
      onUpdate(updated);
      toast.success('mTLS configured successfully');
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to configure mTLS');
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    try {
      setDisabling(true);
      const updated = await endpointsApi.disableMtls(projectId, endpoint.id);
      onUpdate(updated);
      toast.success('mTLS disabled');
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to disable mTLS');
    } finally {
      setDisabling(false);
    }
  };

  const resetForm = () => {
    setClientCert('');
    setClientKey('');
    setCaCert('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            mTLS Configuration
          </DialogTitle>
          <DialogDescription>
            Configure mutual TLS (client certificate authentication) for secure webhook delivery.
          </DialogDescription>
        </DialogHeader>

        {endpoint.mtlsEnabled && (
          <Alert className="border-green-500/50 bg-green-500/10">
            <ShieldCheck className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              mTLS is currently enabled for this endpoint. Upload new certificates to update or disable below.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-4">
          <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              Keep your private key secure. It will be encrypted before storage but never share it.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="clientCert">Client Certificate (PEM) *</Label>
            <div className="flex gap-2">
              <Textarea
                id="clientCert"
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                value={clientCert}
                onChange={(e) => setClientCert(e.target.value)}
                className="font-mono text-xs min-h-[120px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".pem,.crt,.cer"
                onChange={(e) => handleFileUpload(e, setClientCert)}
                className="hidden"
                id="certUpload"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('certUpload')?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload .pem/.crt
              </Button>
              {clientCert && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setClientCert('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clientKey">Client Private Key (PEM) *</Label>
            <Textarea
              id="clientKey"
              placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              value={clientKey}
              onChange={(e) => setClientKey(e.target.value)}
              className="font-mono text-xs min-h-[120px]"
            />
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".pem,.key"
                onChange={(e) => handleFileUpload(e, setClientKey)}
                className="hidden"
                id="keyUpload"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('keyUpload')?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload .pem/.key
              </Button>
              {clientKey && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setClientKey('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="caCert">CA Certificate (PEM) - Optional</Label>
            <Textarea
              id="caCert"
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              value={caCert}
              onChange={(e) => setCaCert(e.target.value)}
              className="font-mono text-xs min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              Optional: Provide a custom CA certificate for server verification.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".pem,.crt,.cer"
                onChange={(e) => handleFileUpload(e, setCaCert)}
                className="hidden"
                id="caUpload"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('caUpload')?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload CA cert
              </Button>
              {caCert && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCaCert('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {endpoint.mtlsEnabled && (
            <Button
              variant="destructive"
              onClick={handleDisable}
              disabled={disabling || saving}
              className="w-full sm:w-auto"
            >
              {disabling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Disable mTLS
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || disabling}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {endpoint.mtlsEnabled ? 'Update Certificates' : 'Enable mTLS'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
