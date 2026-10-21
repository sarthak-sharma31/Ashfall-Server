// Players waiting for a match, in groups that can share a room.
// Each group: { id, maps: [map ids it can still go to], players: [...], timer, createdAt }
export const matchmakingState = {
  groups: []
};
