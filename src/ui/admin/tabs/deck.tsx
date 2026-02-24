import type { ReactNode } from 'react';
import { cardTitle, categoryLabel, text } from '../../i18n';
import { HoverImage } from '../HoverImage';

type T = ReturnType<typeof text>;

export const AdminDeckTab = ({
  t, lang, deckStats, target, setTarget, categoryFilter, setCategoryFilter, categories,
  selectedCardId, setSelectedCardId, filteredCatalog, onAddCard, selectedCard, withCacheBust, imageSrc,
  onShuffleDeck, onResetTemplate, deckBackImageInput, setDeckBackImageInput, onSetDeckBackImage, uploadDeckBackImage,
  sharedDeckTemplate, getImageSrc, beginEdit, onRemoveCard, editTarget, editIndex, inlineEditor,
}: {
  t: T;
  lang: 'uk' | 'en';
  deckStats: { deck: number; discard: number; legendary: number };
  target: 'deck' | 'legendaryDeck';
  setTarget: (v: 'deck' | 'legendaryDeck') => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  categories: string[];
  selectedCardId: string;
  setSelectedCardId: (v: string) => void;
  filteredCatalog: Array<any>;
  onAddCard: (target: 'deck' | 'legendaryDeck', cardId: string) => void;
  selectedCard: any;
  withCacheBust: (value?: string) => string;
  imageSrc: string;
  onShuffleDeck: () => void;
  onResetTemplate: () => void;
  deckBackImageInput: string;
  setDeckBackImageInput: (v: string) => void;
  onSetDeckBackImage: (path?: string) => void;
  uploadDeckBackImage: (file: File | null) => void | Promise<void>;
  sharedDeckTemplate: { deckBackImage?: string; deck: any[]; legendaryDeck: any[] };
  getImageSrc: (card: any) => string;
  beginEdit: (target: 'deck' | 'legendaryDeck', index: number, card: any) => void;
  onRemoveCard: (target: 'deck' | 'legendaryDeck', index: number) => void;
  editTarget: 'deck' | 'legendaryDeck';
  editIndex: number;
  inlineEditor: ReactNode;
}) => (
  <>
    <h3>{t.deckControls}</h3>
    <p>{t.deckCount}: {deckStats.deck} | {t.discardCount}: {deckStats.discard} | {t.legendaryCount}: {deckStats.legendary}</p>
    <p className="admin-controls">
      <select value={target} onChange={(e) => setTarget(e.target.value as 'deck' | 'legendaryDeck')}>
        <option value="deck">{t.mainDeck}</option><option value="legendaryDeck">{t.legendaryDeckLabel}</option>
      </select>
      {target === 'deck' ? (
        <label>{t.categoryFilter}
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="ALL">{t.allCategories}</option>
            {categories.map((cat) => <option key={`filter-${cat}`} value={cat}>{cat}</option>)}
          </select>
        </label>
      ) : null}
      <select value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)}>
        {filteredCatalog.map((card) => <option key={card.id} value={card.id}>{card.id} | {cardTitle(card.id, card.title, lang)}</option>)}
      </select>
      <button type="button" onClick={() => selectedCardId && onAddCard(target, selectedCardId)} disabled={!selectedCardId}>{t.addCardById}</button>
    </p>
    {selectedCard ? (
      <div className="admin-card-preview">
        <p><strong>{cardTitle(selectedCard.id, selectedCard.title, lang)}</strong> ({categoryLabel(selectedCard.category, lang)})</p>
        <HoverImage src={withCacheBust(imageSrc)} alt={cardTitle(selectedCard.id, selectedCard.title, lang)} className="admin-card-preview-image" onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'block'; (e.currentTarget as HTMLImageElement).style.visibility = 'visible'; }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
      </div>
    ) : null}
    <p className="admin-controls">
      <button type="button" onClick={onShuffleDeck}>{t.shuffleDeck}</button>
      <button type="button" onClick={onResetTemplate}>{t.recycleDiscard}</button>
    </p>
    <p className="admin-controls">
      <label>{t.deckBackImageLabel}<input value={deckBackImageInput} onChange={(e) => setDeckBackImageInput(e.target.value)} placeholder="/cards/deck-back.png" /></label>
      <button type="button" onClick={() => onSetDeckBackImage(deckBackImageInput)}>{t.saveCard}</button>
      <label>{t.deckBackImageFile}<input type="file" accept="image/*" onChange={(e) => void uploadDeckBackImage(e.target.files?.[0] ?? null)} /></label>
      <button type="button" onClick={() => onSetDeckBackImage(undefined)}>{t.clearDeckBackImage}</button>
    </p>
    {sharedDeckTemplate.deckBackImage ? <div className="admin-card-preview"><HoverImage src={withCacheBust(sharedDeckTemplate.deckBackImage)} alt={t.deckBackImageLabel} className="admin-card-preview-image" /></div> : null}
    <div className="admin-deck-list">
      {target === 'deck' ? (
        <>
          <h4>{t.mainDeck}</h4>
          <ul>
            {sharedDeckTemplate.deck.map((card, index) => ({ card, index })).filter(({ card }) => categoryFilter === 'ALL' || card.category === categoryFilter).map(({ card, index }) => (
              <li key={`deck-${index}-${card.id}`}>
                <span>
                  <HoverImage src={withCacheBust(getImageSrc(card))} className="admin-thumb" alt={card.id} onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'visible'; (e.currentTarget as HTMLImageElement).style.display = 'inline-block'; }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                  {index + 1}. {card.id} | {cardTitle(card.id, card.title, lang)}{card.effects?.length ? ` | effects: ${card.effects.length}` : ''}
                </span>
                <span className="admin-controls"><button type="button" onClick={() => beginEdit('deck', index, card)}>{t.editCard}</button><button type="button" onClick={() => onRemoveCard('deck', index)}>{t.removeCard}</button></span>
                {editTarget === 'deck' && editIndex === index ? inlineEditor : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {target === 'legendaryDeck' ? (
        <>
          <h4>{t.legendaryDeckLabel}</h4>
          <ul>
            {sharedDeckTemplate.legendaryDeck.map((card, index) => (
              <li key={`legendary-${index}-${card.id}`}>
                <span>
                  <HoverImage src={withCacheBust(getImageSrc(card))} className="admin-thumb" alt={card.id} onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'visible'; (e.currentTarget as HTMLImageElement).style.display = 'inline-block'; }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                  {index + 1}. {card.id} | {cardTitle(card.id, card.title, lang)}{card.effects?.length ? ` | effects: ${card.effects.length}` : ''}
                </span>
                <span className="admin-controls"><button type="button" onClick={() => beginEdit('legendaryDeck', index, card)}>{t.editCard}</button><button type="button" onClick={() => onRemoveCard('legendaryDeck', index)}>{t.removeCard}</button></span>
                {editTarget === 'legendaryDeck' && editIndex === index ? inlineEditor : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  </>
);

