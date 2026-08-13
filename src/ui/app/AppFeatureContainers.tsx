import { Suspense } from 'react';
import type { ComponentProps } from 'react';
import { AdminPage } from '../AdminPage';
import type { Session } from './model';
import { AdminPageContainer } from './AdminPageContainer';
import { BugReportWidget } from './BugReportWidget';
import { NetworkClientV1, NetworkClientV2 } from './networkClients';
import { AuthErrorModal } from './sections/auth-error-modal';
import { PasswordResetSection } from './sections/password-reset-section';
import { RegisterSection } from './sections/register-section';
import {
  GallerySection,
  HomeSection,
  DownloadsSection,
  LobbySection,
  ProfileSection,
  RulesSection,
  StatisticsSection,
} from './sections/index';

export const HomeFeature = ({ visible, ...props }: { visible: boolean } & ComponentProps<typeof HomeSection>) =>
  visible ? <HomeSection {...props} /> : null;

export const DownloadsFeature = ({ visible, ...props }: { visible: boolean } & ComponentProps<typeof DownloadsSection>) =>
  visible ? <DownloadsSection {...props} /> : null;

type LobbyFeatureProps = {
  visible: boolean;
} & ComponentProps<typeof LobbySection>;

export const LobbyFeature = ({ visible, ...props }: LobbyFeatureProps) =>
  visible ? <LobbySection {...props} /> : null;

type ActiveGameFeatureProps = {
  visible: boolean;
  loadingLabel: string;
  gameUiVariant: 'v1' | 'v2';
  session: Session | null;
  lang: ComponentProps<typeof NetworkClientV1>['lang'];
  playerName: string;
  spectatorJoinedLabel: string;
  roomPlayerNames: ComponentProps<typeof NetworkClientV1>['knownPlayerNames'];
};

export const ActiveGameFeature = ({
  visible,
  loadingLabel,
  gameUiVariant,
  session,
  lang,
  playerName,
  spectatorJoinedLabel,
  roomPlayerNames,
}: ActiveGameFeatureProps) => {
  if (!visible || !session) return null;

  const ClientComponent = gameUiVariant === 'v1' ? NetworkClientV1 : NetworkClientV2;
  const playerId = session.spectator ? (null as never) : session.playerID;
  const resolvedPlayerName = session.spectator ? spectatorJoinedLabel : playerName;
  const variantKey = gameUiVariant === 'v1' ? 'v1' : 'v2';

  return (
    <div style={{ display: 'block' }}>
      <Suspense fallback={<p>{loadingLabel}</p>}>
        <ClientComponent
          key={`${session.matchID}:${session.playerID ?? 'spectator'}:${variantKey}`}
          matchID={session.matchID}
          playerID={playerId}
          credentials={session.credentials}
          uiTheme={gameUiVariant}
          lang={lang}
          playerName={resolvedPlayerName}
          knownPlayerNames={roomPlayerNames}
        />
      </Suspense>
    </div>
  );
};

type ProfileFeatureProps = {
  visible: boolean;
} & ComponentProps<typeof ProfileSection>;

export const ProfileFeature = ({ visible, ...props }: ProfileFeatureProps) =>
  visible ? <ProfileSection {...props} /> : null;

type RegisterFeatureProps = {
  visible: boolean;
} & ComponentProps<typeof RegisterSection>;

export const RegisterFeature = ({ visible, ...props }: RegisterFeatureProps) =>
  visible ? <RegisterSection {...props} /> : null;

type PasswordResetFeatureProps = {
  visible: boolean;
} & ComponentProps<typeof PasswordResetSection>;

export const PasswordResetFeature = ({ visible, ...props }: PasswordResetFeatureProps) =>
  visible ? <PasswordResetSection {...props} /> : null;

type StatisticsFeatureProps = {
  visible: boolean;
} & ComponentProps<typeof StatisticsSection>;

export const StatisticsFeature = ({ visible, ...props }: StatisticsFeatureProps) =>
  visible ? <StatisticsSection {...props} /> : null;

type GalleryFeatureProps = {
  visible: boolean;
} & ComponentProps<typeof GallerySection>;

export const GalleryFeature = ({ visible, ...props }: GalleryFeatureProps) =>
  visible ? <GallerySection {...props} /> : null;

type RulesFeatureProps = {
  visible: boolean;
} & ComponentProps<typeof RulesSection>;

export const RulesFeature = ({ visible, ...props }: RulesFeatureProps) =>
  visible ? <RulesSection {...props} /> : null;

type AdminFeatureProps = {
  visible: boolean;
} & Omit<ComponentProps<typeof AdminPageContainer>, 'enabled' | 'Component'>;

export const AdminFeature = ({ visible, ...props }: AdminFeatureProps) =>
  visible ? <AdminPageContainer enabled Component={AdminPage} {...props} /> : null;

type AuthErrorFeatureProps = {
  visible: boolean;
} & ComponentProps<typeof AuthErrorModal>;

export const AuthErrorFeature = ({ visible, ...props }: AuthErrorFeatureProps) =>
  visible ? <AuthErrorModal {...props} /> : null;

type BugReportFeatureProps = {
  visible: boolean;
} & ComponentProps<typeof BugReportWidget>;

export const BugReportFeature = ({ visible, ...props }: BugReportFeatureProps) =>
  visible ? <BugReportWidget {...props} /> : null;
