import { useEffect, useState } from 'react';
import type { Language } from '../../i18n';
import { text } from '../../i18n';
import { createBrowserApiClient } from '../httpClient';

type T = ReturnType<typeof text>;

type PublicUserSummary = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  stats: {
    matchesFinished: number;
    wins: number;
    winRatePct: number;
    bestRankName: string;
  };
  awards: Array<{
    awardId: string;
    key: string;
    title: string;
    badgeLabel: string;
    threshold: number;
    progressValue: number;
    awarded: boolean;
  }>;
};

export const UsersListSection = ({ t, lang }: { t: T; lang: Language }) => {
  const [users, setUsers] = useState<PublicUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        setError('');
        const client = createBrowserApiClient();
        const response = await client.get('/api/users?limit=50');
        const data = (await response.json()) as { ok?: boolean; users?: PublicUserSummary[]; error?: string };
        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load users');
        }
        setUsers(data.users ?? []);
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  if (loading) return <p>{t.loading}</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (users.length === 0) return <p>{t.simulationNoData}</p>;

  return (
    <div>
      <h3>{t.statisticsCategoryUsers}</h3>
      <ul>
        {users.map((user) => (
          <li key={`public-user-${user.id}`} style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {user.avatarUrl && <img src={user.avatarUrl} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />}
              <div>
                <strong>{user.displayName}</strong> (@{user.username})
                <br />
                <small>{t.userStatMatchesFinished}: {user.stats.matchesFinished} | {t.userStatWins}: {user.stats.wins} | {t.userStatWinRate}: {user.stats.winRatePct}%</small>
              </div>
            </div>
            {user.awards.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <strong>{t.userAwardsTitle}:</strong>
                <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                  {user.awards.map((award) => (
                    <li key={`user-${user.id}-award-${award.awardId}`}>
                      [{award.badgeLabel}] {award.title} ({Math.min(award.progressValue, award.threshold)}/{award.threshold})
                      {award.awarded ? ` • ${t.userAwardUnlockedLabel}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
