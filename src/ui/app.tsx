import type { ComponentChildren } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { online, route, toast } from './state.ts';
import { IconCareer, IconLearn, IconMore, IconMushaf, IconPractice, IconToday } from './components/icons.tsx';
import { PlayerBar } from './components/PlayerBar.tsx';
import { TodayScreen } from './screens/Today.tsx';
import { updateReady, applyUpdate } from './pwa.ts';

const MushafScreen = lazy(() => import('./screens/Mushaf.tsx'));
const CreditsScreen = lazy(() => import('./screens/Credits.tsx'));
const SettingsScreen = lazy(() => import('./screens/Settings.tsx'));
const MoreScreen = lazy(() => import('./screens/More.tsx'));
const PracticeScreen = lazy(() => import('./screens/Practice.tsx'));
const LearnScreen = lazy(() => import('./screens/Learn.tsx'));
const CareerScreen = lazy(() => import('../career/CareerScreen.tsx'));
const DiagnosticsScreen = lazy(() => import('./screens/Diagnostics.tsx'));
const AudioLabScreen = lazy(() => import('./screens/AudioLab.tsx'));
const SpotCheckScreen = lazy(() => import('./screens/SpotCheck.tsx'));
const PlaceholderScreen = lazy(() => import('./screens/Placeholder.tsx'));

const TABS = [
  { id: 'today', label: 'Today', icon: IconToday },
  { id: 'learn', label: 'Learn', icon: IconLearn },
  { id: 'mushaf', label: 'Mushaf', icon: IconMushaf },
  { id: 'practice', label: 'Practice', icon: IconPractice },
  { id: 'career', label: 'Career', icon: IconCareer },
] as const;

const TITLES: Record<string, string> = {
  today: 'Today',
  learn: 'Learn',
  mushaf: 'Mushaf',
  practice: 'Practice',
  career: 'Career Desk',
  more: 'More',
  settings: 'Settings',
  credits: 'About & Credits',
  diagnostics: 'Diagnostics',
  audio: 'Audio lab',
  'spot-check': 'Kids-split spot check',
  check: 'Check',
  studio: 'Studio',
  library: 'Library',
  progress: 'Progress',
};

function screenFor(top: string): ComponentChildren {
  switch (top) {
    case '':
    case 'today':
      return <TodayScreen />;
    case 'mushaf':
      return <MushafScreen />;
    case 'credits':
      return <CreditsScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'more':
      return <MoreScreen />;
    case 'practice':
      return <PracticeScreen />;
    case 'learn':
      return <LearnScreen />;
    case 'career':
      return <CareerScreen />;
    case 'diagnostics':
      return <DiagnosticsScreen />;
    case 'audio':
      return <AudioLabScreen />;
    case 'spot-check':
      return <SpotCheckScreen />;
    default:
      return <PlaceholderScreen name={top} />;
  }
}

export function App() {
  const top = route.value.parts[0] ?? 'today';
  const activeTab = TABS.some((t) => t.id === top) ? top : top === '' ? 'today' : '';
  return (
    <div class="shell">
      <header class="topbar">
        <h1>{TITLES[top] ?? 'Tilawa Coach'}</h1>
        {!online.value ? <span class="offline-pill" role="status">Offline</span> : null}
        {updateReady.value ? (
          <button class="btn small" onClick={applyUpdate}>
            Update
          </button>
        ) : null}
        <a class="iconbtn" href="#/more" aria-label="More">
          <IconMore />
        </a>
      </header>
      <main class="main" id="main">
        <Suspense fallback={<p class="muted">Loading…</p>}>{screenFor(top)}</Suspense>
      </main>
      <PlayerBar />
      {toast.value ? (
        <div role="status" class="card" style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom) + 70px)', zIndex: 40 }}>
          {toast.value}
        </div>
      ) : null}
      <nav class="bottomnav" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} aria-current={activeTab === t.id ? 'page' : undefined}>
            <t.icon />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
