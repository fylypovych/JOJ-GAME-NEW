import type { T } from './shared';

type AuthErrorModalProps = {
  t: T;
  open: boolean;
  error: string;
  onClose: () => void;
  onOpenReset: () => void;
};

export const AuthErrorModal = ({
  t,
  open,
  error,
  onClose,
  onOpenReset,
}: AuthErrorModalProps) => {
  if (!open) return null;
  return (
    <div className="gameover-modal" role="dialog" aria-label={t.userAuthErrorTitle}>
      <div className="gameover-modal-card">
        <h3>{t.userAuthErrorTitle}</h3>
        <p>{error}</p>
        <p>{t.userAuthErrorResetHint}</p>
        <p className="admin-controls">
          <button type="button" onClick={onOpenReset}>{t.userPasswordResetOpenButton}</button>
          <button type="button" onClick={onClose}>{t.closePopup}</button>
        </p>
      </div>
    </div>
  );
};
