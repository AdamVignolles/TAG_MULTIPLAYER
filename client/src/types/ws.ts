export type Role = 'screen' | 'controller'
export type GameMode = 'classic' | 'turbo'

export type PlayerView = {
  id: string
  name: string
  x: number
  y: number
  radius: number
}

export type TileView = {
  id: string
  x: number
  y: number
  w: number
  h: number
  type: string
}

export type LobbyMessage = {
  type: 'lobby'
  mode: GameMode
  modeLabel: string
  connectedPlayers: number
  started: boolean
}

export type StateMessage = {
  type: 'state'
  mode: GameMode
  arena: { width: number; height: number; floorY: number }
  remainingMs: number
  tagPlayerId: string | null
  players: PlayerView[]
  tiles: TileView[]
}

export type ServerMessage =
  | { type: 'hello'; message: string }
  | { type: 'joined'; role: Role; playerId?: string; name?: string }
  | { type: 'error'; message: string }
  | { type: 'tag_event'; from: string; to: string }
  | { type: 'game_over'; message: string }
  | { type: 'game_started'; mode: GameMode }
  | LobbyMessage
  | StateMessage
