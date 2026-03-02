import { type ReactElement, cloneElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from './ui/tooltip';
import type { Role } from '../auth/usePermissions';

interface PermissionGateProps {
  /** The permission boolean from usePermissions() */
  allowed: boolean;
  /** Minimum role required — shown in the tooltip */
  requiredRole?: Role;
  /** Override tooltip text */
  tooltip?: string;
  /** Fallback: 'disable' shows disabled + tooltip, 'hide' hides entirely */
  fallback?: 'disable' | 'hide';
  children: ReactElement;
}

export default function PermissionGate({
  allowed,
  requiredRole = 'DEVELOPER',
  tooltip,
  fallback = 'disable',
  children,
}: PermissionGateProps) {
  const { t } = useTranslation();

  if (allowed) return children;

  if (fallback === 'hide') return null;

  const roleLabel = requiredRole === 'OWNER'
    ? t('permissions.ownerRole')
    : t('permissions.developerRole');

  const tooltipText = tooltip || t('permissions.requiredRole', { role: roleLabel });

  return (
    <Tooltip content={tooltipText} side="top">
      <span className="inline-flex">
        {cloneElement(children, {
          disabled: true,
          'aria-disabled': true,
          className: `${children.props.className || ''} opacity-50 cursor-not-allowed pointer-events-auto`.trim(),
          onClick: (e: React.MouseEvent) => e.preventDefault(),
        })}
      </span>
    </Tooltip>
  );
}
