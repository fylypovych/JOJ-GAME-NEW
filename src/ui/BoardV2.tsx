import type { LocalizedBoardProps } from './board/types';
import { Board } from './Board';
import { text } from './i18n';

export const BoardV2 = (props: LocalizedBoardProps) => {
  const t = text(props.lang ?? 'uk');
  return (
    <div className="game-ui-v2-shell">
      <div className="game-ui-v2-header">
        <div>
          <p className="game-ui-v2-kicker">{t.gameTitle}</p>
          <h2>{props.playerName?.trim() || t.genericPlayer}</h2>
        </div>
        <div className="game-ui-v2-badge">{(props.playerID ?? '0') !== null ? `P${props.playerID ?? '0'}` : 'OBS'}</div>
      </div>
      <Board {...props} />
    </div>
  );
};

