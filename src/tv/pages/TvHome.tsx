// src/tv/pages/TvHome.tsx

import { memo, useCallback, type ReactNode } from 'react';
import { Car } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SongResult } from '../../types';
import type { ProviderCollection } from '../../types/onlineMusic';
import { TvCarMediaGrid } from '../components/TvCarMediaGrid';
import { TvHeader } from '../components/TvHeader';
import { TvHero } from '../components/TvHero';
import { TvHomeLibraryRows } from '../components/TvHomeLibrarySection';
import { TvMediaRow, TvRowStatus } from '../components/TvMediaRow';
import { TvSongCard } from '../components/TvSongCard';
import type { TvAccountModel } from '../hooks/useTvAccount';
import { useTvHomeFocusPrewarm } from '../hooks/useTvHomeFocusPrewarm';
import type { TvLibraryModel } from '../hooks/useTvLibrary';
import { useTvOnlineHome } from '../hooks/useTvOnlineHome';
import {
    CAR_HOME_ROW_SIZE,
    selectTvCarQueueWindow,
} from '../model/tvCarHome';
import { findTvCarRecentSongIndex } from '../model/tvCarRecentPlays';
import type { TvPlayerModel } from '../model/tvTypes';

const CarQueueSongCard = memo(({
    song,
    queueIndex,
    isCurrent,
    onPlay,
}: {
    song: SongResult;
    queueIndex: number;
    isCurrent: boolean;
    onPlay: (index: number) => void;
}) => {
    const activate = useCallback(() => onPlay(queueIndex), [onPlay, queueIndex]);

    return (
        <TvSongCard
            song={song}
            focusKey={`home-car-queue-${song.id}-${queueIndex}`}
            isCurrent={isCurrent}
            onActivate={activate}
        />
    );
});

