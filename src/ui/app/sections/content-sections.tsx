import { useEffect, useState } from 'react';
import type { DownloadMaterial, ProjectNews } from '../../../content/types';

const localized = (lang: string, uk: string, en: string) => lang === 'en' && en ? en : uk;

export const HomeSection = ({ serverUrl, lang }: { serverUrl: string; lang: string }) => {
  const [items, setItems] = useState<ProjectNews[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { fetch(`${serverUrl}/api/content/news`).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setItems(((await response.json()) as { news?: ProjectNews[] }).news ?? []);
  }).catch(() => setError(lang === 'en' ? 'Could not load news.' : 'Не вдалося завантажити новини.')); }, [lang, serverUrl]);
  return <section className="content-page">
    <header className="content-page__header"><p className="content-page__eyebrow">JOJ GAME</p><h1>{lang === 'en' ? 'Project news' : 'Новини проєкту'}</h1><p>{lang === 'en' ? 'Updates, announcements and development notes.' : 'Оновлення, оголошення та нотатки про розвиток гри.'}</p></header>
    {error ? <p className="status-line error">{error}</p> : null}
    {!error && items.length === 0 ? <div className="content-empty"><h2>{lang === 'en' ? 'No news yet' : 'Новин поки немає'}</h2></div> : null}
    <div className="news-grid">{items.map((item) => <article key={item.id} className={`news-card${item.pinned ? ' is-pinned' : ''}`}>
      {item.coverImagePath ? <img src={item.coverImagePath} alt="" loading="lazy" /> : null}
      <div className="news-card__body">{item.pinned ? <span className="content-badge">{lang === 'en' ? 'Important' : 'Важливо'}</span> : null}<h2>{localized(lang, item.title, item.titleEn)}</h2>
      {item.publishedAt ? <time>{new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'uk-UA').format(new Date(item.publishedAt))}</time> : null}
      <p className="news-card__summary">{localized(lang, item.summary, item.summaryEn)}</p>
      <div className="news-card__text">{localized(lang, item.body, item.bodyEn).split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></div>
    </article>)}</div>
  </section>;
};

export const DownloadsSection = ({ serverUrl, lang }: { serverUrl: string; lang: string }) => {
  const [items, setItems] = useState<DownloadMaterial[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { fetch(`${serverUrl}/api/content/downloads`).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setItems(((await response.json()) as { materials?: DownloadMaterial[] }).materials ?? []);
  }).catch(() => setError(lang === 'en' ? 'Could not load materials.' : 'Не вдалося завантажити матеріали.')); }, [lang, serverUrl]);
  return <section className="content-page">
    <header className="content-page__header"><p className="content-page__eyebrow">PRINT &amp; PLAY</p><h1>{lang === 'en' ? 'Downloads' : 'Матеріали для завантаження'}</h1><p>{lang === 'en' ? 'Download and print official game materials.' : 'Завантажуйте та друкуйте офіційні матеріали гри.'}</p></header>
    {error ? <p className="status-line error">{error}</p> : null}
    {!error && items.length === 0 ? <div className="content-empty"><h2>{lang === 'en' ? 'Materials are being prepared' : 'Матеріали готуються'}</h2></div> : null}
    <div className="downloads-grid">{items.map((item) => <article key={item.id} className="download-card">
      {item.coverImagePath ? <img src={item.coverImagePath} alt="" loading="lazy" /> : <div className="download-card__placeholder">PDF</div>}
      <div><span className="content-badge">{item.category || (lang === 'en' ? 'Material' : 'Матеріал')}</span><h2>{localized(lang, item.title, item.titleEn)}</h2><p>{localized(lang, item.description, item.descriptionEn)}</p>
      <div className="download-card__meta">{item.version ? <span>v{item.version}</span> : null}{item.sizeBytes ? <span>{(item.sizeBytes / 1024 / 1024).toFixed(1)} MB</span> : null}</div>
      <a className="primary-button" href={item.filePath} download={item.fileName || undefined}>{lang === 'en' ? 'Download' : 'Завантажити'}</a></div>
    </article>)}</div>
  </section>;
};
