const VERSION_PATTERN = /\bv=(\d+\.\d+\.\d+\.\d+)\b/;

const parseVersionFromCommitMessage = (message) => {
  const text = String(message ?? '');
  const match = text.match(VERSION_PATTERN);
  return match ? match[1] : '';
};

module.exports = {
  VERSION_PATTERN,
  parseVersionFromCommitMessage,
};
