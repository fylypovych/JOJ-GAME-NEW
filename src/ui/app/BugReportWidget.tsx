import { useEffect, useMemo, useState } from 'react';
import html2canvas from 'html2canvas';
import type { Session } from './model';
import type { AuthUser } from './useUserAccount';
import { text, type Language } from '../i18n';

const BUG_REPORT_DRAFT_STORAGE_KEY = 'joj-bug-report-draft-v1';

type SavedDraft = {
  description: string;
};

const parseDraft = (): SavedDraft => {
  try {
    const raw = window.localStorage.getItem(BUG_REPORT_DRAFT_STORAGE_KEY);
    if (!raw) return { description: '' };
    const parsed = JSON.parse(raw) as Partial<SavedDraft>;
    return {
      description: typeof parsed.description === 'string' ? parsed.description : '',
    };
  } catch {
    return { description: '' };
  }
};

export const BugReportWidget = ({
  lang,
  serverUrl,
  session,
  user,
  playerName,
  gameUiVariant,
}: {
  lang: Language;
  serverUrl: string;
  session: Session | null;
  user: AuthUser | null;
  playerName: string;
  gameUiVariant: 'v1' | 'v2' | 'v3' | 'v4';
}) => {
  const t = text(lang);
  const initialDraft = useMemo(() => parseDraft(), []);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(initialDraft.description);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [customImageSrc, setCustomImageSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    void fetch(`${serverUrl}/api/bug-reports/ui-config`, { credentials: 'include' })
      .then((response) => response.json().catch(() => ({})))
      .then((payload: { ok?: boolean; imagePath?: string }) => {
        if (cancelled) return;
        const imagePath = payload.ok && typeof payload.imagePath === 'string' ? payload.imagePath.trim() : '';
        setCustomImageSrc(
          imagePath
            ? `${serverUrl}/api/bug-reports/ui-image?path=${encodeURIComponent(imagePath)}&v=${encodeURIComponent(imagePath)}`
            : '',
        );
      })
      .catch(() => {
        if (cancelled) return;
        setCustomImageSrc('');
      });
    return () => {
      cancelled = true;
    };
  }, [serverUrl]);

  useEffect(() => {
    if (!open) return;
    setMessage('');
  }, [open]);

  const saveDraft = () => {
    setSavingDraft(true);
    window.localStorage.setItem(BUG_REPORT_DRAFT_STORAGE_KEY, JSON.stringify({ description }));
    window.setTimeout(() => setSavingDraft(false), 350);
    setMessage(t.bugReportDraftSaved);
  };

  const clearScreenshot = () => {
    setScreenshotDataUrl('');
    setMessage(t.bugReportImageRemoved);
  };

  const captureScreenshot = async () => {
    setCapturing(true);
    setMessage('');
    try {
      const root = document.querySelector('main.app') as HTMLElement | null;
      const canvas = await html2canvas(root ?? document.body, {
        useCORS: true,
        backgroundColor: '#f5f1e8',
        scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
        ignoreElements: (element: Element) => element instanceof HTMLElement && element.dataset.bugReportIgnore === 'true',
      });
      setScreenshotDataUrl(canvas.toDataURL('image/png', 0.92));
      setMessage(t.bugReportScreenshotAttached);
    } catch (error) {
      setMessage(String(error instanceof Error ? error.message : t.bugReportScreenshotFailed));
    } finally {
      setCapturing(false);
    }
  };

  const submitReport = async () => {
    if (description.trim().length < 8) {
      setMessage(t.bugReportDescriptionTooShort);
      return;
    }
    setSending(true);
    setMessage('');
    try {
      const response = await fetch(`${serverUrl}/api/bug-reports`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description,
          screenshotDataUrl: screenshotDataUrl || undefined,
          pageUrl: window.location.href,
          matchID: session?.matchID ?? null,
          playerID: session?.playerID ?? null,
          playerName: playerName.trim() || user?.displayName?.trim() || user?.username?.trim() || null,
          spectator: session?.spectator === true,
          uiVariant: gameUiVariant,
          lang,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || t.bugReportSubmitFailed);
      window.localStorage.removeItem(BUG_REPORT_DRAFT_STORAGE_KEY);
      setDescription('');
      setScreenshotDataUrl('');
      setMessage(t.bugReportSubmitted);
      setOpen(false);
    } catch (error) {
      setMessage(String(error instanceof Error ? error.message : t.bugReportSubmitFailed));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bug-report-widget" data-bug-report-ignore="true">
      <button
        type="button"
        className={`bug-report-fab${customImageSrc ? ' has-custom-image' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t.bugReportFab}
      >
        {customImageSrc ? (
          <img className="bug-report-fab-custom-image" src={customImageSrc} alt={t.bugReportFab} />
        ) : (
          <>
            <span className="bug-report-fab-icon" aria-hidden="true">⚠</span>
            <span className="bug-report-fab-label">{t.bugReportFab}</span>
          </>
        )}
      </button>
      {open ? (
        <div className="bug-report-popover" role="dialog" aria-label={t.bugReportTitle}>
          <div className="bug-report-header">
            <div>
              <strong>{t.bugReportTitle}</strong>
              <div className="bug-report-subtle">{t.bugReportHint}</div>
            </div>
            <button type="button" onClick={() => setOpen(false)}>{t.close}</button>
          </div>
          <textarea
            className="bug-report-textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t.bugReportDescriptionPlaceholder}
          />
          {screenshotDataUrl ? (
            <div className="bug-report-preview-wrap">
              <div className="bug-report-preview-head">
                <strong>{t.bugReportImageAlt}</strong>
              </div>
              <img className="bug-report-preview" src={screenshotDataUrl} alt={t.bugReportImageAlt} />
            </div>
          ) : null}
          {message ? <p className="bug-report-message">{message}</p> : null}
          <p className="bug-report-actions">
            <button type="button" onClick={saveDraft} disabled={savingDraft || sending}>{savingDraft ? `${t.bugReportSave}...` : t.bugReportSave}</button>
            <button type="button" onClick={() => { void captureScreenshot(); }} disabled={capturing || sending}>
              {capturing ? `${t.bugReportAttachImage}...` : t.bugReportAttachImage}
            </button>
            {screenshotDataUrl ? (
              <button type="button" className="ghost" onClick={clearScreenshot} disabled={sending || capturing}>
                {t.bugReportRemoveImage}
              </button>
            ) : null}
            <button type="button" onClick={() => { void submitReport(); }} disabled={sending}>
              {sending ? `${t.bugReportSend}...` : t.bugReportSend}
            </button>
          </p>
        </div>
      ) : null}
    </div>
  );
};
