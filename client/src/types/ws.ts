export type Role = 'screen' | 'controller'
export type GameMode = 'classic' | 'zombie' | 'bomb'

export type CharacterType = 'blue' | 'yellow' | 'green' | 'purple' | 'red'

export type PlayerView = {
  id: string
  name: string
  x: number
  y: number
  radius: number
  character?: CharacterType
  vx?: number
  vy?: number
  onGround?: boolean
  isTag?: boolean
  bombCounter?: number
  isEliminated?: boolean
}

export type TileView = {
  id: string
  x: number
  y: number
  w: number
  h: number
  type: string
  className?: string
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
  countdownMs?: number
  tagPlayerId: string | null
  players: PlayerView[]
}

export type GameOverResult = {
  mode: GameMode
  reason: string
  winners: {
    id: string
    name: string
  }[]
  winnersList: {
    id: string
    name: string
  }[]
  losersList: {
    id: string
    name: string
  }[]
}

export type PlayerDeathMessage = {
  type: 'player_death'
  playerId: string
  playerName: string
}

export type AuraTransferMessage = {
  type: 'aura_transfer'
  fromPlayerId: string
  toPlayerId: string
  duration: number
}

export type ServerMessage =
  | { type: 'hello'; message: string }
  | { type: 'joined'; role: Role; playerId?: string; name?: string }
  | { type: 'error'; message: string }
  | { type: 'tag_event'; from: string; to: string }
  | { type: 'game_over'; message: string }
  | { type: 'game_over_result'; result: GameOverResult }
  | { type: 'game_started'; mode: GameMode; arena: { width: number; height: number; floorY: number }; tiles: TileView[] }
  | PlayerDeathMessage
  | AuraTransferMessage
  | LobbyMessage
  | StateMessage
