const VERSION_PATTERN = /\bv=(\d+\.\d+\.\d+\.\d+)\b/;
const RELEASE_SUMMARY_PATTERN = /^(\d+\.\d+\.\d+\.\d+)(?:\s|$)/;

const parseVersionFromCommitMessage = (message) => {
  const text = String(message ?? '');
  const firstLine = text.split(/\r?\n/, 1)[0].trim();
  const summaryMatch = firstLine.match(RELEASE_SUMMARY_PATTERN);
  if (summaryMatch) return summaryMatch[1];
  const legacyMatch = text.match(VERSION_PATTERN);
  return legacyMatch ? legacyMatch[1] : '';
};

module.exports = {
  VERSION_PATTERN,
  RELEASE_SUMMARY_PATTERN,
  parseVersionFromCommitMessage,
};
