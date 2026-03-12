import { useState } from 'react';
import type { Language } from '../i18n';

type AdminJsonFetch = (url: string, init?: RequestInit) => Promise<Response>;

type AdminAward = {
  id: string;
  key: string;
  title: string;
  description: string;
  category: 'general' | 'ranks' | 'resources' | 'actions';
  metric: 'matches_linked' | 'matches_finished' | 'wins' | 'win_rate_pct' | 'avg_turns' | 'best_rank_order' | 'resources_gained_total' | 'resources_lost_total' | 'lyaps_played_on_others' | 'scandals_played_on_others';
  threshold: number;
  badgeLabel: string;
  badgeVariant: 'bronze' | 'silver' | 'gold' | 'special';
  iconPath: string | null;
  active: boolean;
  sortOrder: number;
};

const createAdminAwardsErrors = (lang: Language) => ({
  loadAwards: lang === 'uk' ? 'Не вдалося завантажити нагороди' : 'Failed to load awards',
  saveAward: lang === 'uk' ? 'Не вдалося зберегти нагороду' : 'Failed to save award',
  deleteAward: lang === 'uk' ? 'Не вдалося видалити нагороду' : 'Failed to delete award',
});

export const useAdminAwards = (args: {
  lang: Language;
  serverUrl: string;
  adminJsonFetch: AdminJsonFetch;
}) => {
  const { lang, serverUrl, adminJsonFetch } = args;
  const errors = createAdminAwardsErrors(lang);
  const [adminAwards, setAdminAwards] = useState<AdminAward[]>([]);
  const [adminAwardsLoading, setAdminAwardsLoading] = useState(false);
  const [adminAwardsError, setAdminAwardsError] = useState('');
  const [selectedAdminAwardId, setSelectedAdminAwardId] = useState('');
  const [adminAwardDraft, setAdminAwardDraft] = useState({
    id: '',
    key: '',
    title: '',
    description: '',
    category: 'general' as 'general' | 'ranks' | 'resources' | 'actions',
    metric: 'matches_finished' as AdminAward['metric'],
    threshold: '10',
    badgeLabel: '',
    badgeVariant: 'bronze' as AdminAward['badgeVariant'],
    iconPath: '',
    active: true,
    sortOrder: '0',
  });

  const loadAdminAwards = async () => {
    setAdminAwardsLoading(true);
    setAdminAwardsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/awards`);
      const payload = (await response.json()) as { ok?: boolean; error?: string; awards?: AdminAward[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || errors.loadAwards);
      setAdminAwards(payload.awards ?? []);
    } catch (error) {
      setAdminAwardsError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminAwardsLoading(false);
    }
  };

  const selectAdminAward = (awardId: string) => {
    setSelectedAdminAwardId(awardId);
    const selected = adminAwards.find((award) => award.id === awardId);
    if (!selected) {
      setAdminAwardDraft({
        id: '',
        key: '',
        title: '',
        description: '',
        category: 'general',
        metric: 'matches_finished',
        threshold: '10',
        badgeLabel: '',
        badgeVariant: 'bronze',
        iconPath: '',
        active: true,
        sortOrder: '0',
      });
      return;
    }
    setAdminAwardDraft({
      id: selected.id,
      key: selected.key,
      title: selected.title,
      description: selected.description,
      category: selected.category,
      metric: selected.metric,
      threshold: String(selected.threshold),
      badgeLabel: selected.badgeLabel,
      badgeVariant: selected.badgeVariant,
      iconPath: selected.iconPath ?? '',
      active: selected.active,
      sortOrder: String(selected.sortOrder),
    });
  };

  const saveAdminAward = async () => {
    setAdminAwardsLoading(true);
    setAdminAwardsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/awards/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: adminAwardDraft.id || undefined,
          key: adminAwardDraft.key,
          title: adminAwardDraft.title,
          description: adminAwardDraft.description,
          category: adminAwardDraft.category,
          metric: adminAwardDraft.metric,
          threshold: Number(adminAwardDraft.threshold),
          badgeLabel: adminAwardDraft.badgeLabel,
          badgeVariant: adminAwardDraft.badgeVariant,
          iconPath: adminAwardDraft.iconPath || null,
          active: adminAwardDraft.active,
          sortOrder: Number(adminAwardDraft.sortOrder),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; awards?: AdminAward[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || errors.saveAward);
      setAdminAwards(payload.awards ?? []);
      if (adminAwardDraft.id) selectAdminAward(adminAwardDraft.id);
    } catch (error) {
      setAdminAwardsError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminAwardsLoading(false);
    }
  };

  const deleteAdminAward = async () => {
    if (!adminAwardDraft.id) return;
    setAdminAwardsLoading(true);
    setAdminAwardsError('');
    try {
      const response = await adminJsonFetch(`${serverUrl}/api/admin/awards/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awardId: adminAwardDraft.id }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; awards?: AdminAward[] };
      if (!response.ok || !payload.ok) throw new Error(payload.error || errors.deleteAward);
      setAdminAwards(payload.awards ?? []);
      selectAdminAward('');
    } catch (error) {
      setAdminAwardsError(String(error instanceof Error ? error.message : error));
    } finally {
      setAdminAwardsLoading(false);
    }
  };

  return {
    adminAwards,
    adminAwardsLoading,
    adminAwardsError,
    selectedAdminAwardId,
    adminAwardDraft,
    setAdminAwardDraft,
    loadAdminAwards,
    selectAdminAward,
    saveAdminAward,
    deleteAdminAward,
  };
};
