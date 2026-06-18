/**
 * Gestionnaire audio pour la musique de jeu (sonGame.mp3)
 * - Lance la musique quand la partie démarre (compteur passe à 0)
 * - Boucle avec fondu si la partie est encore en cours
 * - Arrête la musique quand la partie se termine
 */

class GameAudioManager {
  private audio: HTMLAudioElement | null = null
  private fadeInterval: ReturnType<typeof setInterval> | null = null
  private loopCheckInterval: ReturnType<typeof setInterval> | null = null
  private isGameRunning = false

  /**
   * Initialise le gestionnaire audio
   */
  init() {
    // Créer l'élément audio au premier appel
    this.getAudioElement()
    console.log('🎵 GameAudioManager initialisé')
  }

  /**
   * Crée ou récupère l'élément audio
   */
  private getAudioElement(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio()
      this.audio.src = '/sonGame.mp3'
      this.audio.preload = 'auto'
      this.audio.loop = false // On gère la boucle manuellement
      this.audio.volume = 0.7
      
      // Event listener pour les erreurs
      this.audio.addEventListener('error', () => {
        console.error('❌ Erreur chargement sonGame.mp3:', this.audio?.error)
      })
      
      this.audio.addEventListener('canplay', () => {
        console.log('✅ Son prêt à jouer, durée:', this.audio?.duration)
      })
    }
    return this.audio
  }

  /**
   * Démarre la musique de jeu avec fondu
   */
  startGameMusic() {
    if (this.isGameRunning) {
      console.log('⏭️  Musique déjà en cours')
      return
    }

    console.log('🎬 Démarrage de la musique de jeu')
    const audio = this.getAudioElement()

    // Réinitialiser et jouer
    audio.currentTime = 0
    audio.volume = 0

    audio
      .play()
      .then(() => {
        console.log('▶️  Musique lancée avec succès')
        this.isGameRunning = true

        // Fade in
        this.fadeVolume(0, 0.7, 400)

        // Vérifier régulièrement si la musique se termine pour la boucler
        if (this.loopCheckInterval) {
          clearInterval(this.loopCheckInterval)
        }
        
        this.loopCheckInterval = setInterval(() => {
          if (
            this.isGameRunning &&
            audio.duration &&
            audio.duration - audio.currentTime < 0.5
          ) {
            console.log('🔄 Redémarrage de la boucle audio')
            this.loopMusic()
          }
        }, 500)
      })
      .catch((err) => {
        console.error('❌ Impossible de jouer sonGame.mp3:', err)
      })
  }

  /**
   * Boucle la musique
   */
  private loopMusic() {
    const audio = this.getAudioElement()

    if (!this.isGameRunning) return

    // Petit fade pour la transition
    this.fadeVolume(audio.volume, 0.7, 200, () => {
      if (this.isGameRunning) {
        audio.currentTime = 0
        audio
          .play()
          .then(() => {
            console.log('🔁 Son relancé')
          })
          .catch((err) => {
            console.error('❌ Erreur relance:', err)
          })
      }
    })
  }

  /**
   * Arrête la musique avec fondu
   */
  stopGameMusic() {
    if (!this.isGameRunning) {
      console.log('⏹️  Musique déjà arrêtée')
      return
    }

    console.log('🛑 Arrêt de la musique de jeu')
    this.isGameRunning = false

    // Arrêter vérification de boucle
    if (this.loopCheckInterval) {
      clearInterval(this.loopCheckInterval)
      this.loopCheckInterval = null
    }

    const audio = this.getAudioElement()

    // Fade out et stop
    this.fadeVolume(audio.volume, 0, 500, () => {
      audio.pause()
      audio.currentTime = 0
      console.log('⏸️  Son arrêté')
    })
  }

  /**
   * Change le volume avec transition douce
   */
  private fadeVolume(
    from: number,
    to: number,
    duration: number,
    callback?: () => void
  ) {
    // Arrêter le fade précédent
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval)
    }

    const audio = this.getAudioElement()
    const steps = 50
    const stepDuration = duration / steps
    let currentStep = 0

    const interval = setInterval(() => {
      // Permettre le fade-out même après stop
      if (!this.isGameRunning && to !== 0) {
        clearInterval(interval)
        return
      }

      currentStep++
      const progress = currentStep / steps
      const currentVolume = from + (to - from) * progress

      audio.volume = Math.max(0, Math.min(1, currentVolume))

      if (currentStep >= steps) {
        clearInterval(interval)
        audio.volume = to
        callback?.()
      }
    }, stepDuration)

    this.fadeInterval = interval
  }

  /**
   * Arrête complètement et nettoie
   */
  dispose() {
    this.stopGameMusic()
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval)
    }
    if (this.loopCheckInterval) {
      clearInterval(this.loopCheckInterval)
    }
    this.audio = null
  }
}

// Singleton
export const gameAudioManager = new GameAudioManager()
gameAudioManager.init()
