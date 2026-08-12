import { useCallback, useEffect, useState } from 'react';
import type {
  DownloadMaterial,
  ProjectNews,
  ProjectPage,
} from '../../../content/types';

type Props = {
  lang: 'uk' | 'en';
  serverUrl: string;
  adminJsonFetch: (url: string, init?: RequestInit) => Promise<Response>;
};
const emptyNews = (): ProjectNews => ({
  id: '',
  slug: '',
  title: '',
  titleEn: '',
  summary: '',
  summaryEn: '',
  body: '',
  bodyEn: '',
  coverImagePath: '',
  status: 'draft',
  pinned: false,
  publishedAt: null,
  sortOrder: 0,
  updatedAt: '',
});
const emptyMaterial = (): DownloadMaterial => ({
  id: '',
  title: '',
  titleEn: '',
  description: '',
  descriptionEn: '',
  category: '',
  version: '',
  filePath: '',
  fileName: '',
  mimeType: '',
  sizeBytes: 0,
  coverImagePath: '',
  published: false,
  sortOrder: 0,
  updatedAt: '',
});
const emptyRules = (): ProjectPage => ({
  key: 'rules',
  title: 'Правила гри',
  titleEn: 'Game rules',
  summary: '',
  summaryEn: '',
  body: '',
  bodyEn: '',
  status: 'draft',
  updatedAt: '',
});
const fileDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const AdminContentPagesTab = ({
  lang,
  serverUrl,
  adminJsonFetch,
}: Props) => {
  const uk = lang === 'uk';
  const [section, setSection] = useState<'news' | 'rules' | 'downloads'>(
    'news',
  );
  const [news, setNews] = useState<ProjectNews[]>([]);
  const [materials, setMaterials] = useState<DownloadMaterial[]>([]);
  const [newsDraft, setNewsDraft] = useState<ProjectNews>(emptyNews);
  const [materialDraft, setMaterialDraft] =
    useState<DownloadMaterial>(emptyMaterial);
  const [rulesDraft, setRulesDraft] = useState<ProjectPage>(emptyRules);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const [newsResponse, rulesResponse, downloadsResponse] = await Promise.all([
      adminJsonFetch(`${serverUrl}/api/admin/content/news`),
      adminJsonFetch(`${serverUrl}/api/admin/content/rules`),
      adminJsonFetch(`${serverUrl}/api/admin/content/downloads`),
    ]);
    if (!newsResponse.ok || !rulesResponse.ok || !downloadsResponse.ok)
      throw new Error('Load failed');
    setNews(
      ((await newsResponse.json()) as { news: ProjectNews[] }).news ?? [],
    );
    setRulesDraft(
      ((await rulesResponse.json()) as { page: ProjectPage | null }).page ??
        emptyRules(),
    );
    setMaterials(
      ((await downloadsResponse.json()) as { materials: DownloadMaterial[] })
        .materials ?? [],
    );
  }, [adminJsonFetch, serverUrl]);
  useEffect(() => {
    void load().catch(() =>
      setMessage(
        uk ? 'Не вдалося завантажити контент.' : 'Could not load content.',
      ),
    );
  }, [load, uk]);
  const request = async (path: string, body: unknown) => {
    const response = await adminJsonFetch(`${serverUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      error?: string;
      path?: string;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
    };
    if (!response.ok || !data.ok)
      throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
      await load();
      setMessage(uk ? 'Зміни збережено.' : 'Changes saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error');
    } finally {
      setBusy(false);
    }
  };
  const uploadNewsImage = async (file?: File) => {
    if (!file) return;
    await run(async () => {
      const result = await request('/api/admin/content/news/image-upload', {
        fileName: file.name,
        dataUrl: await fileDataUrl(file),
      });
      setNewsDraft((current) => ({
        ...current,
        coverImagePath: result.path ?? '',
      }));
    });
  };
  const uploadMaterial = async (file?: File) => {
    if (!file) return;
    await run(async () => {
      const result = await request('/api/admin/content/downloads/upload', {
        fileName: file.name,
        dataUrl: await fileDataUrl(file),
      });
      setMaterialDraft((current) => ({
        ...current,
        filePath: result.path ?? '',
        fileName: file.name,
        mimeType: result.mimeType ?? '',
        sizeBytes: result.sizeBytes ?? 0,
      }));
    });
  };
  const uploadMaterialCover = async (file?: File) => {
    if (!file) return;
    await run(async () => {
      const result = await request(
        '/api/admin/content/downloads/cover-upload',
        { fileName: file.name, dataUrl: await fileDataUrl(file) },
      );
      setMaterialDraft((current) => ({
        ...current,
        coverImagePath: result.path ?? '',
      }));
    });
  };

  return (
    <section className="admin-card admin-content-editor">
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">CONTENT STUDIO</p>
          <h2>{uk ? 'Редактор сторінок' : 'Page editor'}</h2>
          <p>
            {uk
              ? 'Новини зберігаються локально, а матеріали для друку — у GitHub.'
              : 'News stays local; printable materials are tracked in GitHub.'}
          </p>
        </div>
      </div>
      <nav className="admin-detail-tabs">
        <button
          type="button"
          className={section === 'news' ? 'is-active' : ''}
          onClick={() => setSection('news')}
        >
          {uk ? 'Головна / новини' : 'Home / news'}
        </button>
        <button
          type="button"
          className={section === 'rules' ? 'is-active' : ''}
          onClick={() => setSection('rules')}
        >
          {uk ? 'Правила гри' : 'Game rules'}
        </button>
        <button
          type="button"
          className={section === 'downloads' ? 'is-active' : ''}
          onClick={() => setSection('downloads')}
        >
          {uk ? 'Завантажити' : 'Downloads'}
        </button>
      </nav>
      {message ? <p className="status-line">{message}</p> : null}
      {section === 'news' ? (
        <div className="admin-editor-layout">
          <aside className="admin-editor-list">
            <button
              type="button"
              className="primary-button"
              onClick={() => setNewsDraft(emptyNews())}
            >
              + {uk ? 'Нова новина' : 'New article'}
            </button>
            {news.map((item) => (
              <button
                type="button"
                key={item.id}
                className={newsDraft.id === item.id ? 'is-active' : ''}
                onClick={() => setNewsDraft(item)}
              >
                <strong>{item.title}</strong>
                <small>
                  {item.status === 'published'
                    ? uk
                      ? 'Опубліковано'
                      : 'Published'
                    : uk
                      ? 'Чернетка'
                      : 'Draft'}
                </small>
              </button>
            ))}
          </aside>
          <div className="admin-editor-form">
            <div className="admin-form-grid">
              <label>
                {uk ? 'Заголовок' : 'Title'}
                <input
                  value={newsDraft.title}
                  onChange={(e) =>
                    setNewsDraft({ ...newsDraft, title: e.target.value })
                  }
                />
              </label>
              <label>
                Slug
                <input
                  value={newsDraft.slug}
                  onChange={(e) =>
                    setNewsDraft({ ...newsDraft, slug: e.target.value })
                  }
                />
              </label>
              <label>
                {uk ? 'Заголовок англійською' : 'English title'}
                <input
                  value={newsDraft.titleEn}
                  onChange={(e) =>
                    setNewsDraft({ ...newsDraft, titleEn: e.target.value })
                  }
                />
              </label>
              <label>
                {uk ? 'Порядок' : 'Order'}
                <input
                  type="number"
                  value={newsDraft.sortOrder}
                  onChange={(e) =>
                    setNewsDraft({
                      ...newsDraft,
                      sortOrder: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label>
              {uk ? 'Короткий опис' : 'Summary'}
              <textarea
                rows={3}
                value={newsDraft.summary}
                onChange={(e) =>
                  setNewsDraft({ ...newsDraft, summary: e.target.value })
                }
              />
            </label>
            <label>
              {uk ? 'Короткий опис англійською' : 'English summary'}
              <textarea
                rows={3}
                value={newsDraft.summaryEn}
                onChange={(e) =>
                  setNewsDraft({ ...newsDraft, summaryEn: e.target.value })
                }
              />
            </label>
            <label>
              {uk ? 'Текст новини' : 'Article body'}
              <textarea
                rows={10}
                value={newsDraft.body}
                onChange={(e) =>
                  setNewsDraft({ ...newsDraft, body: e.target.value })
                }
              />
            </label>
            <label>
              {uk ? 'Текст англійською' : 'English body'}
              <textarea
                rows={8}
                value={newsDraft.bodyEn}
                onChange={(e) =>
                  setNewsDraft({ ...newsDraft, bodyEn: e.target.value })
                }
              />
            </label>
            <label>
              {uk
                ? 'Обкладинка (локальна, не GitHub)'
                : 'Cover (local, not GitHub)'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void uploadNewsImage(e.target.files?.[0])}
              />
            </label>
            {newsDraft.coverImagePath ? (
              <img
                className="admin-content-preview"
                src={newsDraft.coverImagePath}
                alt=""
              />
            ) : null}
            <div className="admin-inline-options">
              <label>
                <input
                  type="checkbox"
                  checked={newsDraft.status === 'published'}
                  onChange={(e) =>
                    setNewsDraft({
                      ...newsDraft,
                      status: e.target.checked ? 'published' : 'draft',
                    })
                  }
                />{' '}
                {uk ? 'Опубліковано' : 'Published'}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={newsDraft.pinned}
                  onChange={(e) =>
                    setNewsDraft({ ...newsDraft, pinned: e.target.checked })
                  }
                />{' '}
                {uk ? 'Закріпити' : 'Pin'}
              </label>
            </div>
            <div className="admin-actions">
              <button
                disabled={busy || !newsDraft.title}
                type="button"
                className="primary-button"
                onClick={() =>
                  void run(async () => {
                    const data = await request(
                      '/api/admin/content/news/save',
                      newsDraft,
                    );
                    if (data) setNewsDraft(emptyNews());
                  })
                }
              >
                {uk ? 'Зберегти' : 'Save'}
              </button>
              {newsDraft.id ? (
                <button
                  disabled={busy}
                  type="button"
                  className="danger-button"
                  onClick={() =>
                    window.confirm(
                      uk ? 'Видалити новину?' : 'Delete article?',
                    ) &&
                    void run(async () => {
                      await request('/api/admin/content/news/delete', {
                        id: newsDraft.id,
                      });
                      setNewsDraft(emptyNews());
                    })
                  }
                >
                  {uk ? 'Видалити' : 'Delete'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : section === 'rules' ? (
        <div className="admin-editor-layout admin-editor-layout-single">
          <aside className="admin-editor-list">
            <strong>{uk ? 'Сторінка правил' : 'Rules page'}</strong>
            <small>
              {rulesDraft.status === 'published'
                ? uk
                  ? 'Опубліковано'
                  : 'Published'
                : uk
                  ? 'Чернетка'
                  : 'Draft'}
            </small>
            <p>
              {uk
                ? 'Кожне правило відділяйте порожнім рядком.'
                : 'Separate each rule with a blank line.'}
            </p>
          </aside>
          <div className="admin-editor-form">
            <div className="admin-form-grid">
              <label>
                {uk ? 'Заголовок' : 'Title'}
                <input
                  value={rulesDraft.title}
                  onChange={(e) =>
                    setRulesDraft({ ...rulesDraft, title: e.target.value })
                  }
                />
              </label>
              <label>
                {uk ? 'Заголовок англійською' : 'English title'}
                <input
                  value={rulesDraft.titleEn}
                  onChange={(e) =>
                    setRulesDraft({ ...rulesDraft, titleEn: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              {uk ? 'Вступ' : 'Introduction'}
              <textarea
                rows={3}
                value={rulesDraft.summary}
                onChange={(e) =>
                  setRulesDraft({ ...rulesDraft, summary: e.target.value })
                }
              />
            </label>
            <label>
              {uk ? 'Вступ англійською' : 'English introduction'}
              <textarea
                rows={3}
                value={rulesDraft.summaryEn}
                onChange={(e) =>
                  setRulesDraft({ ...rulesDraft, summaryEn: e.target.value })
                }
              />
            </label>
            <label>
              {uk
                ? 'Правила — одне правило на абзац'
                : 'Rules — one rule per paragraph'}
              <textarea
                rows={16}
                value={rulesDraft.body}
                onChange={(e) =>
                  setRulesDraft({ ...rulesDraft, body: e.target.value })
                }
              />
            </label>
            <label>
              {uk ? 'Правила англійською' : 'English rules'}
              <textarea
                rows={16}
                value={rulesDraft.bodyEn}
                onChange={(e) =>
                  setRulesDraft({ ...rulesDraft, bodyEn: e.target.value })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={rulesDraft.status === 'published'}
                onChange={(e) =>
                  setRulesDraft({
                    ...rulesDraft,
                    status: e.target.checked ? 'published' : 'draft',
                  })
                }
              />{' '}
              {uk ? 'Опубліковано' : 'Published'}
            </label>
            <div className="admin-actions">
              <button
                disabled={busy || !rulesDraft.title}
                type="button"
                className="primary-button"
                onClick={() =>
                  void run(async () => {
                    await request('/api/admin/content/rules/save', rulesDraft);
                  })
                }
              >
                {uk ? 'Зберегти правила' : 'Save rules'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="admin-editor-layout">
          <aside className="admin-editor-list">
            <button
              type="button"
              className="primary-button"
              onClick={() => setMaterialDraft(emptyMaterial())}
            >
              + {uk ? 'Новий матеріал' : 'New material'}
            </button>
            {materials.map((item) => (
              <button
                type="button"
                key={item.id}
                className={materialDraft.id === item.id ? 'is-active' : ''}
                onClick={() => setMaterialDraft(item)}
              >
                <strong>{item.title}</strong>
                <small>
                  {item.published
                    ? uk
                      ? 'Опубліковано'
                      : 'Published'
                    : uk
                      ? 'Приховано'
                      : 'Hidden'}
                </small>
              </button>
            ))}
          </aside>
          <div className="admin-editor-form">
            <div className="admin-form-grid">
              <label>
                {uk ? 'Назва' : 'Title'}
                <input
                  value={materialDraft.title}
                  onChange={(e) =>
                    setMaterialDraft({
                      ...materialDraft,
                      title: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                {uk ? 'Назва англійською' : 'English title'}
                <input
                  value={materialDraft.titleEn}
                  onChange={(e) =>
                    setMaterialDraft({
                      ...materialDraft,
                      titleEn: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                {uk ? 'Категорія' : 'Category'}
                <input
                  value={materialDraft.category}
                  onChange={(e) =>
                    setMaterialDraft({
                      ...materialDraft,
                      category: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                {uk ? 'Версія' : 'Version'}
                <input
                  value={materialDraft.version}
                  onChange={(e) =>
                    setMaterialDraft({
                      ...materialDraft,
                      version: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <label>
              {uk ? 'Опис' : 'Description'}
              <textarea
                rows={5}
                value={materialDraft.description}
                onChange={(e) =>
                  setMaterialDraft({
                    ...materialDraft,
                    description: e.target.value,
                  })
                }
              />
            </label>
            <label>
              {uk ? 'Опис англійською' : 'English description'}
              <textarea
                rows={4}
                value={materialDraft.descriptionEn}
                onChange={(e) =>
                  setMaterialDraft({
                    ...materialDraft,
                    descriptionEn: e.target.value,
                  })
                }
              />
            </label>
            <label>
              {uk
                ? 'Файл (PDF, ZIP або зображення; піде у GitHub)'
                : 'File (PDF, ZIP or image; tracked in GitHub)'}
              <input
                type="file"
                accept=".pdf,.zip,image/png,image/jpeg,image/webp"
                onChange={(e) => void uploadMaterial(e.target.files?.[0])}
              />
            </label>
            {materialDraft.filePath ? (
              <code>{materialDraft.filePath}</code>
            ) : null}
            <div className="admin-form-grid">
              <label>
                {uk
                  ? 'Обкладинка (необов’язково, піде у GitHub)'
                  : 'Cover (optional, tracked in GitHub)'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) =>
                    void uploadMaterialCover(e.target.files?.[0])
                  }
                />
              </label>
              <label>
                {uk ? 'Порядок' : 'Order'}
                <input
                  type="number"
                  value={materialDraft.sortOrder}
                  onChange={(e) =>
                    setMaterialDraft({
                      ...materialDraft,
                      sortOrder: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            {materialDraft.coverImagePath ? (
              <img
                className="admin-content-preview"
                src={materialDraft.coverImagePath}
                alt=""
              />
            ) : null}
            <label>
              <input
                type="checkbox"
                checked={materialDraft.published}
                onChange={(e) =>
                  setMaterialDraft({
                    ...materialDraft,
                    published: e.target.checked,
                  })
                }
              />{' '}
              {uk ? 'Опубліковано' : 'Published'}
            </label>
            <p className="admin-note">
              {uk
                ? 'Після збереження відкрийте «Інтеграції» → «Commit + push», щоб файл потрапив на GitHub.'
                : 'After saving, use Integrations → Commit + push to publish the file to GitHub.'}
            </p>
            <div className="admin-actions">
              <button
                disabled={
                  busy || !materialDraft.title || !materialDraft.filePath
                }
                type="button"
                className="primary-button"
                onClick={() =>
                  void run(async () => {
                    await request(
                      '/api/admin/content/downloads/save',
                      materialDraft,
                    );
                    setMaterialDraft(emptyMaterial());
                  })
                }
              >
                {uk ? 'Зберегти' : 'Save'}
              </button>
              {materialDraft.id ? (
                <button
                  disabled={busy}
                  type="button"
                  className="danger-button"
                  onClick={() =>
                    window.confirm(
                      uk
                        ? 'Видалити матеріал і файл?'
                        : 'Delete material and file?',
                    ) &&
                    void run(async () => {
                      await request('/api/admin/content/downloads/delete', {
                        id: materialDraft.id,
                      });
                      setMaterialDraft(emptyMaterial());
                    })
                  }
                >
                  {uk ? 'Видалити' : 'Delete'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
