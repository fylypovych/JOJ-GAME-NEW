import React, { useMemo } from 'react';
import { GameBoardV2 } from '../GameBoardV2';
import type { LocalizedBoardProps } from './types';
import { useDeck } from '../providers/DeckContext';
import { useLobby } from '../providers/LobbyContext';
import { useGallery } from '../providers/GalleryContext';

// Wrapper that injects context data into GameBoardV2 props
export const GameBoardV2WithContext = React.memo((props: Omit<LocalizedBoardProps,
  | 'sharedRanks'
  | 'rankTrackCards'
  | 'cardImageById'
  | 'resourceImagePaths'
  | 'roomMeta'
  | 'inviteText'
  | 'shareLink'
  | 'onLeaveRoom'
>) => {
  const { sharedRanks, sharedDeckTemplate } = useDeck();
  const {
    session,
    activeSessionShareLink,
    activeSessionInviteText,
    lobbyGameUiConfig,
    leaveRoom
  } = useLobby();
  const { cardImageById } = useGallery();

  const roomMeta = useMemo(() => session ? {
    matchID: session.matchID,
    playerID: session.playerID,
  } : undefined, [session?.matchID, session?.playerID]);

  return (
    <GameBoardV2
      {...props}
      sharedRanks={sharedRanks}
      rankTrackCards={sharedDeckTemplate.rankTrack}
      cardImageById={cardImageById}
      resourceImagePaths={lobbyGameUiConfig.resourceImagePaths}
      roomMeta={roomMeta}
      inviteText={activeSessionInviteText}
      shareLink={activeSessionShareLink}
      onLeaveRoom={() => { void leaveRoom(); }}
    />
  );
});

GameBoardV2WithContext.displayName = 'GameBoardV2WithContext';
