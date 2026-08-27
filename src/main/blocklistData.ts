/**
 * Ad and tracker domains, grouped by who runs them.
 *
 * Written by hand rather than imported from a published filter list. Every
 * major list — EasyList, AdGuard, DuckDuckGo's Tracker Radar — is either GPL or
 * CC BY-NC-SA, and bundling any of them into an MIT project is a licence
 * conflict rather than a technicality. This list is original work, so the
 * project's licence stays what it says it is.
 *
 * The trade is coverage of the long tail. That matters less than it sounds,
 * because ad and tracking traffic is extremely concentrated: a few dozen
 * domains account for the large majority of what any given page loads. What is
 * missing is the obscure exchange seen on a handful of sites, not the ones you
 * meet everywhere.
 *
 * ## What is deliberately NOT here
 *
 * Blocking these would break pages rather than clean them up, which costs more
 * trust than the blocking wins:
 *
 *   - CDNs (`cdnjs`, `jsdelivr`, `unpkg`) — they serve the page's own code.
 *   - Consent managers (`cookielaw.org`, `cookiebot.com`) — blocking one tends
 *     to leave the page stuck behind a dialog that can never be dismissed.
 *   - Payments, auth and captcha (Stripe, PayPal, `accounts.google.com`,
 *     reCAPTCHA) — blocking these locks people out of their own accounts.
 *   - Fonts, maps and video embeds — visible page content, not advertising.
 *   - Push services like OneSignal, which some sites use for real features.
 *
 * `googletagmanager.com` IS here despite being the most likely single entry to
 * break something, because it is also the most prevalent, and sites that route
 * real functionality through a tag manager are the exception. The per-site off
 * switch exists for exactly that case.
 *
 * Grouped by owner because that is how it stays maintainable — and because the
 * owner name is what the shield popover shows.
 */

