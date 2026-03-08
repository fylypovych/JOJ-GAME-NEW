import { useEffect, useState } from 'react';
import type { SimulationReport } from '../../game/jojGame';
import type { SharedGameSetup } from '../../game/jojGame';
import type { GameMode } from '../../game/types';

export const useAdminSimulation = (args: {
  onRunSimulations: (
    players: number,
    simulations: number,
    options?: { gameMode?: GameMode; gameSetup?: Partial<SharedGameSetup> },
  ) => SimulationReport;
  optionalModules?: Array<{ id: string; name: string; alwaysOn: boolean }>;
  configSignature?: string;
  blockedReason?: string;
}) => {
  const { onRunSimulations, optionalModules = [], configSignature, blockedReason = '' } = args;
  const [simulationPlayers, setSimulationPlayers] = useState<number>(4);
  const [simulationCount, setSimulationCount] = useState<number>(500);
  const [simulationGameMode, setSimulationGameMode] = useState<GameMode>('standard');
  const [simulationOptionalModuleIds, setSimulationOptionalModuleIds] = useState<string[]>([]);
  const [simulationReport, setSimulationReport] = useState<SimulationReport | null>(null);
  const [simulationRunning, setSimulationRunning] = useState<boolean>(false);
  const [simulationError, setSimulationError] = useState<string>('');

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
    setSimulationError('');
    setSimulationRunning(true);
    setTimeout(() => {
      const report = onRunSimulations(simulationPlayers, simulationCount, {
        gameMode: simulationGameMode,
        gameSetup: {
          optionalMainDeckModuleIds: simulationOptionalModuleIds,
        },
      });
      setSimulationReport(report);
      setSimulationRunning(false);
    }, 0);
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
    simulationBlockedReason: blockedReason,
    runSimulation,
  };
};
