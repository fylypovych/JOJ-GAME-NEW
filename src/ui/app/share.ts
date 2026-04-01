export const buildRoomShareLink = (matchID: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set('room', matchID);
  return url.toString();
};

export const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to legacy copy path below.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  try {
    const copied = document.execCommand('copy');
    if (copied) return;
  } finally {
    document.body.removeChild(textarea);
  }
  window.prompt('Copy text', value);
};
