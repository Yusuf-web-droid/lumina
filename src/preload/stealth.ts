import { contextBridge } from 'electron'

/**
 * Makes pages see the same browser the headers claim.
 *
 * Electron's user agent can be rewritten, but two JavaScript-visible facts
 * cannot be fixed from the main process, and Google's sign-in reads both:
 *
 *   navigator.userAgentData.brands — Electron omits the "Google Chrome" entry
 *                                    that real Chrome always includes.
 *   window.chrome                  — present but empty; real Chrome exposes
 *                                    loadTimes(), csi() and app.
 *
 * Together with a Chrome user agent and no client hints, that combination is
 * what "this browser or app may not be secure" is detecting.
 *
 * This preload exposes NOTHING to the page — no contextBridge API, no IPC, no
 * Node. It only runs one patch in the main world before page scripts, so tabs
 * keep their sandbox and stay unable to reach the browser.
 */
contextBridge.executeInMainWorld({
  func: () => {
    // --- navigator.userAgentData.brands -----------------------------------
    const uaData = (navigator as unknown as { userAgentData?: UADataValues }).userAgentData
    if (uaData && Array.isArray(uaData.brands)) {
      const chromium = uaData.brands.find((b) => b.brand === 'Chromium')
      const version = chromium?.version ?? '150'

      if (!uaData.brands.some((b) => b.brand === 'Google Chrome')) {
        const patched = [
          { brand: 'Not;A=Brand', version: '8' },
          { brand: 'Chromium', version },
          { brand: 'Google Chrome', version }
        ]

        try {
          Object.defineProperty(Object.getPrototypeOf(uaData), 'brands', {
            configurable: true,
            enumerable: true,
            // A fresh copy each read, matching how Chrome behaves.
            get: () => patched.map((b) => ({ ...b }))
          })
        } catch {
          /* a locked-down prototype is not worth breaking the page over */
        }

        // getHighEntropyValues must agree with the brands above.
        const original = uaData.getHighEntropyValues?.bind(uaData)
        if (original) {
          try {
            Object.defineProperty(Object.getPrototypeOf(uaData), 'getHighEntropyValues', {
              configurable: true,
              writable: true,
              value: async (hints: string[]) => {
                const result = await original(hints)
                return { ...result, brands: patched.map((b) => ({ ...b })) }
              }
            })
          } catch {
            /* ignore */
          }
        }
      }
    }

    // --- window.chrome ----------------------------------------------------
    const w = window as unknown as Record<string, unknown>
    const chrome = (w['chrome'] as Record<string, unknown> | undefined) ?? {}

    if (typeof chrome['loadTimes'] !== 'function') {
      chrome['loadTimes'] = () => {
        const nav = performance.getEntriesByType('navigation')[0] as
          | PerformanceNavigationTiming
          | undefined
        const start = (nav?.startTime ?? 0) / 1000
        return {
          commitLoadTime: start,
          connectionInfo: 'h2',
          finishDocumentLoadTime: (nav?.domContentLoadedEventEnd ?? 0) / 1000,
          finishLoadTime: (nav?.loadEventEnd ?? 0) / 1000,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: start,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: start,
          startLoadTime: start,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true
        }
      }
    }

    if (typeof chrome['csi'] !== 'function') {
      chrome['csi'] = () => ({
        onloadT: Date.now(),
        pageT: performance.now(),
        startE: Date.now(),
        tran: 15
      })
    }

    if (!chrome['app']) {
      chrome['app'] = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: () => null,
        getIsInstalled: () => false
      }
    }

    w['chrome'] = chrome
  }
})

interface UABrand {
  brand: string
  version: string
}

interface UADataValues {
  brands: UABrand[]
  mobile: boolean
  platform: string
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>
}
