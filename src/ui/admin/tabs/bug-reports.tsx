import { text } from '../../i18n';
import type { AdminBugReportDetail, AdminBugReportListItem, AdminBugReportStatus, AdminBugReportUiVariant } from '../useAdminBugReports';

type T = ReturnType<typeof text>;

const statusLabel = (t: T, value: AdminBugReportStatus) => {
  if (value === 'resolved') return t.bugReportStatusResolved;
  if (value === 'closed') return t.bugReportStatusClosed;
  return t.bugReportStatusNew;
};

const uiVariantLabel = (t: T, value: AdminBugReportUiVariant) => {
  if (value === 'v1') return 'v1';
  if (value === 'v2') return 'v2';
  if (value === 'legacy') return t.bugReportUiLegacy;
  return t.bugReportUiUnknown;
};

export const AdminBugReportsTab = ({
  t,
  reports,
  loading,
  error,
  selectedReportId,
  selectedReport,
  screenshotUrl,
  onSelectReport,
  onMarkResolved,
  onCloseDetails,
}: {
  t: T;
  reports: AdminBugReportListItem[];
  loading: boolean;
  error: string;
  selectedReportId: string;
  selectedReport: AdminBugReportDetail | null;
  screenshotUrl: string;
  onSelectReport: (id: string) => void;
  onMarkResolved: () => void;
  onCloseDetails: () => void;
}) => (
  <>
    <h3>{t.adminBugReportsTitle}</h3>
    <p>{t.adminBugReportsHint}</p>
    {error ? <p className="admin-error">{error}</p> : null}
    <div className="lobby-layout">
      <div className="lobby-col">
        <h4>{t.adminBugReportsListTitle}</h4>
        {reports.length === 0 ? <p>{loading ? t.loading : t.simulationNoData}</p> : (
          <ul className="admin-bug-report-list">
            {reports.map((report) => (
              <li key={`bug-report-${report.id}`} className={`admin-bug-report-row${selectedReportId === report.id ? ' is-selected' : ''}`}>
                <div>
                  <strong>{statusLabel(t, report.status)}</strong>
                  {' · '}
                  <code>{report.id.slice(0, 8)}</code>
                  {' · '}
                  {new Date(report.createdAt).toLocaleString()}
                </div>
                <div>{report.descriptionPreview || '...'}</div>
                <div className="admin-bug-report-meta">
                  {report.playerName ?? t.notSelected}
                  {report.matchID ? ` · ${report.matchID}` : ''}
                  {report.hasScreenshot ? ` · ${t.bugReportHasScreenshot}` : ''}
                </div>
                <p className="admin-controls">
                  <button type="button" onClick={() => onSelectReport(report.id)} disabled={loading}>
                    {t.bugReportOpenDetails}
                  </button>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="lobby-col">
        <h4>{t.adminBugReportsDetailTitle}</h4>
        {!selectedReport ? <p>{t.notSelected}</p> : (
          <div className="admin-bug-report-detail">
            <p><strong>{statusLabel(t, selectedReport.status)}</strong></p>
            <p>{t.createdAt}: {new Date(selectedReport.createdAt).toLocaleString()}</p>
            <p>{t.userDisplayNameLabel}: {selectedReport.playerName ?? '-'}</p>
            <p>{t.activeMatch}: {selectedReport.matchID ?? '-'}</p>
            <p>{t.spectatorMode}: {selectedReport.spectator ? t.yes : t.no}</p>
            <p>{t.gameUiLabel}: {uiVariantLabel(t, selectedReport.uiVariant)}</p>
            <p>{t.language}: {selectedReport.lang === 'en' ? t.langEn : t.langUk}</p>
            <p>{t.userSignedInAs}: {selectedReport.submittedBy.displayName ?? selectedReport.submittedBy.username ?? '-'}</p>
            <p>{t.adminPath}: <code>{selectedReport.pageUrl || '-'}</code></p>
            <p>{t.bugReportReporterIp}: <code>{selectedReport.sourceIp || '-'}</code></p>
            <p>{t.bugReportReporterAgent}: <code>{selectedReport.userAgent || '-'}</code></p>
            <p>{t.bugReportDescriptionLabel}</p>
            <p className="admin-bug-report-description">{selectedReport.description}</p>
            {screenshotUrl ? (
              <p>
                <img className="admin-bug-report-image" src={screenshotUrl} alt={t.bugReportImageAlt} />
              </p>
            ) : null}
            <p className="admin-controls">
              <button type="button" onClick={onCloseDetails} disabled={loading}>
                {t.bugReportClose}
              </button>
              <button type="button" onClick={onMarkResolved} disabled={loading || selectedReport.status === 'resolved'}>
                {t.bugReportResolve}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  </>
);
