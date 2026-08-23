import { useTranslation } from 'react-i18next';
import { CodeBlock, DefinitionList, DocsArticle, DocsTitle, Note, Section, SubSection } from '../primitives';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { cliSamples } from '../samples';

export default function Cli() {
  const { t } = useTranslation();

  const commands: Array<[string, string]> = [
    ['hookflow login', t('docsPage.cli.cmdLogin')],
    ['hookflow login --server <url>', t('docsPage.cli.cmdLoginServer')],
    ['hookflow status', t('docsPage.cli.cmdStatus')],
    ['hookflow listen <port>', t('docsPage.cli.cmdListen')],
    ['hookflow listen <port> --project <id>', t('docsPage.cli.cmdListenProject')],
    ['hookflow tunnels list', t('docsPage.cli.cmdTunnelsList')],
    ['hookflow tunnels status', t('docsPage.cli.cmdTunnelsStatus')],
    ['hookflow tunnels close <id>', t('docsPage.cli.cmdTunnelsClose')],
    ['hookflow events <projectId>', t('docsPage.cli.cmdEvents')],
    ['hookflow events <projectId> --follow', t('docsPage.cli.cmdEventsFollow')],
    ['hookflow replay <projectId>', t('docsPage.cli.cmdReplay')],
    ['hookflow replay <projectId> --dry-run', t('docsPage.cli.cmdReplayDry')],
    ['hookflow config show', t('docsPage.cli.cmdConfigShow')],
    ['hookflow config set <key> <value>', t('docsPage.cli.cmdConfigSet')],
    ['hookflow config clear', t('docsPage.cli.cmdConfigClear')],
    ['hookflow config profile list', t('docsPage.cli.cmdProfileList')],
    ['hookflow config profile create <name> --url <url>', t('docsPage.cli.cmdProfileCreate')],
    ['hookflow config profile use <name>', t('docsPage.cli.cmdProfileUse')],
    ['hookflow config profile delete <name>', t('docsPage.cli.cmdProfileDelete')],
  ];

  return (
    <DocsArticle>
      <DocsTitle title={t('docsPage.cli.title')} lede={t('docsPage.cli.subtitle')} />

      <Section title={t('docsPage.cli.installTitle')}>
        <SubSection title={t('docsPage.cli.installOpt1Title')}>
          <p className="text-sm text-muted-foreground">{t('docsPage.cli.installOpt1Desc')}</p>
          <CodeBlock code={cliSamples.install} label="bash" />
        </SubSection>
        <SubSection title={t('docsPage.cli.installOpt3Title')}>
          <p className="text-sm text-muted-foreground">{t('docsPage.cli.installOpt3Desc')}</p>
          <CodeBlock code={cliSamples.docker} label="bash" />
        </SubSection>
        <Note label={t('docsPage.cli.requirementsLabel')}>{t('docsPage.cli.installReq')}</Note>
      </Section>

      <Section title={t('docsPage.cli.authTitle')} description={t('docsPage.cli.authSubtitle')}>
        <CodeBlock code={cliSamples.login} label="bash" />
        <Note label={t('docsPage.cli.tokensLabel')}>{t('docsPage.cli.authTokens')}</Note>
      </Section>

      <Section title={t('docsPage.cli.tunnelsTitle')} description={t('docsPage.cli.tunnelsSubtitle')}>
        <CodeBlock code={cliSamples.listen} label="bash" />
        <DefinitionList
          items={[
            { term: t('docsPage.cli.tunnelsAutoReconnect'), definition: t('docsPage.cli.tunnelsAutoReconnectDesc') },
            { term: t('docsPage.cli.tunnelsLogging'), definition: t('docsPage.cli.tunnelsLoggingDesc') },
            { term: t('docsPage.cli.tunnelsPlanLimits'), definition: t('docsPage.cli.tunnelsPlanLimitsDesc') },
          ]}
        />
      </Section>

      <Section title={t('docsPage.cli.configTitle')} description={t('docsPage.cli.configProfilesDesc')}>
        <CodeBlock code={cliSamples.profiles} label="bash" />
        <p className="max-w-2xl text-sm text-muted-foreground">{t('docsPage.cli.configFileDetails')}</p>
      </Section>

      <Section title={t('docsPage.cli.cmdRefTitle')}>
        <div className="overflow-x-auto rounded-lg border border-rail">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('docsPage.cli.cmdRefCommand')}</TableHead>
                <TableHead>{t('docsPage.cli.cmdRefDescription')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commands.map(([command, description]) => (
                <TableRow key={command}>
                  <TableCell className="whitespace-nowrap font-mono text-[13px]">{command}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title={t('docsPage.cli.troubleshootTitle')}>
        <dl className="divide-y divide-rail border-y border-rail">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="py-3">
              <dt className="text-sm font-medium">{t(`docsPage.cli.troubleshoot${n}q`)}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t(`docsPage.cli.troubleshoot${n}a`)}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </DocsArticle>
  );
}
