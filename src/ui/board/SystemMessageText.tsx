import { localizeSystemMessageText, type Language } from '../i18n';
import { splitHighlightedPlayerMessage } from './systemEventMeta';

export const SystemMessageText = (props: {
  text: string;
  lang: Language;
  playerName?: string;
}) => {
  const localizedText = localizeSystemMessageText(props.text, props.lang);
  const parts = splitHighlightedPlayerMessage(localizedText, props.playerName);
  if (!parts) return <>{localizedText}</>;

  return (
    <>
      {parts.before}
      <strong className="system-message-player">{parts.player}</strong>
      {parts.after}
    </>
  );
};
