import { useEffect, useRef, useState } from 'react';
import {
  buildSimulationReportFromAggregate,
  mergeSimulationAggregates,
  type SimulationAggregate,
  type SimulationReport,
} from '../../game/jojGame';
import type { GameMode } from '../../game/types';

type SimulationWorkerProgress = {
  completed: number;
  total: number;
  pct: number;
  currentMatch: number;
  turnsInCurrentMatch: number;
  maxTurns: number;
};

type SimulationWorkerMessage =
  | { id: number; workerIndex: number; ok: true; aggregate: SimulationAggregate }
  | { id: number; workerIndex: number; ok: false; error: string }
  | { id: number; workerIndex: number; ok: true; progress: SimulationWorkerProgress };

export const useAdminSimulation = (args: {
  optionalModules?: Array<{ id: string; name: string; alwaysOn: boolean }>;
  configSignature?: string;
  blockedReason?: string;
  templateJson: string;
  ranksJson: string;
}) => {
  const { optionalModules = [], configSignature, blockedReason = '', templateJson, ranksJson } = args;
  const [simulationPlayers, setSimulationPlayers] = useState<number>(4);
  const [simulationCount, setSimulationCount] = useState<number>(500);
  const [simulationGameMode, setSimulationGameMode] = useState<GameMode>('standard');
  const [simulationOptionalModuleIds, setSimulationOptionalModuleIds] = useState<string[]>([]);
  const [simulationReport, setSimulationReport] = useState<SimulationReport | null>(null);
  const [simulationRunning, setSimulationRunning] = useState<boolean>(false);
  const [simulationError, setSimulationError] = useState<string>('');
  const [simulationProgressPct, setSimulationProgressPct] = useState<number>(0);
  const [simulationProgressCompleted, setSimulationProgressCompleted] = useState<number>(0);
  const [simulationProgressTotal, setSimulationProgressTotal] = useState<number>(0);
  const [simulationCurrentMatch, setSimulationCurrentMatch] = useState<number>(0);
  const [simulationCurrentTurn, setSimulationCurrentTurn] = useState<number>(0);
  const [simulationCurrentMaxTurns, setSimulationCurrentMaxTurns] = useState<number>(0);
  const requestSeqRef = useRef(0);
  const workersRef = useRef<Worker[]>([]);
  const progressByWorkerRef = useRef<Record<number, SimulationWorkerProgress>>({});
  const aggregateByWorkerRef = useRef<Record<number, SimulationAggregate>>({});
  const expectedWorkersRef = useRef<number>(0);
  const finishedWorkersRef = useRef<number>(0);

  const terminateWorkers = () => {
    workersRef.current.forEach((worker) => worker.terminate());
    workersRef.current = [];
  };

  const updateAggregatedProgress = () => {
    const entries = Object.values(progressByWorkerRef.current);
    if (!entries.length) return;
    const total = entries.reduce((sum, progress) => sum + progress.total, 0);
    const completed = entries.reduce((sum, progress) => sum + progress.completed, 0);
    const blendedCompleted = entries.reduce((sum, progress) => (
      sum
      + progress.completed
      + (progress.completed < progress.total
        ? Math.min(1, progress.turnsInCurrentMatch / Math.max(1, progress.maxTurns))
        : 0)
    ), 0);
    setSimulationProgressTotal(total);
    setSimulationProgressCompleted(completed);
    setSimulationProgressPct(Math.max(0, Math.min(100, Math.round((blendedCompleted / Math.max(1, total)) * 100))));
    setSimulationCurrentMatch(Math.min(total, completed + 1));
    setSimulationCurrentTurn(entries.reduce((max, progress) => Math.max(max, progress.turnsInCurrentMatch), 0));
    setSimulationCurrentMaxTurns(entries.reduce((max, progress) => Math.max(max, progress.maxTurns), 0));
  };

  useEffect(() => () => {
    terminateWorkers();
  }, []);

  useEffect(() => {
    setSimulationReport(null);
    setSimulationError('');
  }, [configSignature]);

  useEffect(() => {
    const alwaysOn = optionalModules.filter((module) => module.alwaysOn).map((module) => module.id);
    setSimulationOptionalModuleIds((prev) => {
      const merged = Array.from(new Set([...prev, ...alwaysOn]));
      const allowed = new Set(optionalModules.map((module) => module.id));
      const next = merged.filter((id) => allowed.has(id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) return prev;
      return next;
    });
  }, [optionalModules]);

  const runSimulation = () => {
    if (blockedReason) {
      setSimulationError(blockedReason);
      return;
    }
    if (typeof Worker === 'undefined') {
      setSimulationError('Simulation worker is not available in this browser.');
      return;
    }
    terminateWorkers();
    setSimulationError('');
    setSimulationReport(null);
    setSimulationRunning(true);
    setSimulationProgressPct(0);
    setSimulationProgressCompleted(0);
    setSimulationProgressTotal(simulationCount);
    setSimulationCurrentMatch(1);
    setSimulationCurrentTurn(0);
    setSimulationCurrentMaxTurns(0);
    requestSeqRef.current += 1;
    progressByWorkerRef.current = {};
    aggregateByWorkerRef.current = {};
    finishedWorkersRef.current = 0;

    const suggestedParallelism = typeof navigator !== 'undefined'
      ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1))
      : 2;
    const workerCount = Math.max(1, Math.min(simulationCount, suggestedParallelism));
    expectedWorkersRef.current = workerCount;

    const baseChunk = Math.floor(simulationCount / workerCount);
    const remainder = simulationCount % workerCount;
    const chunks = Array.from({ length: workerCount }, (_, index) => baseChunk + (index < remainder ? 1 : 0))
      .filter((count) => count > 0);

    chunks.forEach((chunkSize, workerIndex) => {
      const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
      workersRef.current.push(worker);
      progressByWorkerRef.current[workerIndex] = {
        completed: 0,
        total: chunkSize,
        pct: 0,
        currentMatch: 1,
        turnsInCurrentMatch: 0,
        maxTurns: 0,
      };
      worker.onmessage = (event: MessageEvent<SimulationWorkerMessage>) => {
        const payload = event.data;
        if (payload.id !== requestSeqRef.current) return;
        if ('progress' in payload) {
          progressByWorkerRef.current[payload.workerIndex] = payload.progress;
          updateAggregatedProgress();
          return;
        }
        if (!payload.ok) {
          terminateWorkers();
          setSimulationError(payload.error);
          setSimulationRunning(false);
          return;
        }
        aggregateByWorkerRef.current[payload.workerIndex] = payload.aggregate;
        finishedWorkersRef.current += 1;
        progressByWorkerRef.current[payload.workerIndex] = {
          completed: chunks[payload.workerIndex] ?? payload.aggregate.input.simulations,
          total: chunks[payload.workerIndex] ?? payload.aggregate.input.simulations,
          pct: 100,
          currentMatch: chunks[payload.workerIndex] ?? payload.aggregate.input.simulations,
          turnsInCurrentMatch: 0,
          maxTurns: payload.aggregate.input.maxTurns,
        };
        updateAggregatedProgress();
        if (finishedWorkersRef.current < expectedWorkersRef.current) return;
        const mergedAggregate = mergeSimulationAggregates(
          Object.values(aggregateByWorkerRef.current),
        );
        setSimulationReport(buildSimulationReportFromAggregate(mergedAggregate));
        setSimulationRunning(false);
        terminateWorkers();
      };
      worker.postMessage({
        id: requestSeqRef.current,
        workerIndex,
        templateJson,
        ranksJson,
        players: simulationPlayers,
        simulations: chunkSize,
        options: {
          gameMode: simulationGameMode,
          gameSetup: {
            optionalMainDeckModuleIds: simulationOptionalModuleIds,
          },
        },
      });
    });
  };

  return {
    simulationPlayers,
    setSimulationPlayers,
    simulationCount,
    setSimulationCount,
    simulationGameMode,
    setSimulationGameMode,
    simulationOptionalModuleIds,
    setSimulationOptionalModuleIds,
    simulationOptionalModules: optionalModules,
    simulationReport,
    simulationRunning,
    simulationError,
    simulationProgressPct,
    simulationProgressCompleted,
    simulationProgressTotal,
    simulationCurrentMatch,
    simulationCurrentTurn,
    simulationCurrentMaxTurns,
    simulationBlockedReason: blockedReason,
    runSimulation,
  };
};