const BY_OWNER: Readonly<Record<string, readonly string[]>> = {
  Google: [
    'doubleclick.net',
    'googlesyndication.com',
    'googletagmanager.com',
    'googletagservices.com',
    'googleadservices.com',
    'google-analytics.com',
    'analytics.google.com',
    'adtrafficquality.google',
    'app-measurement.com',
    '2mdn.net',
    'admob.com',
    'adsense.com'
  ],
  Meta: ['facebook.net', 'facebook.com', 'atlassolutions.com'],
  Amazon: ['amazon-adsystem.com', 'assoc-amazon.com', 'graphiq.com'],
  Microsoft: ['adnxs.com', 'clarity.ms', 'atdmt.com', 'msads.net', 'adnxs-simple.com', 'bat.bing.com'],
  Adobe: ['demdex.net', 'omtrdc.net', 'everesttech.net', '2o7.net', 'adobedtm.com'],
  Oracle: ['bluekai.com', 'addthis.com', 'moatads.com', 'krxd.net', 'eloqua.com'],
  'The Trade Desk': ['adsrvr.org'],
  Criteo: ['criteo.com', 'criteo.net'],
  Taboola: ['taboola.com', 'taboolasyndication.com'],
  Outbrain: ['outbrain.com', 'zemanta.com', 'postrelease.com'],
  PubMatic: ['pubmatic.com'],
  Magnite: ['rubiconproject.com', 'magnite.com', 'spotxchange.com', 'spotx.tv'],
  OpenX: ['openx.net', 'openx.com'],
  'Index Exchange': ['indexww.com', 'casalemedia.com'],
  Sovrn: ['lijit.com', 'sovrn.com'],
  'Media.net': ['media.net'],
  Sharethrough: ['sharethrough.com'],
  '33Across': ['33across.com'],
  TripleLift: ['3lift.com'],
  Smartadserver: ['smartadserver.com', 'sascdn.com'],
  Teads: ['teads.tv'],
  GumGum: ['gumgum.com'],
  Yieldmo: ['yieldmo.com'],
  Sonobi: ['sonobi.com'],
  Kargo: ['kargo.com'],
  Smaato: ['smaato.net'],
  InMobi: ['inmobi.com'],
  AppLovin: ['applovin.com'],
  Vungle: ['vungle.com'],
  Chartboost: ['chartboost.com'],
  AdColony: ['adcolony.com'],
  Adform: ['adform.net'],
  AdRoll: ['adroll.com'],
  MediaMath: ['mathtag.com'],
  Conversant: ['dotomi.com', 'dotomi.net', 'fastclick.net'],
  Xandr: ['bidswitch.net'],
  Beeswax: ['bidr.io'],
  Amobee: ['turn.com'],
  Freewheel: ['fwmrm.net'],
  Tremor: ['tremorhub.com', 'springserve.com'],
  'Integral Ad Science': ['adsafeprotected.com', 'iasds01.com'],
  DoubleVerify: ['doubleverify.com', 'dvtps.com'],
  Sizmek: ['serving-sys.com'],
  PulsePoint: ['contextweb.com'],
  LiveRamp: ['rlcdn.com', 'liveramp.com', 'pippio.com'],
  Lotame: ['crwdcntrl.net'],
  Neustar: ['agkn.com'],
  Quantcast: ['quantserve.com', 'quantcount.com'],
  Nielsen: ['imrworldwide.com'],
  Comscore: ['scorecardresearch.com'],
  Chartbeat: ['chartbeat.com', 'chartbeat.net'],
  Parsely: ['parsely.com'],
  Hotjar: ['hotjar.com', 'hotjar.io'],
  Mixpanel: ['mixpanel.com'],
  Segment: ['segment.com', 'segment.io'],
  Amplitude: ['amplitude.com'],
  Heap: ['heap.io', 'heapanalytics.com'],
  FullStory: ['fullstory.com', 'fullstory.net'],
  LogRocket: ['logrocket.com', 'lr-ingest.io'],
  Smartlook: ['smartlook.com'],
  Mouseflow: ['mouseflow.com'],
  Inspectlet: ['inspectlet.com'],
  'Lucky Orange': ['luckyorange.com', 'luckyorange.net'],
  'Crazy Egg': ['crazyegg.com'],
  Contentsquare: ['contentsquare.net', 'clicktale.net'],
  'Quantum Metric': ['quantummetric.com'],
  Glassbox: ['glassboxdigital.io'],
  'New Relic': ['nr-data.net'],
  Optimizely: ['optimizely.com'],
  VWO: ['visualwebsiteoptimizer.com'],
  Tealium: ['tealiumiq.com'],
  Ensighten: ['ensighten.com'],
  Klaviyo: ['klaviyo.com'],
  Braze: ['braze.com', 'appboycdn.com'],
  Iterable: ['iterable.com'],
  HubSpot: ['hs-analytics.net', 'hsadspixel.net'],
  Marketo: ['marketo.net'],
  Bizible: ['bizible.com'],
  Drift: ['drift.com', 'driftt.com'],
  X: ['ads-twitter.com', 'analytics.twitter.com'],
  LinkedIn: ['snap.licdn.com'],
  Pinterest: ['ct.pinterest.com'],
  Snap: ['tr.snapchat.com', 'sc-static.net'],
  TikTok: ['analytics.tiktok.com', 'tiktokw.us'],
  Reddit: ['events.redditmedia.com', 'alb.reddit.com'],
  Yandex: ['mc.yandex.ru', 'yandex-metrica.com'],
  Yahoo: ['advertising.com', 'adtechus.com'],
  Cloudflare: ['cloudflareinsights.com'],
  StatCounter: ['statcounter.com'],
  Histats: ['histats.com'],
  Clicky: ['getclicky.com'],
  ID5: ['id5-sync.com'],
  IntentIQ: ['intentiq.com'],
  'The Trade Desk UID2': ['uidapi.com'],
  Zeotap: ['zeotap.com'],
  Permutive: ['permutive.com', 'permutive.app'],
  Tapad: ['tapad.com'],
  Drawbridge: ['adsymptotic.com'],
  'Simpli.fi': ['simpli.fi'],
  Undertone: ['undertone.com'],
  Exelate: ['exelator.com'],
  Rakuten: ['rkdms.com', 'mediaforge.com'],
  'Adobe Audience Manager': ['nexac.com'],
  Eyeota: ['eyeota.net'],
  Mediavine: ['mediavine.com'],
  Ezoic: ['ezoic.net', 'ezojs.com'],
  Sekindo: ['sekindo.com'],
  ExoClick: ['exoclick.com'],
  PopAds: ['popads.net'],
  PropellerAds: ['propellerads.com'],
  Zedo: ['zedo.com'],
  RevContent: ['revcontent.com'],
  'Content.ad': ['content.ad'],
  Adsterra: ['adsterra.com'],
  BidVertiser: ['bidvertiser.com'],
  Infolinks: ['infolinks.com'],
  Skimlinks: ['skimresources.com', 'skimlinks.com'],
  VigLink: ['viglink.com'],
  Bombora: ['ml314.com'],
  Demandbase: ['demandbase.com'],
  '6sense': ['6sense.com'],
  Terminus: ['terminus.services'],
  Blis: ['blismedia.com'],
  'RTB House': ['creativecdn.com'],
  Improve: ['360yield.com'],
  Adhese: ['adhese.com'],
  Onetag: ['onetag-sys.com'],
  Richaudience: ['richaudience.com'],
  DeepIntent: ['deepintent.com'],
  Sitescout: ['sitescout.com'],
  IPredictive: ['ipredictive.com'],
  'Rocket Fuel': ['rfihub.com'],
  Loopme: ['loopme.me'],
  Verve: ['verve.com'],
  Sovendus: ['sovendus.com'],
  Optad: ['optad360.io'],
  Playwire: ['playwire.com'],
  Nativo: ['ntv.io'],
  Connatix: ['connatix.com'],
  Primis: ['primis.tech'],
  Unruly: ['unrulymedia.com'],
  Vidoomy: ['vidoomy.com'],
  Seedtag: ['seedtag.com'],
  Adyoulike: ['adyoulike.com'],
  Weborama: ['weborama.com'],
  Lotlinx: ['lotlinx.com'],
  Branch: ['branch.io', 'app.link'],
  AppsFlyer: ['appsflyer.com'],
  Adjust: ['adjust.com'],
  Kochava: ['kochava.com'],
  Singular: ['singular.net'],
  Tenjin: ['tenjin.io'],
  Airship: ['urbanairship.com'],
  Leanplum: ['leanplum.com'],
  Localytics: ['localytics.com'],
  Countly: ['count.ly'],
  Flurry: ['flurry.com'],
  Umeng: ['umeng.com', 'umengcloud.com'],
  Tencent: ['tajs.qq.com'],
  Baidu: ['hm.baidu.com', 'baidustatic.com'],
  Piwik: ['piwik.pro'],
  Kissmetrics: ['kissmetrics.com', 'kissmetrics.io'],
  Woopra: ['woopra.com'],
  Pendo: ['pendo.io'],
  Gainsight: ['gainsight.com'],
  Sailthru: ['sailthru.com'],
  Bronto: ['bronto.com'],
  Listrak: ['listrak.com'],
  Cordial: ['cordial.io'],
  Attentive: ['attentivemobile.com'],
  Postscript: ['postscript.io'],
  Yotpo: ['yotpo.com'],
  Bazaarvoice: ['bazaarvoice.com'],
  PowerReviews: ['powerreviews.com'],
  Trustpilot: ['trustpilot.com'],
  Feefo: ['feefo.com'],
  Reevoo: ['reevoo.com'],
  Awin: ['dwin1.com'],
  'CJ Affiliate': ['emjcd.com', 'anrdoezrs.net', 'tqlkg.com', 'jdoqocy.com', 'kqzyfj.com'],
  'Impact Radius': ['impactradius-event.com'],
  Partnerize: ['prf.hn'],
  Webgains: ['webgains.com'],
  Tradedoubler: ['tradedoubler.com'],
  Optimise: ['optimisemedia.com'],
  Adtraction: ['adtraction.com'],
  Refersion: ['refersion.com'],
  Everflow: ['everflow.io']
}

/** Display names, indexed by `TRACKER_DOMAINS`. */
export const TRACKER_OWNERS: readonly string[] = Object.keys(BY_OWNER)

/**
 * Domain -> index into `TRACKER_OWNERS`.
 *
 * Flattened once at load. A subdomain does not need its own entry: the matcher
 * walks parent domains, so `stats.g.doubleclick.net` is covered by
 * `doubleclick.net`.
 */
export const TRACKER_DOMAINS: Readonly<Record<string, number>> = (() => {
  const flat: Record<string, number> = Object.create(null)
  TRACKER_OWNERS.forEach((owner, index) => {
    for (const domain of BY_OWNER[owner]!) flat[domain] = index
  })
  return flat
})()
