export class ScrollManager {
  private lastUserScrollAt = 0
  private enabledGetter: () => boolean
  private onUserScroll = () => {
    this.lastUserScrollAt = Date.now()
  }

  constructor(enabledGetter: () => boolean) {
    this.enabledGetter = enabledGetter
    window.addEventListener('wheel', this.onUserScroll, { passive: true })
    window.addEventListener('touchmove', this.onUserScroll, { passive: true })
  }

  destroy(): void {
    window.removeEventListener('wheel', this.onUserScroll)
    window.removeEventListener('touchmove', this.onUserScroll)
  }

  maybeScroll(el: HTMLElement): void {
    if (!this.enabledGetter()) return
    if (Date.now() - this.lastUserScrollAt < 5000) return

    const rect = el.getBoundingClientRect()
    const vh = window.innerHeight || document.documentElement.clientHeight
    const topBand = vh * 0.3
    const bottomBand = vh * 0.7
    const centerY = rect.top + rect.height / 2

    if (centerY < topBand || centerY > bottomBand) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    }
  }
}

