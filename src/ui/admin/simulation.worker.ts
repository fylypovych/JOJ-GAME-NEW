import { importSharedDeckTemplateJson, importSharedRanksJson, runGameSimulationsAggregate } from '../../game/jojGame';
import type { GameMode } from '../../game/types';
import type { SharedGameSetup, SimulationAggregate } from '../../game/jojGame';

type SimulationWorkerRequest = {
  id: number;
  workerIndex: number;
  templateJson: string;
  ranksJson: string;
  players: number;
  simulations: number;
  options?: { gameMode?: GameMode; gameSetup?: Partial<SharedGameSetup> };
};

type SimulationWorkerProgress = {
  id: number;
  workerIndex: number;
  ok: true;
  progress: {
    completed: number;
    total: number;
    pct: number;
    currentMatch: number;
    turnsInCurrentMatch: number;
    maxTurns: number;
  };
};

type SimulationWorkerResponse =
  | { id: number; workerIndex: number; ok: true; aggregate: SimulationAggregate }
  | { id: number; workerIndex: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const message = event.data;
  try {
    let resolvedMaxTurns = 0;
    const templateResult = importSharedDeckTemplateJson(message.templateJson);
    if (!templateResult.ok) {
      const response: SimulationWorkerResponse = {
        id: message.id,
        workerIndex: message.workerIndex,
        ok: false,
        error: templateResult.error
      };
      self.postMessage(response);
      return;
    }
    const ranksResult = importSharedRanksJson(message.ranksJson);
    if (!ranksResult.ok) {
      const response: SimulationWorkerResponse = {
        id: message.id,
        workerIndex: message.workerIndex,
        ok: false,
        error: ranksResult.error
      };
      self.postMessage(response);
      return;
    }
    const aggregate = runGameSimulationsAggregate(message.players, message.simulations, 0, {
      ...message.options,
      onStatus: (status) => {
        const blendedProgress = ((status.completed + Math.min(1, status.turnsInCurrentMatch / Math.max(1, status.maxTurns))) / status.total) * 100;
        const progressMessage: SimulationWorkerProgress = {
          id: message.id,
          workerIndex: message.workerIndex,
          ok: true,
          progress: {
            completed: status.completed,
            total: status.total,
            pct: Math.max(0, Math.min(100, Math.round(blendedProgress))),
            currentMatch: status.currentMatch,
            turnsInCurrentMatch: status.turnsInCurrentMatch,
            maxTurns: status.maxTurns,
          },
        };
        resolvedMaxTurns = status.maxTurns;
        self.postMessage(progressMessage);
      },
      onProgress: (completed, total) => {
        const progressMessage: SimulationWorkerProgress = {
          id: message.id,
          workerIndex: message.workerIndex,
          ok: true,
          progress: {
            completed,
            total,
            pct: Math.max(0, Math.min(100, Math.round((completed / total) * 100))),
            currentMatch: Math.min(total, completed + 1),
            turnsInCurrentMatch: 0,
            maxTurns: resolvedMaxTurns,
          },
        };
        self.postMessage(progressMessage);
      },
    });
    const response: SimulationWorkerResponse = {
      id: message.id,
      workerIndex: message.workerIndex,
      ok: true,
      aggregate
    };
    self.postMessage(response);
  } catch (error) {
    const response: SimulationWorkerResponse = {
      id: message.id,
      workerIndex: message.workerIndex,
      ok: false,
      error: String(error instanceof Error ? error.message : error),
    };
    self.postMessage(response);
  }
};
