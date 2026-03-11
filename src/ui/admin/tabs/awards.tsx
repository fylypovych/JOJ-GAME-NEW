import { text } from '../../i18n';

type T = ReturnType<typeof text>;

type AwardMetric =
  | 'matches_linked'
  | 'matches_finished'
  | 'wins'
  | 'win_rate_pct'
  | 'avg_turns'
  | 'best_rank_order'
  | 'resources_gained_total'
  | 'resources_lost_total'
  | 'lyaps_played_on_others'
  | 'scandals_played_on_others';

type AwardDefinition = {
  id: string;
  key: string;
  title: string;
  description: string;
  category: 'general' | 'ranks' | 'resources' | 'actions';
  metric: AwardMetric;
  threshold: number;
  badgeLabel: string;
  badgeVariant: 'bronze' | 'silver' | 'gold' | 'special';
  iconPath: string | null;
  active: boolean;
  sortOrder: number;
};

export const AdminAwardsTab = ({
  t,
  awards,
  loading,
  error,
  selectedAwardId,
  onSelectAwardId,
  draft,
  setDraft,
  onCreateNew,
  onSave,
  onDelete,
}: {
  t: T;
  awards: AwardDefinition[];
  loading: boolean;
  error: string;
  selectedAwardId: string;
  onSelectAwardId: (value: string) => void;
  draft: {
    id: string;
    key: string;
    title: string;
    description: string;
    category: AwardDefinition['category'];
    metric: AwardMetric;
    threshold: string;
    badgeLabel: string;
    badgeVariant: AwardDefinition['badgeVariant'];
    iconPath: string;
    active: boolean;
    sortOrder: string;
  };
  setDraft: (value: {
    id: string;
    key: string;
    title: string;
    description: string;
    category: AwardDefinition['category'];
    metric: AwardMetric;
    threshold: string;
    badgeLabel: string;
    badgeVariant: AwardDefinition['badgeVariant'];
    iconPath: string;
    active: boolean;
    sortOrder: string;
  }) => void;
  onCreateNew: () => void;
  onSave: () => void;
  onDelete: () => void;
}) => (
  <>
    <h3>{t.adminAwardsTitle}</h3>
    <p>{t.adminAwardsHint}</p>
    {error ? <p className="admin-error">{error}</p> : null}
    <div className="lobby-layout">
      <div className="lobby-col">
        <h4>{t.adminAwardsListTitle}</h4>
        <p className="admin-controls">
          <button type="button" onClick={onCreateNew} disabled={loading}>{t.adminAwardsCreateButton}</button>
        </p>
        <p>
          {t.adminAwardsSelectedLabel}{' '}
          <select value={selectedAwardId} onChange={(e) => onSelectAwardId(e.target.value)} disabled={loading}>
            <option value="">{t.notSelected}</option>
            {awards.map((award) => (
              <option key={`award-${award.id}`} value={award.id}>
                {award.title} [{award.badgeLabel}]
              </option>
            ))}
          </select>
        </p>
        {awards.length === 0 ? <p>{t.simulationNoData}</p> : (
          <ul>
            {awards.map((award) => (
              <li key={`award-row-${award.id}`}>
                <strong>{award.title}</strong> ({award.metric} ≥ {award.threshold})
                <br />
                [{award.badgeVariant}] {award.badgeLabel} {award.active ? '' : '(off)'}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="lobby-col">
        <h4>{t.adminAwardsDetailTitle}</h4>
        <p><input value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="award_key" /></p>
        <p><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={t.adminAwardsTitle} /></p>
        <p><textarea className="admin-textarea" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t.adminAwardsDescriptionLabel} /></p>
        <p>
          <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as AwardDefinition['category'] })}>
            <option value="general">general</option>
            <option value="ranks">ranks</option>
            <option value="resources">resources</option>
            <option value="actions">actions</option>
          </select>
          {' '}
          <select value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value as AwardMetric })}>
            <option value="matches_linked">matches_linked</option>
            <option value="matches_finished">matches_finished</option>
            <option value="wins">wins</option>
            <option value="win_rate_pct">win_rate_pct</option>
            <option value="avg_turns">avg_turns</option>
            <option value="best_rank_order">best_rank_order</option>
            <option value="resources_gained_total">resources_gained_total</option>
            <option value="resources_lost_total">resources_lost_total</option>
            <option value="lyaps_played_on_others">lyaps_played_on_others</option>
            <option value="scandals_played_on_others">scandals_played_on_others</option>
          </select>
        </p>
        <p><input value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: e.target.value })} placeholder={t.adminAwardsThresholdLabel} /></p>
        <p><input value={draft.badgeLabel} onChange={(e) => setDraft({ ...draft, badgeLabel: e.target.value })} placeholder={t.adminAwardsBadgeLabel} /></p>
        <p>
          <select value={draft.badgeVariant} onChange={(e) => setDraft({ ...draft, badgeVariant: e.target.value as AwardDefinition['badgeVariant'] })}>
            <option value="bronze">bronze</option>
            <option value="silver">silver</option>
            <option value="gold">gold</option>
            <option value="special">special</option>
          </select>
        </p>
        <p><input value={draft.iconPath} onChange={(e) => setDraft({ ...draft, iconPath: e.target.value })} placeholder={t.adminAwardsIconPathLabel} /></p>
        <p><input value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })} placeholder={t.adminAwardsSortOrderLabel} /></p>
        <p><label><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> {t.adminAwardsActiveLabel}</label></p>
        <p className="admin-controls">
          <button type="button" onClick={onSave} disabled={loading}>{t.adminAwardsSaveButton}</button>
          <button type="button" onClick={onDelete} disabled={loading || !draft.id}>{t.adminAwardsDeleteButton}</button>
        </p>
      </div>
    </div>
  </>
);
