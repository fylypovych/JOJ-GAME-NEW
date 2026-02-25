import { useEffect, useState } from 'react';
import type { SimulationReport } from '../../game/jojGame';

export const useAdminSimulation = (args: {
  onRunSimulations: (
    players: number,
    simulations: number,
    options?: { useMainDeck?: boolean; useLegendaryDeck?: boolean },
  ) => SimulationReport;
  configSignature?: string;
  blockedReason?: string;
}) => {
  const { onRunSimulations, configSignature, blockedReason = '' } = args;
  const [simulationPlayers, setSimulationPlayers] = useState<number>(4);
  const [simulationCount, setSimulationCount] = useState<number>(500);
  const [simulationUseMainDeck, setSimulationUseMainDeck] = useState<boolean>(true);
  const [simulationUseLegendaryDeck, setSimulationUseLegendaryDeck] = useState<boolean>(true);
  const [simulationReport, setSimulationReport] = useState<SimulationReport | null>(null);
  const [simulationRunning, setSimulationRunning] = useState<boolean>(false);
  const [simulationError, setSimulationError] = useState<string>('');

  useEffect(() => {
    setSimulationReport(null);
    setSimulationError('');
  }, [configSignature]);

  const runSimulation = () => {
    if (blockedReason) {
      setSimulationError(blockedReason);
      return;
    }
    setSimulationError('');
    setSimulationRunning(true);
    setTimeout(() => {
      const report = onRunSimulations(simulationPlayers, simulationCount, {
        useMainDeck: simulationUseMainDeck,
        useLegendaryDeck: simulationUseLegendaryDeck,
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
    simulationUseMainDeck,
    setSimulationUseMainDeck,
    simulationUseLegendaryDeck,
    setSimulationUseLegendaryDeck,
    simulationReport,
    simulationRunning,
    simulationError,
    simulationBlockedReason: blockedReason,
    runSimulation,
  };
};
