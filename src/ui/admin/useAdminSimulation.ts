import { useState } from 'react';
import type { SimulationReport } from '../../game/jojGame';

export const useAdminSimulation = (args: {
  onRunSimulations: (
    players: number,
    simulations: number,
    options?: { useMainDeck?: boolean; useLegendaryDeck?: boolean },
  ) => SimulationReport;
}) => {
  const { onRunSimulations } = args;
  const [simulationPlayers, setSimulationPlayers] = useState<number>(4);
  const [simulationCount, setSimulationCount] = useState<number>(500);
  const [simulationUseMainDeck, setSimulationUseMainDeck] = useState<boolean>(true);
  const [simulationUseLegendaryDeck, setSimulationUseLegendaryDeck] = useState<boolean>(true);
  const [simulationReport, setSimulationReport] = useState<SimulationReport | null>(null);
  const [simulationRunning, setSimulationRunning] = useState<boolean>(false);

  const runSimulation = () => {
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
    runSimulation,
  };
};