export const TvHome = ({
    account,
    library,
    player,
    onActivateHero,
    onOpenAccount,
    onOpenSearch,
    onPlayTracks,
    onOpenCollection,
    carConsole,
    isCar = false,
    inert,
}: {
    account: TvAccountModel;
    library: TvLibraryModel;
    player: TvPlayerModel;
    onActivateHero: () => void;
    onOpenAccount: () => void;
    onOpenSearch: () => void;
    onPlayTracks: (songs: SongResult[], startIndex: number) => void;
    onOpenCollection: (collection: ProviderCollection) => void;
    carConsole?: ReactNode;
    isCar?: boolean;
    inert: boolean;
}) => {
    const { t } = useTranslation();
    const online = useTvOnlineHome(account, !isCar);
    const isPlaying = player.status === 'playing';
    const focusPrewarmKey = !account.isAuthenticated
        ? 'login'
        : library.isLoadingLiked
            ? 'loading'
            : library.likedError
                ? 'error'
                : library.likedSongs.length === 0
                    ? 'empty'
                    : String(library.likedSongs[0].id);
    useTvHomeFocusPrewarm(!inert && !library.isLoadingLiked, focusPrewarmKey);

    const playLocalSong = useCallback((song: SongResult) => {
        const index = library.localSongs.findIndex(candidate => candidate.id === song.id);
        onPlayTracks(library.localSongs, Math.max(0, index));
    }, [library.localSongs, onPlayTracks]);
    const playLikedSong = useCallback((song: SongResult) => {
        const index = library.likedSongs.findIndex(candidate => candidate.id === song.id);
        onPlayTracks(library.likedSongs, Math.max(0, index));
    }, [library.likedSongs, onPlayTracks]);
    const visibleLikedSongs = isCar
        ? library.likedSongs.slice(0, CAR_HOME_ROW_SIZE)
        : library.likedSongs;
    const visibleRecentSongs = isCar
        ? library.recentPlayedSongs.slice(0, CAR_HOME_ROW_SIZE)
        : library.recentLocalSongs;
    const playRecentSong = useCallback((song: SongResult) => {
        const index = findTvCarRecentSongIndex(visibleRecentSongs, song);
        if (index < 0) return;
        onPlayTracks(visibleRecentSongs, index);
    }, [onPlayTracks, visibleRecentSongs]);
    const likedCards = visibleLikedSongs.map(song => (
        <TvSongCard
            key={song.id}
            song={song}
            focusKey={`home-liked-${song.id}`}
            isCurrent={song.id === player.currentSong?.id}
            onActivate={playLikedSong}
        />
    ));
    const MediaSection = isCar ? TvCarMediaGrid : TvMediaRow;
    const recentRow = visibleRecentSongs.length > 0 ? (
        <MediaSection
            title={isCar ? t('home.exploreRecent') : t('tv.home.recent')}
            focusGroup="home-recent"
        >
            {visibleRecentSongs.map(song => (
                <TvSongCard
                    key={song.id}
                    song={song}
                    focusKey={`home-recent-${song.id}`}
                    isCurrent={song.id === player.currentSong?.id}
                    onActivate={isCar ? playRecentSong : playLocalSong}
                />
            ))}
        </MediaSection>
    ) : null;
    const playQueueIndex = useCallback((index: number) => {
        onPlayTracks(player.queue, index);
    }, [onPlayTracks, player.queue]);
    const carQueueWindow = selectTvCarQueueWindow(player.queue, player.currentIndex);
    const carQueueRow = isCar && player.queue.length > 1 ? (
        <TvCarMediaGrid title={t('tv.player.queue')} focusGroup="home-car-queue">
            {carQueueWindow.songs.map((song, offset) => {
                const queueIndex = carQueueWindow.startIndex + offset;
                return (
                    <CarQueueSongCard
                        key={`${song.id}-${queueIndex}`}
                        song={song}
                        queueIndex={queueIndex}
                        isCurrent={queueIndex === player.currentIndex}
                        onPlay={playQueueIndex}
                    />
                );
            })}
        </TvCarMediaGrid>
    ) : null;
    const showCarLikedRow = account.isAuthenticated
        && !library.isLoadingLiked
        && !library.likedError
        && library.likedSongs.length > 0;

    return (
        <div
            id="tv-layer-home"
            data-tv-layer="home"
            className="tv-page tv-home-page"
            inert={inert || undefined}
        >
            <TvHeader
                userName={account.activeAccount?.user?.nickname}
                providerLabel={account.providerLabel}
                isAuthenticated={account.isAuthenticated}
                onOpenAccount={onOpenAccount}
                onOpenSearch={onOpenSearch}
            >
                {isCar ? (
                    <div className="tv-car-header-brand">
                        <span className="tv-car-header-mark" aria-hidden="true">
                            <Car size={26} />
                        </span>
                        <span>
                            <strong>Folia Music</strong>
                            <small>{t('tv.car.title')}</small>
                        </span>
                    </div>
                ) : (
                    <TvHero
                        song={player.currentSong}
                        isAuthenticated={account.isAuthenticated}
                        isPlaying={isPlaying}
                        onActivate={onActivateHero}
                        labels={{
                            chooseSong: t('tv.home.chooseSong'),
                            loginHint: t('tv.home.loginHint'),
                        }}
                    />
                )}
            </TvHeader>
            <main className="tv-home-content" data-tv-focus-container="home-body">
                {isCar ? (
                    <>
                        {carQueueRow}
                        {recentRow}
                        {showCarLikedRow && (
                            <TvCarMediaGrid
                                title={t('tv.home.liked')}
                                focusGroup="home-liked"
                            >
                                {likedCards}
                            </TvCarMediaGrid>
                        )}
                    </>
                ) : (
                    <>
                        <TvMediaRow
                            title={t('tv.home.liked')}
                            focusGroup="home-liked"
                        >
                            {!account.isAuthenticated ? (
                                <TvRowStatus focusKey="home-liked-status">
                                    {t('tv.home.loginForLiked')}
                                </TvRowStatus>
                            ) : library.isLoadingLiked ? (
                                <TvRowStatus focusKey="home-liked-status">
                                    {t('tv.home.loading')}
                                </TvRowStatus>
                            ) : library.likedError ? (
                                <TvRowStatus focusKey="home-liked-status">
                                    {t('tv.home.likedError')}
                                </TvRowStatus>
                            ) : library.likedSongs.length === 0 ? (
                                <TvRowStatus focusKey="home-liked-status">
                                    {t('tv.home.likedEmpty')}
                                </TvRowStatus>
                            ) : likedCards}
                        </TvMediaRow>
                        <TvHomeLibraryRows
                            account={account}
                            playlists={library.playlists}
                            online={online}
                            onPlayTracks={onPlayTracks}
                            onOpenCollection={onOpenCollection}
                        />
                        {recentRow}
                    </>
                )}
            </main>
            {isCar && carConsole && (
                <div className="tv-car-console-dock">{carConsole}</div>
            )}
        </div>
    );
};
