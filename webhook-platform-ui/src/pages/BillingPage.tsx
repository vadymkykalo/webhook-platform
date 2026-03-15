import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CreditCard, Zap, BarChart3, Users, FolderKanban, Globe,
  Clock, Check, X, Loader2, ExternalLink, Shield
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { billingApi, PlanResponse } from '../api/billing.api';
import { showSuccess, showApiError } from '../lib/toast';

function UsageBar({ label, current, limit, icon: Icon }: {
  label: string; current: number; limit: number; icon: React.ElementType;
}) {
  const { t } = useTranslation();
  const unlimited = limit <= 0;
  const pct = unlimited ? 0 : Math.min(100, (current / limit) * 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </span>
        <span className="text-muted-foreground">
          {current.toLocaleString()} {unlimited ? '' : t('billing.of', { limit: limit.toLocaleString() })}
          {unlimited && <span className="ml-1 text-xs">({t('billing.unlimited')})</span>}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function FeatureRow({ name, included }: { name: string; included: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span>{name}</span>
      {included
        ? <Check className="h-4 w-4 text-green-500" />
        : <X className="h-4 w-4 text-muted-foreground/40" />
      }
    </div>
  );
}

function formatPrice(cents: number) {
  if (cents <= 0) return null;
  return `$${(cents / 100).toFixed(0)}`;
}

export default function BillingPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [billingEmail, setBillingEmail] = useState('');
  const [emailDirty, setEmailDirty] = useState(false);
  const [annual, setAnnual] = useState(false);

  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: ['billing', 'organization'],
    queryFn: billingApi.getOrganizationBilling,
  });

  useEffect(() => {
    if (billing && !emailDirty) setBillingEmail(billing.billingEmail || '');
  }, [billing, emailDirty]);

  const { data: usage, isLoading: usageLoading } = useQuery({
    queryKey: ['billing', 'usage'],
    queryFn: billingApi.getUsage,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: billingApi.listPlans,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['billing', 'invoices'],
    queryFn: billingApi.listInvoices,
  });

  const changePlanMutation = useMutation({
    mutationFn: (planName: string) => billingApi.changePlan({ planName }),
    onSuccess: () => {
      showSuccess(t('billing.changePlanSuccess'));
      queryClient.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (err) => showApiError(err, t('billing.changePlanFailed')),
  });

  const checkoutMutation = useMutation({
    mutationFn: ({ planName, interval }: { planName: string; interval: string }) =>
      billingApi.createCheckout({
        planName,
        billingInterval: interval,
        successUrl: `${window.location.origin}/admin/billing?checkout=success`,
        cancelUrl: `${window.location.origin}/admin/billing?checkout=cancel`,
      }),
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err) => showApiError(err, t('billing.checkoutFailed')),
  });

  const updateEmailMutation = useMutation({
    mutationFn: () => billingApi.updateBillingInfo({ billingEmail }),
    onSuccess: () => {
      showSuccess(t('billing.billingEmailUpdated'));
      setEmailDirty(false);
      queryClient.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (err) => showApiError(err, t('billing.billingEmailFailed')),
  });

  if (billingLoading || usageLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const plan = billing?.plan;
  const features = plan?.features || {};
  const isSelfHosted = plan?.name === 'self_hosted';

  const featureList = [
    { key: 'workflows', label: t('billing.featureWorkflows') },
    { key: 'rules', label: t('billing.featureRules') },
    { key: 'replay', label: t('billing.featureReplay') },
    { key: 'mTLS', label: t('billing.featureMtls') },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-title tracking-tight">{t('billing.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('billing.subtitle')}</p>
      </div>

      {/* Self-hosted banner */}
      {isSelfHosted && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-green-700 dark:text-green-400">{plan?.displayName}</p>
              <p className="text-sm text-muted-foreground">{t('billing.selfHosted')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current plan + features */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {t('billing.currentPlan')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold">{plan?.displayName}</span>
              {!isSelfHosted && plan && plan.priceMonthlyCents > 0 && (
                <span className="text-muted-foreground">
                  {formatPrice(plan.priceMonthlyCents)}{t('billing.perMonth')}
                </span>
              )}
              {!isSelfHosted && plan && plan.priceMonthlyCents === 0 && (
                <Badge variant="secondary">{t('billing.free')}</Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" />
                {plan && plan.rateLimitPerSecond > 0 && !isSelfHosted
                  ? t('billing.perSecond', { count: plan.rateLimitPerSecond })
                  : t('billing.unlimited')
                }
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {plan && plan.maxRetentionDays > 0 && !isSelfHosted
                  ? t('billing.days', { count: plan.maxRetentionDays })
                  : t('billing.unlimited')
                }
              </span>
            </div>
            {!isSelfHosted && billing?.billingStatus && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('billing.billingStatus')}:</span>
                <Badge variant={billing.billingStatus === 'ACTIVE' ? 'default' : 'destructive'}>
                  {billing.billingStatus}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {t('billing.planFeatures')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {featureList.map((f) => (
                <FeatureRow key={f.key} name={f.label} included={isSelfHosted || features[f.key] === true} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage — show counts but with unlimited labels for self-hosted */}
      {usage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('billing.usage')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t('billing.usageSubtitle')}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <UsageBar label={t('billing.events')} current={usage.events.current} limit={usage.events.limit} icon={Zap} />
            <UsageBar label={t('billing.projects')} current={usage.projects.current} limit={usage.projects.limit} icon={FolderKanban} />
            <UsageBar label={t('billing.endpoints')} current={usage.endpoints.current} limit={usage.endpoints.limit} icon={Globe} />
            <UsageBar label={t('billing.members')} current={usage.members.current} limit={usage.members.limit} icon={Users} />
          </CardContent>
        </Card>
      )}

      {/* Available plans — only in SaaS mode */}
      {!isSelfHosted && plans.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t('billing.availablePlans')}</CardTitle>
              <div className="inline-flex items-center gap-2 p-1 rounded-lg border bg-muted/50">
                <button
                  onClick={() => setAnnual(false)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${!annual ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t('billing.monthly')}
                </button>
                <button
                  onClick={() => setAnnual(true)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${annual ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t('billing.yearly')}
                  <span className="px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[9px] font-bold">
                    {t('billing.yearlySave')}
                  </span>
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((p: PlanResponse) => {
                const isCurrent = plan?.name === p.name;
                const price = annual ? p.priceYearlyCents : p.priceMonthlyCents;
                const isCustom = price < 0;
                const isPaid = price > 0;
                const interval = annual ? 'YEARLY' : 'MONTHLY';
                const suffix = annual ? t('billing.perYear') : t('billing.perMonth');

                const handleUpgrade = () => {
                  if (isPaid) {
                    checkoutMutation.mutate({ planName: p.name, interval });
                  } else {
                    changePlanMutation.mutate(p.name);
                  }
                };

                return (
                  <div key={p.id}
                    className={`rounded-lg border p-4 space-y-3 transition-all ${isCurrent ? 'border-primary bg-primary/5' : 'hover:border-primary/30'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{p.displayName}</span>
                      {isCurrent && <Badge variant="default" className="text-[10px]">{t('billing.currentBadge')}</Badge>}
                    </div>
                    <div className="text-2xl font-bold">
                      {isCustom
                        ? <span className="text-lg">{t('billing.custom')}</span>
                        : price === 0
                          ? t('billing.free')
                          : <>{formatPrice(price)}<span className="text-sm font-normal text-muted-foreground">{suffix}</span></>
                      }
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>{p.maxEventsPerMonth > 0 ? (p.maxEventsPerMonth >= 1000000 ? `${(p.maxEventsPerMonth / 1000000).toFixed(0)}M` : `${(p.maxEventsPerMonth / 1000).toFixed(0)}K`) : t('billing.unlimited')} {t('billing.events').toLowerCase()}</li>
                      <li>{p.maxProjects > 0 ? p.maxProjects : t('billing.unlimited')} {t('billing.projects').toLowerCase()}</li>
                      <li>{p.maxEndpointsPerProject > 0 ? p.maxEndpointsPerProject : t('billing.unlimited')} {t('billing.endpoints').toLowerCase()}</li>
                      <li>{p.rateLimitPerSecond > 0 ? t('billing.perSecond', { count: p.rateLimitPerSecond }) : t('billing.unlimited')}</li>
                    </ul>
                    {!isCurrent && !isCustom && (
                      <Button size="sm" variant={isPaid ? 'default' : 'outline'} className="w-full"
                        disabled={changePlanMutation.isPending || checkoutMutation.isPending}
                        onClick={handleUpgrade}>
                        {(changePlanMutation.isPending || checkoutMutation.isPending)
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : isPaid ? t('billing.upgrade') : t('billing.switchPlan')}
                      </Button>
                    )}
                    {!isCurrent && isCustom && (
                      <a href="mailto:vadymkykalo@gmail.com">
                        <Button size="sm" variant="outline" className="w-full">
                          {t('billing.contactSales')}
                        </Button>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing info — only in SaaS mode */}
      {!isSelfHosted && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('billing.billingInfo')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 max-w-md">
              <div className="flex-1 space-y-1.5">
                <label className="text-sm font-medium">{t('billing.billingEmail')}</label>
                <input
                  type="email"
                  value={billingEmail}
                  onChange={(e) => { setBillingEmail(e.target.value); setEmailDirty(true); }}
                  placeholder={t('billing.billingEmailPlaceholder')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <Button size="sm" disabled={!emailDirty || updateEmailMutation.isPending}
                onClick={() => updateEmailMutation.mutate()}>
                {updateEmailMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t('billing.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices — only in SaaS mode */}
      {!isSelfHosted && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('billing.invoices')}</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{t('billing.invoicesEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">{t('billing.invoiceDate')}</th>
                      <th className="pb-2 font-medium">{t('billing.invoicePlan')}</th>
                      <th className="pb-2 font-medium">{t('billing.invoiceAmount')}</th>
                      <th className="pb-2 font-medium">{t('billing.invoiceStatus')}</th>
                      <th className="pb-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b last:border-0">
                        <td className="py-2">{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : '—'}</td>
                        <td className="py-2">{inv.planName}</td>
                        <td className="py-2">${(inv.amountCents / 100).toFixed(2)} {inv.currency?.toUpperCase()}</td>
                        <td className="py-2">
                          <Badge variant={inv.status === 'paid' ? 'default' : 'secondary'}>{inv.status}</Badge>
                        </td>
                        <td className="py-2">
                          {inv.invoiceUrl && (
                            <a href={inv.invoiceUrl} target="_blank" rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1">
                              {t('billing.invoiceView')} <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
