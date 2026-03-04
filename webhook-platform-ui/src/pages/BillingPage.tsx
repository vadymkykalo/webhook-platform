import { CreditCard, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

export default function BillingPage() {
  const { t } = useTranslation();

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-title tracking-tight">{t('billing.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('billing.subtitle')}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
            <CreditCard className="h-8 w-8 text-primary" />
          </div>
          <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
            <Sparkles className="h-3 w-3" />
            {t('billing.comingSoon')}
          </Badge>
          <h2 className="text-xl font-semibold mb-2">{t('billing.comingSoonTitle')}</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {t('billing.comingSoonDesc')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
