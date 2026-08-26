import { net } from 'electron'
import { JSONStore } from './store'

/**
 * Open-Meteo: no API key, no account, and no third-party geolocation — the
 * place is one the user typed, so the only thing that leaves the machine is a
 * city name they chose. https://open-meteo.com
 */
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'

/** How long a reading is served from the store before refetching. */
const FRESH_FOR = 15 * 60 * 1000

const TIMEOUT = 8000

export interface WeatherPlace {
  name: string
  /** Region or country, to tell the several Springfields apart. */
  region: string
  latitude: number
  longitude: number
}

export interface WeatherReading {
  celsius: number
  high: number
  low: number
  /** One of the keys the start page draws an icon for. */
  icon: string
  label: string
  at: number
}

export interface WeatherPayload {
  place: WeatherPlace | null
  reading: WeatherReading | null
  /** Set when the last attempt failed; any stored reading is still returned. */
  error?: string
}

interface WeatherData {
  place: WeatherPlace | null
  reading: WeatherReading | null
}

/** WMO weather codes, grouped down to the handful of icons worth drawing. */
const CONDITIONS: Array<[number[], string, string]> = [
  [[0], 'clear', 'Clear'],
  [[1], 'clear', 'Mainly clear'],
  [[2], 'partly', 'Partly cloudy'],
  [[3], 'cloud', 'Overcast'],
  [[45, 48], 'fog', 'Fog'],
  [[51, 53, 55, 56, 57], 'drizzle', 'Drizzle'],
  [[61, 63, 65, 66, 67], 'rain', 'Rain'],
  [[80, 81, 82], 'rain', 'Showers'],
  [[71, 73, 75, 77], 'snow', 'Snow'],
  [[85, 86], 'snow', 'Snow showers'],
  [[95, 96, 99], 'storm', 'Thunderstorm']
]

function condition(code: number): { icon: string; label: string } {
  const match = CONDITIONS.find(([codes]) => codes.includes(code))
  return match ? { icon: match[1], label: match[2] } : { icon: 'cloud', label: 'Unsettled' }
}

async function getJSON(url: string): Promise<unknown> {
  const response = await net.fetch(url, {
    headers: { accept: 'application/json' },
    credentials: 'omit',
    signal: AbortSignal.timeout(TIMEOUT)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/**
 * The start page's weather widget.
 *
 * The reading is kept in userData so the widget draws something immediately on
 * a new tab — and still shows the last known conditions when offline — rather
 * than flashing empty while a request runs.
 */
export class Weather {
  private store = new JSONStore<WeatherData>('weather.json', { place: null, reading: null })

  /** Shared so a burst of new tabs makes one request, not one each. */
  private pending: Promise<WeatherPayload> | null = null

  /** The stored reading, refreshed first if it has gone stale. */
  async current(): Promise<WeatherPayload> {
    const { place, reading } = this.store.get()
    if (!place) return { place: null, reading: null }
    if (reading && Date.now() - reading.at < FRESH_FOR) return { place, reading }

    this.pending ??= this.read(place).finally(() => {
      this.pending = null
    })
    return this.pending
  }

  /** Look up a place by name and report its weather. */
  async setPlace(query: string): Promise<WeatherPayload> {
    const name = query.trim().slice(0, 120)
    if (!name) return { place: null, reading: null, error: 'Enter a town or city' }

    let place: WeatherPlace
    try {
      const url = `${GEOCODE}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`
      const body = (await getJSON(url)) as { results?: Array<Record<string, unknown>> }
      const hit = body.results?.[0]
      if (!hit) return { ...this.store.get(), error: `No place called "${name}"` }

      place = {
        name: String(hit['name'] ?? name),
        region: String(hit['admin1'] ?? hit['country'] ?? ''),
        latitude: Number(hit['latitude']),
        longitude: Number(hit['longitude'])
      }
    } catch (err) {
      console.error('[weather] geocoding failed:', err)
      return { ...this.store.get(), error: 'Could not look that up' }
    }

    this.store.update((d) => {
      d.place = place
      d.reading = null
    })
    return this.read(place)
  }

  /** Forget the place, which also hides the widget's contents. */
  clearPlace(): void {
    this.store.update((d) => {
      d.place = null
      d.reading = null
    })
    this.store.flush()
  }

  private async read(place: WeatherPlace): Promise<WeatherPayload> {
    try {
      const url =
        `${FORECAST}?latitude=${place.latitude}&longitude=${place.longitude}` +
        '&current=temperature_2m,weather_code' +
        '&daily=temperature_2m_max,temperature_2m_min' +
        '&timezone=auto&forecast_days=1'

      const body = (await getJSON(url)) as {
        current?: Record<string, number>
        daily?: Record<string, number[]>
      }

      const celsius = body.current?.['temperature_2m']
      const code = body.current?.['weather_code']
      if (typeof celsius !== 'number' || typeof code !== 'number') {
        throw new Error('unexpected response shape')
      }

      const { icon, label } = condition(code)
      const reading: WeatherReading = {
        celsius,
        high: body.daily?.['temperature_2m_max']?.[0] ?? celsius,
        low: body.daily?.['temperature_2m_min']?.[0] ?? celsius,
        icon,
        label,
        at: Date.now()
      }

      this.store.update((d) => {
        d.reading = reading
      })
      return { place, reading }
    } catch (err) {
      console.error('[weather] forecast failed:', err)
      // Better a stale reading than an empty box.
      return { place, reading: this.store.get().reading, error: 'Could not reach the forecast' }
    }
  }

  flush(): void {
    this.store.flush()
  }
}

let shared: Weather | null = null

export function weatherStore(): Weather {
  if (!shared) shared = new Weather()
  return shared
}
