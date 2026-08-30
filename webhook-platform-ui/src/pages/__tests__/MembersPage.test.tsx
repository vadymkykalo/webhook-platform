import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../i18n';
import { renderPage } from '../../test/renderPage';
import type { MemberResponse } from '../../api/members.api';

vi.mock('../../api/members.api', () => ({
  membersApi: {
    list: vi.fn(),
    add: vi.fn(),
    changeRole: vi.fn(),
    remove: vi.fn(),
    reissueInvite: vi.fn(),
    acceptInvite: vi.fn(),
  },
}));

import MembersPage from '../MembersPage';
import { membersApi } from '../../api/members.api';

const IN_48_HOURS = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

const OWNER: MemberResponse = {
  userId: 'user-1',
  email: 'owner@example.com',
  role: 'OWNER',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
};

const PENDING: MemberResponse = {
  userId: 'user-2',
  email: 'invitee@example.com',
  role: 'DEVELOPER',
  status: 'INVITED',
  createdAt: new Date().toISOString(),
  inviteExpiresAt: IN_48_HOURS,
};

function renderMembers() {
  return renderPage(<MembersPage />, { path: '/members', initialEntry: '/members' });
}

/**
 * An invite in the shipped configuration (EMAIL_ENABLED=false) is never delivered:
 * the token reaches the API container's log and nowhere else. So the owner has to be
 * told that, handed the link, and left able to re-issue or revoke it — none of which
 * the page could do while it showed a green "Invited" toast and a badge with no
 * actions beside it.
 */
describe('MembersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(membersApi.list).mockResolvedValue([OWNER, PENDING]);
  });

  it('offers a pending invite both a re-issue and a revoke', async () => {
    renderMembers();

    expect(await screen.findByRole('button', { name: /Re-issue the invite for invitee@example.com/i }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revoke the invite for invitee@example.com/i }))
      .toBeInTheDocument();
  });

  it('leaves an accepted member with neither', async () => {
    vi.mocked(membersApi.list).mockResolvedValue([
      OWNER,
      { ...PENDING, status: 'ACTIVE', inviteExpiresAt: undefined },
    ]);
    renderMembers();

    await screen.findByText('invitee@example.com');
    expect(screen.queryByRole('button', { name: /Re-issue the invite/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revoke the invite/i })).not.toBeInTheDocument();
  });

  it('shows the fresh link after re-issuing, because nothing was emailed', async () => {
    vi.mocked(membersApi.reissueInvite).mockResolvedValue({
      ...PENDING,
      inviteUrl: 'http://localhost:5173/accept-invite?token=fresh&orgId=org-1',
    });
    renderMembers();

    await userEvent.click(
      await screen.findByRole('button', { name: /Re-issue the invite for invitee@example.com/i })
    );

    await waitFor(() => expect(membersApi.reissueInvite).toHaveBeenCalledWith('org-1', 'user-2'));
    expect(await screen.findByDisplayValue('http://localhost:5173/accept-invite?token=fresh&orgId=org-1'))
      .toBeInTheDocument();
    expect(screen.getByText(/Email delivery is not configured/i)).toBeInTheDocument();
  });

  it('hands the owner the invite link instead of claiming it was sent', async () => {
    vi.mocked(membersApi.add).mockResolvedValue({
      ...PENDING,
      email: 'fresh@example.com',
      inviteUrl: 'http://localhost:5173/accept-invite?token=first&orgId=org-1',
    });
    renderMembers();

    await userEvent.click(await screen.findByRole('button', { name: /Add Member/i }));
    await userEvent.type(await screen.findByLabelText(/^Email$/i), 'fresh@example.com');
    await userEvent.click(screen.getByRole('button', { name: /Add Developer|Add Member/i }));

    expect(await screen.findByDisplayValue('http://localhost:5173/accept-invite?token=first&orgId=org-1'))
      .toBeInTheDocument();
    expect(screen.getByText(/nothing was sent to fresh@example.com/i)).toBeInTheDocument();
  });

  it('revokes a pending invite by removing the membership', async () => {
    vi.mocked(membersApi.remove).mockResolvedValue(undefined);
    renderMembers();

    await userEvent.click(
      await screen.findByRole('button', { name: /Revoke the invite for invitee@example.com/i })
    );
    await userEvent.click(await screen.findByRole('button', { name: /^Revoke invite$/i }));

    await waitFor(() => expect(membersApi.remove).toHaveBeenCalledWith('org-1', 'user-2'));
  });
});
