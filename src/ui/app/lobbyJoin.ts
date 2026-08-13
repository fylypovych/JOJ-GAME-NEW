export type LobbySeat = { id: number; name?: string };

export const findFirstAvailableLobbySeat = (players: LobbySeat[]) =>
  players.find((player) => !player.name?.trim());
