import { useEffect, useState } from 'react';
import { uploadAdminImageDataUrl } from './imageUpload';

export const useAdminPageActions = (args: {
  adminToken: string;
  serverUrl: string;
  activeMatchId: string;
  onStopGame: (matchID: string) => Promise<{ ok: boolean; error?: string }>;
  onExportTemplate: () => string;
  setImportJson: (value: string) => void;
  setAdminActionError: (value: string) => void;
  uploadFailedGeneric: string;
  stateStopGameFailed: string;
  stateStopGameSuccess: string;
}) => {
  const {
    adminToken,
    serverUrl,
    activeMatchId,
    onStopGame,
    onExportTemplate,
    setImportJson,
    setAdminActionError,
    uploadFailedGeneric,
    stateStopGameFailed,
    stateStopGameSuccess,
  } = args;
  const [stopGameRunning, setStopGameRunning] = useState(false);
  const [stopGameError, setStopGameError] = useState('');
  const [stopGameStatus, setStopGameStatus] = useState('');

  const adminHeaders = () => ({ ...(adminToken.trim() ? { 'x-admin-token': adminToken.trim() } : {}) });

  useEffect(() => {
    setStopGameError('');
    setStopGameStatus('');
  }, [activeMatchId]);

  const stopGame = async () => {
    if (!activeMatchId || stopGameRunning) return;
    setStopGameError('');
    setStopGameStatus('');
    setStopGameRunning(true);
    try {
      const result = await onStopGame(activeMatchId);
      if (!result.ok) {
        setStopGameError(result.error ?? stateStopGameFailed);
        return;
      }
      setStopGameStatus(stateStopGameSuccess);
    } catch {
      setStopGameError(stateStopGameFailed);
    } finally {
      setStopGameRunning(false);
    }
  };

  const uploadDataUrl = async (filename: string, dataUrl: string, cardId?: string): Promise<string | null> => {
    const { path, error } = await uploadAdminImageDataUrl({
      serverUrl,
      adminHeaders,
      filename,
      dataUrl,
      cardId,
    });
    if (!path) {
      setAdminActionError(error ?? uploadFailedGeneric);
      return null;
    }
    return path;
  };

  const exportTemplateToFile = () => {
    const json = onExportTemplate();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `joj-shared-deck-template-${stamp}.json`;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setImportJson(json);
  };

  const importTemplateFromFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setImportJson(text);
    };
    reader.readAsText(file);
  };

  return {
    adminHeaders,
    stopGameRunning,
    stopGameError,
    stopGameStatus,
    stopGame,
    uploadDataUrl,
    exportTemplateToFile,
    importTemplateFromFile,
  };
};
