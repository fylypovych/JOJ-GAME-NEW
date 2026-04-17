import { useEffect, useState } from 'react';

/**
 * Компонент кнопки "Наверх" для швидкого прокручування сторінки.
 * Відображається тільки коли користувач прокрутив сторінку більше ніж на один екран.
 */
export const ScrollToTop = () => {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > window.innerHeight);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!showScrollTop) return null;

  return (
    <button
      onClick={scrollToTop}
      className="scroll-to-top-button"
      aria-label="Наверх"
      title="Наверх"
    >
      ↑
    </button>
  );
};
