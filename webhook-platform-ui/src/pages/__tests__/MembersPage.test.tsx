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
    suspend: vi.fn(),
    reinstate: vi.fn(),
    acceptInvite: vi.fn(),
  },
}));

import MembersPage from '../MembersPage';
import { membersApi } from '../../api/members.api';

/** renderPage signs in as an OWNER whose own user id is `user-1`. */
const OWNER: MemberResponse = {
  userId: 'user-1',
  email: 'owner@example.com',
  role: 'OWNER',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
};

const ACTIVE_MEMBER: MemberResponse = {
  userId: 'user-2',
  email: 'dev@example.com',
  role: 'DEVELOPER',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
};

const SUSPENDED_MEMBER: MemberResponse = {
  ...ACTIVE_MEMBER,
  userId: 'user-3',
  email: 'onleave@example.com',
  status: 'DISABLED',
};

function renderMembers() {
  return renderPage(<MembersPage />, { path: '/members', initialEntry: '/members' });
}

describe('MembersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads a suspended member as suspended, not as invited or active', async () => {
    vi.mocked(membersApi.list).mockResolvedValue([OWNER, SUSPENDED_MEMBER]);
    renderMembers();

    const row = (await screen.findByText('onleave@example.com')).closest('tr')!;
    expect(row).toHaveTextContent(/suspended/i);
    expect(row).not.toHaveTextContent(/invited/i);
    expect(row).not.toHaveTextContent(/^active$/i);
  });

  it('suspends a member after a plain confirmation — no name to type, because it is reversible', async () => {
    vi.mocked(membersApi.list).mockResolvedValue([OWNER, ACTIVE_MEMBER]);
    vi.mocked(membersApi.suspend).mockResolvedValue({ ...ACTIVE_MEMBER, status: 'DISABLED' });
    const user = userEvent.setup();
    renderMembers();

    await screen.findByText('dev@example.com');
    await user.click(screen.getByRole('button', { name: /suspend dev@example\.com/i }));

    const dialog = await screen.findByRole('dialog');
    // A DangerConfirmDialog would put a text box here to type the member's name into.
    expect(dialog.querySelector('input')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^suspend$/i }));

    await waitFor(() => expect(membersApi.suspend).toHaveBeenCalledWith('org-1', 'user-2'));
  });

  it('offers reinstating, not suspending, for a member who is already suspended', async () => {
    vi.mocked(membersApi.list).mockResolvedValue([OWNER, SUSPENDED_MEMBER]);
    vi.mocked(membersApi.reinstate).mockResolvedValue({ ...SUSPENDED_MEMBER, status: 'ACTIVE' });
    const user = userEvent.setup();
    renderMembers();

    await screen.findByText('onleave@example.com');
    expect(screen.queryByRole('button', { name: /suspend onleave@example\.com/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /reinstate onleave@example\.com/i }));
    await user.click(await screen.findByRole('button', { name: /^reinstate$/i }));

    await waitFor(() => expect(membersApi.reinstate).toHaveBeenCalledWith('org-1', 'user-3'));
  });

  it('does not offer to suspend the signed-in owner themselves', async () => {
    vi.mocked(membersApi.list).mockResolvedValue([OWNER, ACTIVE_MEMBER]);
    renderMembers();

    await screen.findByText('owner@example.com');
    expect(screen.queryByRole('button', { name: /suspend owner@example\.com/i })).toBeNull();
  });
});
